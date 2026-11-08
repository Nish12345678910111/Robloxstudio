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
EDITION="${EDITION:-android11}"
if [ -n "${ANDROID_ISO_URL:-}" ]; then
  ISO_BASENAME="custom.iso"
elif [ "$EDITION" = "android9" ]; then
  ANDROID_ISO_URL="https://sourceforge.net/projects/android-x86/files/Release%209.0/android-x86_64-9.0-r2.iso/download"
  ISO_BASENAME="android-x86.iso"
else
  # Bliss OS 14.10.3 (Android 11) Generic x86_64 - official SourceForge build
  EDITION="android11"
  ANDROID_ISO_URL="https://sourceforge.net/projects/blissos-x86/files/Official/BlissOS14/FOSS/Generic/Bliss-v14.10.3-x86_64-OFFICIAL-foss-20241012.iso/download"
  ISO_BASENAME="bliss11.iso"
fi
echo ">>> Android edition: $EDITION"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
NOVNC_PORT=6080
VNC_DISPLAY=0
VNC_PORT=$((5900 + VNC_DISPLAY))

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$WORKDIR_PHONE"
cd "$WORKDIR_PHONE"

# ---------------------------------------------------------------- password ---
# VNC only uses the first 8 characters - enforce that so what we print is
# exactly what works.
if [ -z "${VNC_PASSWORD:-}" ]; then
  # openssl rand -hex 4 = exactly 8 chars, no pipe (a `tr | head -c 8` pipeline
  # dies with "tr: write error: Broken pipe" under `set -o pipefail`).
  VNC_PASSWORD="$(openssl rand -hex 4)"
fi
if [ "${#VNC_PASSWORD}" -gt 8 ]; then
  echo "::warning::VNC passwords are truncated to 8 characters by the VNC protocol."
  VNC_PASSWORD="${VNC_PASSWORD:0:8}"
fi
export VNC_PASSWORD

# ------------------------------------------------------------------- ISO -----
ISO_FILE="$WORKDIR_PHONE/$ISO_BASENAME"
if [ ! -s "$ISO_FILE" ]; then
  echo ">>> Downloading Android-x86 ISO..."
  echo "    $ANDROID_ISO_URL"
  # SourceForge throttles a single connection to ~0.7 MB/s (= 22 min for
  # 921 MB!). aria2 opens 16 parallel ranged connections - usually <1 min.
  # The workflow also saves this file to the Actions cache right after the
  # phone starts, so later phones skip the download entirely.
  if command -v aria2c >/dev/null 2>&1; then
    aria2c -x 16 -s 16 -k 1M --file-allocation=none --max-tries=5 --retry-wait=5 \
      -d "$WORKDIR_PHONE" -o "$(basename "$ISO_FILE")" "$ANDROID_ISO_URL" \
      || curl -fL -C - --retry 5 --retry-delay 5 -o "$ISO_FILE" "$ANDROID_ISO_URL"
  else
    curl -fL -C - --retry 5 --retry-delay 5 -o "$ISO_FILE" "$ANDROID_ISO_URL"
  fi
fi
ls -lh "$ISO_FILE"

