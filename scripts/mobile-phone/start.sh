#!/usr/bin/env bash
# =============================================================================
#  Mobile Phone (Android-x86) in QEMU  ->  noVNC  ->  Cloudflare Quick Tunnel
# =============================================================================
#  What this does:
#    1. Downloads an Android-x86 ISO (a phone/tablet Android that runs on x86)
#    2. Boots it in QEMU in a phone-like portrait resolution (720x1280)
#       - uses KVM hardware acceleration when /dev/kvm is available
#       - falls back to TCG software emulation otherwise (slower, still works)
#    3. Exposes QEMU's VNC display ONLY on localhost:5900, password protected
#    4. Serves noVNC on localhost:6080 (websockify bridge to that VNC)
#    5. Opens a Cloudflare *Quick Tunnel* (no account / no token needed) which
#       prints a random public URL like:
#           https://random-words-here.trycloudflare.com
#    6. You open that URL in any browser, click Connect, type the VNC
#       password, and you are on the phone's screen. Mouse = touch.
#
#  Security notes:
#    * VNC (RFB) passwords are limited to 8 characters by the protocol, so
#      the generated password is exactly 8 chars. Treat the Cloudflare URL
#      itself as a secret too - anyone with URL + password gets the screen.
#    * Nothing is exposed directly on a public port: cloudflared makes an
#      outbound-only connection, and QEMU VNC binds to localhost only.
#    * The VM is ephemeral: when this script / the workflow ends, the phone
#      and its disk are deleted with the runner.
#
#  Env vars (all optional, the workflow sets them from its inputs):
#    VNC_PASSWORD      - if empty, a random 8-char password is generated
#    ANDROID_ISO_URL   - ISO to download (default: Android-x86 9.0-r2 x86_64)
#    RAM_MB            - default 4096
#    CPU_CORES         - default 2
#    DISK_GB           - default 16
#    SESSION_MINUTES   - how long to keep the tunnel up (default 300)
#    WORKDIR_PHONE     - scratch dir (default: $PWD/.phone-vm)
# =============================================================================
set -euo pipefail

RAM_MB="${RAM_MB:-4096}"
CPU_CORES="${CPU_CORES:-2}"
DISK_GB="${DISK_GB:-16}"
SESSION_MINUTES="${SESSION_MINUTES:-300}"
ANDROID_ISO_URL="${ANDROID_ISO_URL:-https://sourceforge.net/projects/android-x86/files/Release%209.0/android-x86_64-9.0-r2.iso/download}"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
NOVNC_PORT=6080
VNC_DISPLAY=0
VNC_PORT=$((5900 + VNC_DISPLAY))

mkdir -p "$WORKDIR_PHONE"
cd "$WORKDIR_PHONE"

# ---------------------------------------------------------------- password ---
# VNC only uses the first 8 characters - enforce that so what we print is
# exactly what works.
if [ -z "${VNC_PASSWORD:-}" ]; then
  VNC_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 8)"
fi
if [ "${#VNC_PASSWORD}" -gt 8 ]; then
  echo "::warning::VNC passwords are truncated to 8 characters by the VNC protocol."
  VNC_PASSWORD="${VNC_PASSWORD:0:8}"
fi
export VNC_PASSWORD

# ------------------------------------------------------------------- ISO -----
ISO_FILE="$WORKDIR_PHONE/android-x86.iso"
if [ ! -s "$ISO_FILE" ]; then
  echo ">>> Downloading Android-x86 ISO..."
  echo "    $ANDROID_ISO_URL"
  # -C - resumes a partial download (workflow caches this file between runs)
  curl -fL -C - --retry 5 --retry-delay 5 -o "$ISO_FILE" "$ANDROID_ISO_URL"
fi
ls -lh "$ISO_FILE"

# ------------------------------------------------------------------ disk -----
DISK_FILE="$WORKDIR_PHONE/phone-disk.qcow2"
if [ ! -f "$DISK_FILE" ]; then
  qemu-img create -f qcow2 "$DISK_FILE" "${DISK_GB}G"
fi

# ------------------------------------------------------------- acceleration --
if [ -w /dev/kvm ]; then
  ACCEL="kvm"
  CPU_MODEL="host"
  echo ">>> KVM available - hardware acceleration ON"
else
  ACCEL="tcg,thread=multi"
  CPU_MODEL="qemu64"
  echo "::warning::/dev/kvm not available - falling back to TCG emulation (slower boot)"
fi

# ------------------------------------------------------------------ QEMU -----
echo ">>> Starting QEMU (Android phone, 720x1280 portrait)..."
rm -f qemu-monitor.sock qemu.pid
qemu-system-x86_64 \
  -name "android-phone" \
  -machine "type=q35,accel=${ACCEL}" \
  -cpu "$CPU_MODEL" \
  -m "$RAM_MB" \
  -smp "$CPU_CORES" \
  -drive "file=${DISK_FILE},format=qcow2,if=virtio,cache=writeback" \
  -cdrom "$ISO_FILE" \
  -boot "order=d,menu=off" \
  -device "VGA,vgamem_mb=64,xres=720,yres=1280" \
  -device "nec-usb-xhci,id=usb" \
  -device "usb-tablet,bus=usb.0" \
  -device "usb-kbd,bus=usb.0" \
  -netdev "user,id=net0,hostfwd=tcp:127.0.0.1:5555-:5555" \
  -device "virtio-net-pci,netdev=net0" \
  -rtc "base=localtime" \
  -display "vnc=127.0.0.1:${VNC_DISPLAY},password=on" \
  -monitor "unix:${WORKDIR_PHONE}/qemu-monitor.sock,server,nowait" \
  -pidfile "${WORKDIR_PHONE}/qemu.pid" \
  -daemonize

