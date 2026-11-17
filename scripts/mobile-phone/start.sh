#!/usr/bin/env bash
# =============================================================================
#  NishCloudPhone - Android 9 in the official Android Emulator (NO QEMU).
#  Speed design: the viewer + tunnel + saved Url/Password go live FIRST
#  (seconds), the SDK/emulator setup happens after, and the phone boots
#  behind an already-working screen page.
# =============================================================================
set -euo pipefail

SESSION_MINUTES="${SESSION_MINUTES:-300}"
EDITION="android9"
echo ">>> Android edition: $EDITION"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$WORKDIR_PHONE/bin"
cd "$WORKDIR_PHONE"
# bin is on PATH from the very start: the ffmpeg binary can land here later
# and the already-running viewer will still find it (lookup happens per call).
export PATH="$WORKDIR_PHONE/bin:$PATH"
# Resolve the SDK location NOW (no installs yet) so the viewer launched
# below inherits a PATH that actually contains adb - without this it
# could not capture a single frame and users sat on "Connecting..." forever.
SDK_EARLY="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
export PATH="$SDK_EARLY/platform-tools:$SDK_EARLY/emulator:$SDK_EARLY/cmdline-tools/latest/bin:$PATH"

# Viewer password (name kept for compatibility with the workflow env).
if [ -z "${VNC_PASSWORD:-}" ]; then
  VNC_PASSWORD="$(openssl rand -hex 4)"
fi
export VNC_PASSWORD
SERIAL="emulator-5554"

# noVNC fallback stack (virtual display + VNC + web bridge) installs in
# the BACKGROUND - startup speed is untouched; the fallback screen simply
# comes online a little after the main screen.
( sudo -n apt-get update -qq >/dev/null 2>&1 && sudo -n apt-get install -y -qq --no-install-recommends xvfb x11vnc novnc websockify libxcb-xinerama0 libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libgl1 libegl1 libpulse0 xdotool >/dev/null 2>&1 ) &
# ffmpeg as ONE static binary in the background (never blocks startup).
if ! command -v ffmpeg >/dev/null 2>&1 && [ ! -x "$WORKDIR_PHONE/bin/ffmpeg" ]; then
  ( curl -fsSL --retry 3 -o /tmp/ff.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
      && tar -xJf /tmp/ff.tar.xz -C /tmp && cp /tmp/ffmpeg-*-amd64-static/ffmpeg "$WORKDIR_PHONE/bin/ffmpeg" \
      && chmod +x "$WORKDIR_PHONE/bin/ffmpeg" ) >/dev/null 2>&1 &
fi