# ------------------------------------------------- patch ISO: no setup wizard -
# Android-x86 has ADB-over-TCP OFF and runs the Setup Wizard on first boot, so
# post-boot tricks alone cannot skip it. Instead we patch the boot ramdisk's
# prop.default BEFORE first boot:
#   ro.setupwizard.mode=DISABLED  -> wizard exits instantly, straight to HOME
#   ro.build.characteristics=phone -> phone UI, never tablet UI
#   ro.debuggable / persist.adb.tcp.port -> ADB backup skipper can connect
# and force a portrait phone video mode in the boot config. The result is
# cached as android-phone.iso, so this one-time patch survives re-runs.
PATCHED_ISO="$WORKDIR_PHONE/${ISO_BASENAME%.iso}-phone2.iso"
if [ ! -s "$PATCHED_ISO" ]; then
  if command -v xorriso >/dev/null 2>&1; then
    echo ">>> Patching ISO (disable setup wizard, phone mode, portrait)..."
    TMP_PATCH="$(mktemp -d)"
    cp "$ISO_FILE" "$PATCHED_ISO"
    # Bliss OS doesn't keep ramdisk.img at the ISO root like Android-x86, so
    # extract the whole ISO and FIND it (ramdisk.img first, initrd.img next).
    mkdir -p "$TMP_PATCH/isofs"
    xorriso -osirrox on -indev "$ISO_FILE" -extract / "$TMP_PATCH/isofs" >/dev/null 2>&1 || true
    PATCHED_ANY=0
    for IMG in $(find "$TMP_PATCH/isofs" -type f -name 'ramdisk.img' | sort; find "$TMP_PATCH/isofs" -type f -name 'initrd.img' | sort); do
      REL="/${IMG#$TMP_PATCH/isofs/}"
      echo ">>> Found boot image: $REL"
      rm -rf "$TMP_PATCH/unpack"; mkdir -p "$TMP_PATCH/unpack"
      ( cd "$TMP_PATCH/unpack" && { gzip -dc "$IMG" 2>/dev/null || xz -dc "$IMG" 2>/dev/null || cat "$IMG"; } | cpio -idm --quiet 2>/dev/null ) || true
      PROP_FILE=""
      for f in prop.default default.prop; do
        if [ -f "$TMP_PATCH/unpack/$f" ]; then PROP_FILE="$TMP_PATCH/unpack/$f"; break; fi
      done
      # Only the Android ramdisk carries prop files; skip pure-init images.
      if [ -z "$PROP_FILE" ] && [ "$(basename "$IMG")" = "ramdisk.img" ]; then
        PROP_FILE="$TMP_PATCH/unpack/prop.default"; : > "$PROP_FILE"
      fi
      [ -n "$PROP_FILE" ] || { echo "    (no prop file in $REL - skipping)"; continue; }
      grep -vE '^(ro\.setupwizard\.mode|ro\.build\.characteristics|ro\.debuggable|ro\.adb\.secure|ro\.secure|persist\.adb\.tcp\.port|service\.adb\.tcp\.port|persist\.sys\.usb\.config|sys\.usb\.config)=' "$PROP_FILE" > "$PROP_FILE.tmp" 2>/dev/null || true
      mv "$PROP_FILE.tmp" "$PROP_FILE" || true
      cat >> "$PROP_FILE" <<'PROPS'
ro.setupwizard.mode=DISABLED
ro.build.characteristics=phone
ro.debuggable=1
ro.adb.secure=0
ro.secure=0
persist.adb.tcp.port=5555
service.adb.tcp.port=5555
persist.sys.usb.config=adb
sys.usb.config=adb
PROPS
      ( cd "$TMP_PATCH/unpack" && find . | cpio -o -H newc --quiet 2>/dev/null | gzip -9 ) > "$TMP_PATCH/img-new"
      if [ -s "$TMP_PATCH/img-new" ] && xorriso -dev "$PATCHED_ISO" -boot_image any keep -update "$TMP_PATCH/img-new" "$REL" >/dev/null 2>&1; then
        echo ">>> Patched $REL (setup wizard DISABLED, phone mode, ADB on)"
        PATCHED_ANY=1
      else
        echo "::warning::could not update $REL in ISO"
      fi
    done
    # Force portrait phone resolution in any boot config we can find.
    while IFS= read -r cfg; do
      REL="/${cfg#$TMP_PATCH/isofs/}"
      sed -i 's|initrd=/initrd.img|initrd=/initrd.img video=720x1280|g; s|kernel /kernel|kernel /kernel video=720x1280|g' "$cfg"
      xorriso -dev "$PATCHED_ISO" -boot_image any keep -update "$cfg" "$REL" >/dev/null 2>&1 || true
    done < <(find "$TMP_PATCH/isofs" -type f \( -name 'isolinux.cfg' -o -name 'grub.cfg' \) 2>/dev/null)
    [ "$PATCHED_ANY" = "1" ] || echo "::warning::no patchable ramdisk found - wizard may show, ADB skipper is backup"
    rm -rf "$TMP_PATCH"
    ls -lh "$PATCHED_ISO" || true
  else
    echo "::warning::xorriso not installed - booting unpatched ISO (setup wizard may show)"
  fi