# Set the VNC password through the QEMU monitor (must happen before noVNC
# can authenticate). Retry until the monitor socket accepts commands.
echo ">>> Setting VNC password via QEMU monitor..."
for _ in $(seq 1 30); do
  if printf 'change vnc password %s\n' "$VNC_PASSWORD" \
      | socat - "UNIX-CONNECT:${WORKDIR_PHONE}/qemu-monitor.sock" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# The ISO boots to a GRUB menu whose first/default entry is
# "Live CD - Run Android-x86 without installation". Press Enter for the user
# so the phone boots unattended to the Android home setup screen.
echo ">>> Selecting 'Live CD' boot entry..."
sleep 8
printf 'sendkey ret\n' \
  | socat - "UNIX-CONNECT:${WORKDIR_PHONE}/qemu-monitor.sock" >/dev/null 2>&1 || true

# ----------------------------------------------------------------- noVNC -----
echo ">>> Starting noVNC on http://127.0.0.1:${NOVNC_PORT}/vnc.html ..."
# Ubuntu's novnc package installs the web client in /usr/share/novnc.
NOVNC_WEB=""
for d in /usr/share/novnc /usr/local/share/novnc ./noVNC; do
  [ -d "$d" ] && NOVNC_WEB="$d" && break
done
[ -n "$NOVNC_WEB" ] || { echo "::error::noVNC web files not found"; exit 1; }

websockify --web="$NOVNC_WEB" "127.0.0.1:${NOVNC_PORT}" "127.0.0.1:${VNC_PORT}" \
  > websockify.log 2>&1 &
echo $! > websockify.pid

for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:${NOVNC_PORT}/vnc.html" >/dev/null && break
  sleep 1
done

# ------------------------------------------------------- Cloudflare tunnel ---
echo ">>> Starting Cloudflare Quick Tunnel (random trycloudflare.com URL)..."
: > cloudflared.log
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:${NOVNC_PORT}" \
  > cloudflared.log 2>&1 &
echo $! > cloudflared.pid

TUNNEL_URL=""
for _ in $(seq 1 60); do
  TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared.log | head -n1 || true)"
  [ -n "$TUNNEL_URL" ] && break
  sleep 2
done
if [ -z "$TUNNEL_URL" ]; then
  echo "::error::Cloudflare tunnel did not produce a URL. Log:"
  cat cloudflared.log
  exit 1
fi

# ----------------------------------------------------------------- banner ----
banner() {
  cat <<EOF

====================================================================
  📱  YOUR MOBILE PHONE IS LIVE
====================================================================
  Cloudflare URL : ${TUNNEL_URL}/vnc.html?autoconnect=true&resize=scale
  VNC Password   : ${VNC_PASSWORD}

  1. Open the Cloudflare URL above in any browser (phone or PC)
  2. Click "Connect"
  3. Type the VNC password when noVNC asks for it
  4. Mouse click/drag = touch. First boot can take 2-5 minutes
     (pick "Live CD" again if you ever see the boot menu)

  ADB (inside the runner only):  adb connect 127.0.0.1:5555
  Session length: ${SESSION_MINUTES} minutes - cancel the workflow
  run (Actions tab -> this run -> Cancel) to stop the phone early.
====================================================================

EOF
}
banner

# Also publish to the GitHub Actions run summary when running in CI.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## 📱 Mobile Phone (QEMU + noVNC)"
    echo ""
    echo "| | |"
    echo "|---|---|"
    echo "| **Cloudflare URL** | ${TUNNEL_URL}/vnc.html?autoconnect=true&resize=scale |"
    echo "| **VNC password** | \`${VNC_PASSWORD}\` |"
    echo ""
    echo "Open the URL, click **Connect**, enter the password. Mouse = touch."
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "TUNNEL_URL=${TUNNEL_URL}"
    echo "VNC_PASSWORD=${VNC_PASSWORD}"
  } >> "$GITHUB_ENV"
fi

# --------------------------------------------------------------- keep alive --
cleanup() {
  echo ">>> Shutting down phone / tunnel..."
  kill "$(cat cloudflared.pid 2>/dev/null)" "$(cat websockify.pid 2>/dev/null)" 2>/dev/null || true
  [ -f qemu.pid ] && kill "$(cat qemu.pid)" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

DEADLINE=$(( $(date +%s) + SESSION_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! kill -0 "$(cat qemu.pid)" 2>/dev/null; then
    echo "::error::QEMU exited early. Last websockify/cloudflared logs:"
    tail -n 50 websockify.log cloudflared.log || true
    exit 1
  fi
  # Re-print every 5 min so the URL/password are easy to find in live logs.
  banner
  sleep 300
done
echo ">>> Session time over (${SESSION_MINUTES} min) - shutting down."