# ------------------------------------------------------ live FIRST ----------
# Screen page + tunnel + saved credentials BEFORE any slow SDK work, so the
# dashboard shows Url/Password in well under a minute. The viewer retries
# ADB on its own until the emulator appears.
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
TUNNEL_URL=""
SAVED=0
if [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
  for _try in 1 2 3; do
    VIEWER_URL="$VIEWER_URL" TUNNEL_URL="$TUNNEL_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
      python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 && { SAVED=1; break; }
    sleep 10
  done
fi
if [ "$SAVED" != "1" ]; then
  # Private backup channel (token-only access, never printed) so the
  # dashboard still receives this phone even if the main save is down.
  cat > "$WORKDIR_PHONE/cloud-phone-info.json" <<EOF
{"phoneId":"${PHONE_ID:-manual}","edition":"${EDITION}","tunnelUrl":"${TUNNEL_URL}","viewerUrl":"${VIEWER_URL}","password":"${VNC_PASSWORD}"}
EOF
fi
echo "Cloud phone created."

# ------------------------------------------------------ emulator setup ------
echo ">>> Starting Android 9 phone..."
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
IMG_PKG="system-images;android-28;google_apis;x86_64"
# Licenses + installs ONLY when something is actually missing (cache hits
# skip all of this - no more sdkmanager noise/time on the fast path).
if [ ! -x "$SDK/emulator/emulator" ] || [ ! -d "$SDK/system-images/android-28/google_apis/x86_64" ]; then
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  [ -x "$SDK/emulator/emulator" ] || sdkmanager "emulator" "platform-tools" >/dev/null
  [ -d "$SDK/system-images/android-28/google_apis/x86_64" ] || sdkmanager "$IMG_PKG" >/dev/null
fi
if [ ! -d "$AVD_HOME_DIR/phone.avd" ]; then
  echo no | avdmanager create avd -n phone -k "$IMG_PKG" -d pixel_5 --force >/dev/null 2>&1 \
    || echo no | avdmanager create avd -n phone -k "$IMG_PKG" --force >/dev/null
  CFG="$AVD_HOME_DIR/phone.avd/config.ini"
  sed -i 's/^hw.ramSize=.*/hw.ramSize=8192M/; s/^disk.dataPartition.size=.*/disk.dataPartition.size=32G/; s/^hw.lcd.width=.*/hw.lcd.width=432/; s/^hw.lcd.height=.*/hw.lcd.height=768/; s/^hw.lcd.density=.*/hw.lcd.density=200/; s/^hw.cpu.ncore=.*/hw.cpu.ncore=4/' "$CFG" 2>/dev/null || true
fi
# If the noVNC stack arrived in time, run the emulator WINDOWED on a
# virtual display so x11vnc can serve it as the fallback screen. If not,
# headless as before (main screen unaffected either way).
USE_VNC=0
for _ in $(seq 1 24); do
  if command -v Xvfb >/dev/null 2>&1 && command -v x11vnc >/dev/null 2>&1; then USE_VNC=1; break; fi
  sleep 5
done
WIN_ARGS=(-no-window)
if [ "$USE_VNC" = "1" ]; then
  Xvfb :99 -screen 0 500x800x24 > xvfb.log 2>&1 &
  echo $! > xvfb.pid
  export DISPLAY=:99 QT_XCB_GL_INTEGRATION=none QT_QPA_PLATFORM=xcb
  sleep 2
  WIN_ARGS=(-no-nested-warning)
fi
ACCEL="off"; [ -w /dev/kvm ] && ACCEL="on"
launch_emu() {
  nohup "$SDK/emulator/emulator" -avd phone "${WIN_ARGS[@]}" -no-audio -no-boot-anim \
    -gpu swiftshader_indirect -accel "$1" -memory 4096 -cores 4 -partition-size 32768 \
    -port 5554 -no-snapshot -wipe-data -netdelay none -netspeed full -camera-back none -camera-front none -no-metrics \
    > emulator.log 2>&1 &
  echo $! > emulator.pid
}
# Launch with VERIFIED fallbacks: a windowed (noVNC) launch can crash on
# some runners - if the process is not alive after a few seconds, fall
# back to headless, then to software acceleration. Never exit the start
# step leaving a dead pid behind for the keep-alive to trip over.
emu_alive() { [ -f emulator.pid ] && kill -0 "$(cat emulator.pid)" 2>/dev/null; }
launch_emu "$ACCEL"; sleep 12
if ! emu_alive && [ "$USE_VNC" = "1" ]; then
  USE_VNC=0; WIN_ARGS=(-no-window); launch_emu "$ACCEL"; sleep 10
fi
if ! emu_alive && [ "$ACCEL" = "on" ]; then
  ACCEL="off"; WIN_ARGS=(-no-window); USE_VNC=0; launch_emu off; sleep 8
fi
adb start-server >/dev/null 2>&1 || true
# ws-scrcpy (DEFAULT screen): build in background while the phone boots;
# viewer.py serves the old fast screen until it answers, then upgrades.
(
  cd "$WORKDIR_PHONE" || exit 0
  command -v node >/dev/null 2>&1 || exit 0
  [ -d wss ] || git clone -q --depth 1 --branch v0.8.1 https://github.com/NetrisTV/ws-scrcpy.git wss >> wsscrcpy.log 2>&1 || exit 0
  cd wss || exit 0
  cat > build.config.override.json <<'CFG'
{"INCLUDE_APPL":false,"INCLUDE_GOOG":true,"INCLUDE_ADB_SHELL":false,"INCLUDE_DEV_TOOLS":false,"INCLUDE_FILE_LISTING":false,"USE_BROADWAY":true,"USE_H264_CONVERTER":true,"USE_TINY_H264":true,"USE_WEBCODECS":true,"USE_WDA_MJPEG_SERVER":false,"USE_QVH_SERVER":false}
CFG
  [ -d node_modules ] || npm install --ignore-scripts --no-audit --no-fund >> ../wsscrcpy.log 2>&1
  [ -f dist/index.js ] || npm run dist >> ../wsscrcpy.log 2>&1
  printf 'server:\n  - secure: false\n    port: 18083\n' > ../wss.yaml
  cd dist && WS_SCRCPY_CONFIG="$WORKDIR_PHONE/wss.yaml" PATH="$PATH" node index.js >> ../../wsscrcpy.log 2>&1 &
  echo $! > ../../wsscrcpy.pid
) >/dev/null 2>&1 &
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
  $S settings put global wifi_on 1 >/dev/null 2>&1 || true
  $S svc wifi enable >/dev/null 2>&1 || true
  HOME_COMP="$($S cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null | tr -d '\r' | tail -n1 || true)"
  [ -n "$HOME_COMP" ] && $S cmd package set-home-activity "$HOME_COMP" >/dev/null 2>&1 || true
  $S settings put secure show_ime_with_hard_keyboard 1 >/dev/null 2>&1 || true
  $S wm dismiss-keyguard >/dev/null 2>&1 || true
  $S input keyevent 3 >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6; do sleep 30; $S input keyevent 224 >/dev/null 2>&1 || true; $S svc wifi enable >/dev/null 2>&1 || true; done
) > setup-skip.log 2>&1 &