fi
BOOT_ISO="$ISO_FILE"
if [ -s "$PATCHED_ISO" ]; then BOOT_ISO="$PATCHED_ISO"; fi
echo ">>> Booting ISO: $BOOT_ISO"

# ------------------------------------------------------------------ disk -----
DISK_FILE="$WORKDIR_PHONE/phone-disk.qcow2"
if [ ! -f "$DISK_FILE" ]; then
  qemu-img create -f qcow2 "$DISK_FILE" "${DISK_GB}G"
fi

# ------------------------------------------------------------- acceleration --
# NOTE: 'thread=multi' is an ACCELERATOR option, not a machine property.
# (Passing it via -machine ...accel=tcg,thread=multi crashes QEMU >= 9 with
#  "Property 'pc-q35-*.thread' not found" - that was the 39s failure.)
if [ -w /dev/kvm ]; then
  ACCEL_ARGS=(-accel kvm)
  CPU_MODEL="host"
  echo ">>> KVM available - hardware acceleration ON"
else
  ACCEL_ARGS=(-accel tcg,thread=multi)
  CPU_MODEL="max"
  echo "::warning::/dev/kvm not writable - falling back to TCG emulation (slower boot)"
fi

# ------------------------------------------------------------------ QEMU -----
if [ "$EDITION" = "android11" ]; then
  GPU_ARGS=(-device "virtio-vga,xres=720,yres=1280")
else
  GPU_ARGS=(-device "VGA,vgamem_mb=64,xres=720,yres=1280")
fi
echo ">>> Starting QEMU (Android phone, 720x1280 portrait)..."
rm -f qemu-monitor.sock qemu.pid
qemu-system-x86_64 \
  -name "android-phone" \
  -machine "type=q35" \
  "${ACCEL_ARGS[@]}" \
  -cpu "$CPU_MODEL" \
  -m "$RAM_MB" \
  -smp "$CPU_CORES" \
  -drive "file=${DISK_FILE},format=qcow2,if=virtio,cache=writeback" \
  -cdrom "$BOOT_ISO" \
  -boot "order=d,menu=off" \
  ${GPU_ARGS[@]+"${GPU_ARGS[@]}"} \
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

# ------------------------------------------- skip Android first-time setup ---
# Android-x86 first boot opens the Setup Wizard (Google Sign-in). Nobody wants
# that on a cloud phone, so in the background we wait for ADB, mark the device
# as provisioned/setup-complete, disable the wizard packages, force portrait
# phone resolution, and land straight on the HOME launcher screen.
# Runs detached so it never delays the noVNC / Cloudflare tunnel startup.
if command -v adb >/dev/null 2>&1; then
  echo ">>> Setup-skipper armed (will auto-skip the Android setup wizard via ADB)"
  (
    adb kill-server >/dev/null 2>&1 || true
    # Wait up to ~8 min for Android to boot and ADB to come up on :5555.
    for _ in $(seq 1 96); do
      adb connect 127.0.0.1:5555 >/dev/null 2>&1 || true
      BOOTED="$(adb -s 127.0.0.1:5555 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
      [ "$BOOTED" = "1" ] && break
      sleep 5
    done
    S="adb -s 127.0.0.1:5555 shell"
    # Mark setup as already done (this is what dismisses the wizard).
    $S settings put global device_provisioned 1 >/dev/null 2>&1 || true
    $S settings put secure user_setup_complete 1 >/dev/null 2>&1 || true
    $S settings put global setup_wizard_has_run 1 >/dev/null 2>&1 || true
    # Disable every setup-wizard flavour Android-x86 9 may ship.
    for pkg in com.google.android.setupwizard com.android.setupwizard com.android.provision org.lineageos.setupwizard com.bliss.setupwizard org.blissroms.setupwizard; do
      $S pm disable-user --user 0 "$pkg" >/dev/null 2>&1 || true
      $S pm clear "$pkg" >/dev/null 2>&1 || true
    done
    # Straight mobile: portrait 720x1280, no auto-rotate flipping, stay awake.
    # Phone, NOT tablet: 720x1280 @ density 320 = 360dp wide (<600dp), so
    # Android uses its phone UI/launcher instead of the tablet layout.
    $S wm size 720x1280 >/dev/null 2>&1 || true
    $S wm density 320 >/dev/null 2>&1 || true
    $S setprop ro.build.characteristics phone >/dev/null 2>&1 || true
    $S setprop ro.build.type user >/dev/null 2>&1 || true
    $S settings put system accelerometer_rotation 0 >/dev/null 2>&1 || true
    $S settings put system user_rotation 0 >/dev/null 2>&1 || true
    $S svc power stayon true >/dev/null 2>&1 || true
    # Land on the launcher home screen.
    $S input keyevent 3 >/dev/null 2>&1 || true
    $S am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null 2>&1 || true
    echo "setup-skipper: done $(date -u +%FT%TZ)"
  ) > setup-skip.log 2>&1 &
  echo $! > setup-skip.pid
