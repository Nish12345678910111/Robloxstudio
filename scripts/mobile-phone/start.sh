#!/usr/bin/env bash
# =============================================================================
#  NishCloudPhone - Android 11 in the official Android Emulator (NO QEMU).
#  Speed design: the password-gated noVNC proxy + tunnel + Url/Password go
#  live FIRST. The page shows a startup notice until the emulator's noVNC
#  bridge is ready; both screen URLs then serve the real noVNC client.
# =============================================================================
set -euo pipefail

SESSION_MINUTES="${SESSION_MINUTES:-300}"
EDITION="android11"
echo ">>> Android edition: $EDITION"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$WORKDIR_PHONE"
cd "$WORKDIR_PHONE"
# Resolve the SDK location NOW so the viewer launched below can use adb for
# the dashboard's APK-install action. The phone screen itself is noVNC.
SDK_EARLY="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
export PATH="$SDK_EARLY/platform-tools:$SDK_EARLY/emulator:$SDK_EARLY/cmdline-tools/latest/bin:$PATH"

# Viewer password (name kept for compatibility with the workflow env).
# Workflow steps share no env, so phase 1 persists it in the runner workspace
# for phase 2; it is never printed, uploaded, or committed.
PW_FILE="$WORKDIR_PHONE/.pw"
if [ -z "${VNC_PASSWORD:-}" ] && [ -f "$PW_FILE" ]; then
  VNC_PASSWORD="$(cat "$PW_FILE")"
fi
if [ -z "${VNC_PASSWORD:-}" ]; then
  VNC_PASSWORD="$(openssl rand -hex 4)"
fi
printf %s "$VNC_PASSWORD" > "$PW_FILE"
export VNC_PASSWORD
SERIAL="emulator-5554"
NOVNC_PACKAGES=(xvfb x11vnc novnc websockify libxcb-xinerama0 libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libgl1 libegl1 libpulse0 xdotool)
novnc_ready() {
  command -v Xvfb >/dev/null 2>&1 && command -v x11vnc >/dev/null 2>&1 \
    && command -v websockify >/dev/null 2>&1 && [ -f /usr/share/novnc/vnc.html ] \
    && [ -f /usr/share/novnc/vnc_lite.html ]
}
# Install the required screen stack in the background during phase 1 so it
# overlaps with SDK preparation. Phase 2 verifies it and blocks/fails rather
# than quietly falling back to a non-noVNC screen.
if [ "${PHASE:-}" = "1" ] && ! novnc_ready; then
  ( sudo -n apt-get -o Acquire::Languages=none update -qq \
      && sudo -n apt-get install -y -qq --no-install-recommends "${NOVNC_PACKAGES[@]}" ) > novnc-install.log 2>&1 &
  echo $! > novnc-install.pid
fi

# ------------------------------------------------------ live FIRST ----------
# Password-gated noVNC proxy + tunnel + saved credentials BEFORE SDK work.
# The page shows a noVNC starting notice until the emulator's VNC bridge is up.
LIVE_ALREADY=0
TUNNEL_URL=""
if [ "${PHASE:-}" = "2" ] && [ -f viewer.pid ] && kill -0 "$(cat viewer.pid)" 2>/dev/null \
   && [ -f cloudflared-viewer.pid ] && kill -0 "$(cat cloudflared-viewer.pid)" 2>/dev/null; then
  LIVE_ALREADY=1  # phase 1 already brought the screen service up
  VIEWER_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-viewer.log | head -n1 || true)"
fi
if [ "$LIVE_ALREADY" = "0" ]; then
PHONE_PASSWORD="$VNC_PASSWORD" VIEWER_PORT=8081 ADB_SERIAL="$SERIAL" \
  python3 "$REPO_ROOT/scripts/mobile-phone/viewer.py" > viewer.log 2>&1 &
echo $! > viewer.pid
sleep 2
: > cloudflared-viewer.log
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:8081" > cloudflared-viewer.log 2>&1 &
echo $! > cloudflared-viewer.pid
VIEWER_URL=""
for _ in $(seq 1 45); do
  VIEWER_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-viewer.log | head -n1 || true)"
  [ -n "$VIEWER_URL" ] && break; sleep 2