# Fallback screen (real noVNC): serve the virtual display over VNC,
# bridge it to the web, tunnel it, and store that URL on the phone row.
if [ "$USE_VNC" = "1" ]; then
  (
    ( for _ in $(seq 1 30); do xdotool search --name "arning" windowactivate --sync key Return >/dev/null 2>&1 && break; sleep 3; done ) >/dev/null 2>&1 &
    x11vnc -display :99 -forever -shared -noxdamage -clip 432x768+0+0 -rfbport 5900 -passwd "$VNC_PASSWORD" > vnc.log 2>&1 &
    websockify --web=/usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 > websockify.log 2>&1 &
    cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:6080" > cloudflared-novnc.log 2>&1 &
    NOVNC_URL=""
    for _ in $(seq 1 45); do
      NOVNC_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-novnc.log | head -n1 || true)"
      [ -n "$NOVNC_URL" ] && break; sleep 2
    done
    if [ -n "$NOVNC_URL" ] && [ -n "${AIVEN_DATABASE_URL:-}" ] && [ -n "${PHONE_ID:-}" ]; then
      for _try in 1 2 3; do
        VIEWER_URL="$VIEWER_URL" TUNNEL_URL="$NOVNC_URL" PHONE_PASSWORD="$VNC_PASSWORD" PHONE_ID="$PHONE_ID" \
          python3 "$REPO_ROOT/scripts/mobile-phone/save_phone.py" >/dev/null 2>&1 && break
        sleep 10
      done
    fi
  ) >/dev/null 2>&1 &
fi

if [ "${START_ONLY:-0}" = "1" ]; then exit 0; fi
DEADLINE=$(( $(date +%s) + SESSION_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  kill -0 "$(cat emulator.pid)" 2>/dev/null || { echo "phone stopped"; exit 1; }
  sleep 30
done
exit 0