else
  echo "::warning::adb not installed - setup wizard will need one manual 'Skip' tap"
fi

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

# ------------------------------------------- own fast viewer (no noVNC) -----
# viewer.py streams the screen with ADB screenrecord->ffmpeg MJPEG (fast,
# low latency vs VNC) and sends tap/swipe/keyboard/clipboard back over ADB.
# It gets its OWN Cloudflare tunnel; the noVNC tunnel above stays as fallback.
VIEWER_URL=""
if [ -f "$REPO_ROOT/scripts/mobile-phone/viewer.py" ] && command -v ffmpeg >/dev/null 2>&1; then
  echo ">>> Starting own fast viewer on 127.0.0.1:8081 ..."
  PHONE_PASSWORD="$VNC_PASSWORD" VIEWER_PORT=8081 python3 "$REPO_ROOT/scripts/mobile-phone/viewer.py" > viewer.log 2>&1 &
  echo $! > viewer.pid
  sleep 2
  : > cloudflared-viewer.log
  cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:8081" > cloudflared-viewer.log 2>&1 &
  echo $! > cloudflared-viewer.pid
  for _ in $(seq 1 45); do
    VIEWER_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-viewer.log | head -n1 || true)"
    [ -n "$VIEWER_URL" ] && break
    sleep 2
  done
  echo ">>> Viewer URL: ${VIEWER_URL:-FAILED (noVNC fallback still works)}"
else
  echo "::warning::viewer.py/ffmpeg missing - dashboard will use noVNC fallback"
fi

# ------------------------------------------------------- report phone info ---
# Used by the NishCloudPhone dashboard: it downloads this file as a GitHub
# Actions artifact (auth-only, never committed to this PUBLIC repo) to learn
# the tunnel URL + password for this phone.
PHONE_INFO_FILE="${PHONE_INFO_FILE:-$WORKDIR_PHONE/cloud-phone-info.json}"
mkdir -p "$(dirname "$PHONE_INFO_FILE")"
cat > "$PHONE_INFO_FILE" <<EOF
{"phoneId":"${PHONE_ID:-manual}","edition":"${EDITION}","tunnelUrl":"${TUNNEL_URL}","novncUrl":"${TUNNEL_URL}/vnc.html?autoconnect=true&resize=scale&quality=5&compression=8","viewerUrl":"${VIEWER_URL}","password":"${VNC_PASSWORD}","startedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
echo ">>> Phone info written to $PHONE_INFO_FILE"

# ----------------------------------------------------------------- banner ----
banner() {
  cat <<EOF

====================================================================
  📱  YOUR MOBILE PHONE IS LIVE
====================================================================
  Fast viewer    : ${VIEWER_URL:-unavailable - use noVNC URL}
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
# Dashboard mode: the workflow uploads $PHONE_INFO_FILE as an artifact in the
# next step, then runs its own keep-alive step. Our background daemons
# (QEMU -daemonize, websockify, cloudflared) survive across steps.
if [ "${START_ONLY:-0}" = "1" ]; then
  echo ">>> START_ONLY=1 - leaving phone running in background, exiting starter."
  exit 0
fi

cleanup() {
  echo ">>> Shutting down phone / tunnel..."
  kill "$(cat cloudflared.pid 2>/dev/null)" "$(cat websockify.pid 2>/dev/null)" "$(cat viewer.pid 2>/dev/null)" "$(cat cloudflared-viewer.pid 2>/dev/null)" 2>/dev/null || true
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