done
if [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
  VIEWER_URL="$VIEWER_URL" TUNNEL_URL="$TUNNEL_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
    python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 || true
fi
fi
# Phase 1 may have started the viewer before the database was reachable.
# Retry once during phase 2, still before the keep-alive polling step begins.
if [ "$LIVE_ALREADY" = "1" ] && [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
  VIEWER_URL="$VIEWER_URL" TUNNEL_URL="$TUNNEL_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
    python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 || true
fi
if [ "$LIVE_ALREADY" = "0" ]; then (
  while true; do
    sleep 20
    if [ -f viewer.pid ] && ! kill -0 "$(cat viewer.pid)" 2>/dev/null; then
      PHONE_PASSWORD="$VNC_PASSWORD" VIEWER_PORT=8081 ADB_SERIAL="$SERIAL" \
        python3 "$REPO_ROOT/scripts/mobile-phone/viewer.py" >> viewer.log 2>&1 &
      echo $! > viewer.pid
      echo "viewer restarted" >> supervisor.log
    fi
    if [ -f cloudflared-viewer.pid ] && ! kill -0 "$(cat cloudflared-viewer.pid)" 2>/dev/null; then
      : > cloudflared-viewer.log
      cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:8081" > cloudflared-viewer.log 2>&1 &
      echo $! > cloudflared-viewer.pid
      NEW_URL=""
      for _ in $(seq 1 45); do
        NEW_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-viewer.log | head -n1 || true)"
        [ -n "$NEW_URL" ] && break; sleep 2
      done
      echo "tunnel restarted: $NEW_URL" >> supervisor.log
      if [ -n "$NEW_URL" ] && [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
        VIEWER_URL="$NEW_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
          python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 || true
      fi
    fi
  done
) > supervisor.log 2>&1 &
fi
echo "Cloud phone created."
if [ "${PHASE:-}" = "1" ]; then echo "Screen service live."; exit 0; fi

# ------------------------------------------------------ emulator setup ------
echo ">>> Starting Android 11 phone..."
# Fast path: CI runners ship Java + Android SDK preinstalled - use them and
# skip every big download. Only fall back to a private SDK when missing.
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ] || [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  SDK="$WORKDIR_PHONE/sdk"
  if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
    curl -fsSL --retry 5 -o /tmp/cmdtools.zip \
      https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
    rm -rf "$SDK/cmdline-tools"; mkdir -p "$SDK/cmdline-tools"
    unzip -q -o /tmp/cmdtools.zip -d "$SDK/cmdline-tools"
    mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
  fi
fi
AVD_HOME_DIR="$WORKDIR_PHONE/avd"; mkdir -p "$AVD_HOME_DIR"
export ANDROID_SDK_ROOT="$SDK" ANDROID_HOME="$SDK" ANDROID_AVD_HOME="$AVD_HOME_DIR"
export PATH="$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"
IMG_PKG="system-images;android-30;google_apis;x86_64"
# Licenses + installs ONLY when something is actually missing (cache hits
# skip all of this - no more sdkmanager noise/time on the fast path).
if [ ! -x "$SDK/emulator/emulator" ] || [ ! -d "$SDK/system-images/android-30/google_apis/x86_64" ]; then
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  [ -x "$SDK/emulator/emulator" ] || sdkmanager "emulator" "platform-tools" >/dev/null
  [ -d "$SDK/system-images/android-30/google_apis/x86_64" ] || sdkmanager "$IMG_PKG" >/dev/null
fi
if [ ! -d "$AVD_HOME_DIR/phone.avd" ]; then
  echo no | avdmanager create avd -n phone -k "$IMG_PKG" -d pixel_5 --force >/dev/null 2>&1 \
    || echo no | avdmanager create avd -n phone -k "$IMG_PKG" --force >/dev/null
  CFG="$AVD_HOME_DIR/phone.avd/config.ini"
  sed -i 's/^hw.ramSize=.*/hw.ramSize=8192M/; s/^disk.dataPartition.size=.*/disk.dataPartition.size=32G/; s/^hw.lcd.width=.*/hw.lcd.width=432/; s/^hw.lcd.height=.*/hw.lcd.height=768/; s/^hw.lcd.density=.*/hw.lcd.density=200/; s/^hw.cpu.ncore=.*/hw.cpu.ncore=4/' "$CFG" 2>/dev/null || true
fi
# Both screen URLs require the official noVNC stack. Wait for phase 1's
# background install; if it failed, retry synchronously instead of creating
# a headless phone with a fake MJPEG/screenshot screen.
if ! novnc_ready && [ -f novnc-install.pid ] && kill -0 "$(cat novnc-install.pid)" 2>/dev/null; then
  for _ in $(seq 1 90); do
    novnc_ready && break
    kill -0 "$(cat novnc-install.pid)" 2>/dev/null || break
    sleep 2
  done
fi
if ! novnc_ready; then
  echo ">>> Installing required noVNC stack..."
  sudo -n apt-get -o Acquire::Languages=none update -qq
  sudo -n apt-get install -y -qq --no-install-recommends "${NOVNC_PACKAGES[@]}"
fi
if ! novnc_ready; then
  echo "Required noVNC packages are unavailable; refusing to start a phone without a real noVNC screen." >&2
  tail -n 40 novnc-install.log 2>/dev/null || true
  exit 1
fi
USE_VNC=1
echo ">>> Required noVNC stack: ready"
Xvfb :99 -screen 0 500x800x24 -nolisten tcp > xvfb.log 2>&1 &
echo $! > xvfb.pid
export DISPLAY=:99 QT_XCB_GL_INTEGRATION=none QT_QPA_PLATFORM=xcb
sleep 2
if ! kill -0 "$(cat xvfb.pid)" 2>/dev/null; then
  echo "Xvfb failed to start; noVNC cannot display the phone." >&2
  tail -n 40 xvfb.log 2>/dev/null || true
  exit 1
fi
WIN_ARGS=(-no-nested-warning)
ACCEL="off"; [ -w /dev/kvm ] && ACCEL="on"
launch_emu() {
  nohup "$SDK/emulator/emulator" -avd phone "${WIN_ARGS[@]}" -no-audio -no-boot-anim \
    -gpu swiftshader_indirect -accel "$1" -memory 4096 -cores 4 -partition-size 32768 \
    -port 5554 -no-snapshot -wipe-data -netdelay none -netspeed full -camera-back none -camera-front none -no-metrics \
    > emulator.log 2>&1 &
  echo $! > emulator.pid
}
emu_alive() { [ -f emulator.pid ] && kill -0 "$(cat emulator.pid)" 2>/dev/null; }
launch_emu "$ACCEL"; sleep 12
if ! emu_alive; then
  WIN_ARGS=(); launch_emu "$ACCEL"; sleep 12  # retry without the optional flag, still windowed
fi
if ! emu_alive && [ "$ACCEL" = "on" ]; then
  ACCEL="off"; WIN_ARGS=(-no-nested-warning); launch_emu off; sleep 12
fi
if ! emu_alive; then
  echo "Windowed Android Emulator failed; refusing to fall back to a headless/non-noVNC screen." >&2
  tail -n 60 emulator.log 2>/dev/null || true
  exit 1
fi
echo "$(date -u +%H:%M:%S) vnc_stack=$USE_VNC emulator_alive=yes" >> supervisor.log 2>/dev/null || true
(
  for _ in $(seq 1 60); do
    # Pin the emulator window to the top-left so VNC serves the phone area.
    xdotool search --name "mulator" windowmove 0 0 >/dev/null 2>&1 || true
    # Dismiss a nested-virtualization warning if the runner shows one.
    if xdotool search --name "arning" >/dev/null 2>&1; then
      xdotool search --name "arning" windowfocus key Return >/dev/null 2>&1 || true
      xdotool search --name "arning" key Return >/dev/null 2>&1 || true
      sleep 1
      xdotool search --name "arning" >/dev/null 2>&1 || break
    fi
    sleep 3
  done
) >/dev/null 2>&1 &

# Bring up both real noVNC endpoints as soon as the windowed emulator exists,
# before ADB provisioning can take several minutes.
: > vnc.log
x11vnc -display :99 -forever -shared -noxdamage -threads -defer 10 -wait 10 -nowf -nowcr \
  -clip 432x768+0+0 -rfbport 5900 -passwd "$VNC_PASSWORD" > vnc.log 2>&1 &
echo $! > vnc.pid
: > websockify.log
websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 > websockify.log 2>&1 &
echo $! > websockify.pid
vnc_ports_ready() {
  python3 -c 'import socket; ss=[socket.create_connection(("127.0.0.1", p), timeout=1) for p in (5900,6080)]; [s.close() for s in ss]' >/dev/null 2>&1
}
for _ in $(seq 1 60); do
  vnc_ports_ready && break
  sleep 1
done
if ! vnc_ports_ready; then
  echo "x11vnc/websockify did not become ready; refusing a phone without a noVNC screen." >&2
  tail -n 40 vnc.log 2>/dev/null || true
  tail -n 40 websockify.log 2>/dev/null || true
  exit 1
fi
: > cloudflared-novnc.log
cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:6080" > cloudflared-novnc.log 2>&1 &
echo $! > cloudflared-novnc.pid
NOVNC_URL=""
for _ in $(seq 1 45); do
  NOVNC_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-novnc.log | head -n1 || true)"
  [ -n "$NOVNC_URL" ] && break
  sleep 2
done
if [ -n "$NOVNC_URL" ] && [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
  VIEWER_URL="$VIEWER_URL" TUNNEL_URL="$NOVNC_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
    python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 || true
elif [ -z "$NOVNC_URL" ]; then
  echo "Direct noVNC tunnel unavailable; the primary viewer tunnel remains active." >> supervisor.log
fi

adb start-server >/dev/null 2>&1 || true
# soft keyboard must actually open when a text field is tapped
sed -i 's/^hw.keyboard=.*/hw.keyboard=no/' "$AVD_HOME_DIR/phone.avd/config.ini" 2>/dev/null || true
(
  for _ in $(seq 1 120); do
    BOOTED="$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    [ "$BOOTED" = "1" ] && break; sleep 5
  done
  S="adb -s $SERIAL shell"
  $S settings put global device_provisioned 1 >/dev/null 2>&1 || true
  $S settings put secure user_setup_complete 1 >/dev/null 2>&1 || true
  $S settings put global setup_wizard_has_run 1 >/dev/null 2>&1 || true
  for pkg in com.google.android.setupwizard com.android.setupwizard; do
    $S pm disable-user --user 0 "$pkg" >/dev/null 2>&1 || true
  done
  $S wm size 432x768 >/dev/null 2>&1 || true
  $S wm density 200 >/dev/null 2>&1 || true
  $S settings put system accelerometer_rotation 0 >/dev/null 2>&1 || true
  $S settings put system screen_off_timeout 2147483647 >/dev/null 2>&1 || true
  $S svc power stayon true >/dev/null 2>&1 || true
  $S input keyevent 224 >/dev/null 2>&1 || true
  echo "native bridge: $($S getprop ro.dalvik.vm.native.bridge 2>/dev/null | tr -d '\r')" >> supervisor.log 2>/dev/null || true
  $S settings put global package_verifier_enable 0 >/dev/null 2>&1 || true
  $S settings put global verifier_verify_adb_installs 0 >/dev/null 2>&1 || true
  $S settings put secure install_non_market_apps 1 >/dev/null 2>&1 || true
  $S settings put global wifi_on 1 >/dev/null 2>&1 || true
  $S svc wifi enable >/dev/null 2>&1 || true
  HOME_COMP="$($S cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null | tr -d '\r' | tail -n1 || true)"
  [ -n "$HOME_COMP" ] && $S cmd package set-home-activity "$HOME_COMP" >/dev/null 2>&1 || true
  $S settings put secure show_ime_with_hard_keyboard 1 >/dev/null 2>&1 || true
  $S wm dismiss-keyguard >/dev/null 2>&1 || true
  $S input keyevent 3 >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6; do sleep 30; $S input keyevent 224 >/dev/null 2>&1 || true; $S svc wifi enable >/dev/null 2>&1 || true; done
) > setup-skip.log 2>&1 &

if [ "${START_ONLY:-0}" = "1" ]; then exit 0; fi
DEADLINE=$(( $(date +%s) + SESSION_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  kill -0 "$(cat emulator.pid)" 2>/dev/null || { echo "phone stopped"; exit 1; }
  sleep 30
done
exit 0
