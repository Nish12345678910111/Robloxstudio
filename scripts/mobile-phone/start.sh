#!/usr/bin/env bash
# =============================================================================
#  NishCloudPhone - Android 11 in the official Android Emulator (NO QEMU).
#  Speed design: the viewer + tunnel + saved Url/Password go live FIRST
#  (seconds), the SDK/emulator setup happens after, and the phone boots
#  behind an already-working screen page.
# =============================================================================
set -euo pipefail

SESSION_MINUTES="${SESSION_MINUTES:-300}"
EDITION="android11"
echo ">>> Android edition: $EDITION"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$WORKDIR_PHONE/bin"
cd "$WORKDIR_PHONE"
# bin is on PATH from the very start: the ffmpeg binary can land here later
# and the already-running viewer will still find it (lookup happens per call).
export PATH="$WORKDIR_PHONE/bin:$PATH"

# Viewer password (name kept for compatibility with the workflow env).
if [ -z "${VNC_PASSWORD:-}" ]; then
  VNC_PASSWORD="$(openssl rand -hex 4)"
fi
export VNC_PASSWORD
SERIAL="emulator-5554"

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
TUNNEL_URL="$VIEWER_URL"
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
  sed -i 's/^hw.ramSize=.*/hw.ramSize=8192M/; s/^disk.dataPartition.size=.*/disk.dataPartition.size=32G/; s/^hw.lcd.width=.*/hw.lcd.width=720/; s/^hw.lcd.height=.*/hw.lcd.height=1280/; s/^hw.cpu.ncore=.*/hw.cpu.ncore=4/' "$CFG" 2>/dev/null || true
fi
ACCEL="off"; [ -w /dev/kvm ] && ACCEL="on"
launch_emu() {
  nohup "$SDK/emulator/emulator" -avd phone -no-window -no-audio -no-boot-anim \
    -gpu swiftshader_indirect -accel "$1" -memory 8192 -cores 4 -partition-size 32768 \
    -port 5554 -no-snapshot -wipe-data -netdelay none -netspeed full \
    > emulator.log 2>&1 &
  echo $! > emulator.pid
}
launch_emu "$ACCEL"
sleep 12
if ! kill -0 "$(cat emulator.pid)" 2>/dev/null && [ "$ACCEL" = "on" ]; then
  # Hardware accel refused to start on this runner - retry in software mode
  # so the phone (and its screen) still comes up instead of a black box.
  ACCEL="off"; launch_emu off; sleep 5
fi
adb start-server >/dev/null 2>&1 || true
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
  $S wm size 720x1280 >/dev/null 2>&1 || true
  $S wm density 320 >/dev/null 2>&1 || true
  $S settings put system accelerometer_rotation 0 >/dev/null 2>&1 || true
  $S settings put system screen_off_timeout 2147483647 >/dev/null 2>&1 || true
  $S svc power stayon true >/dev/null 2>&1 || true
  $S input keyevent 224 >/dev/null 2>&1 || true
  $S settings put global wifi_on 1 >/dev/null 2>&1 || true
  $S svc wifi enable >/dev/null 2>&1 || true
  HOME_COMP="$($S cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null | tr -d '\r' | tail -n1 || true)"
  [ -n "$HOME_COMP" ] && $S cmd package set-home-activity "$HOME_COMP" >/dev/null 2>&1 || true
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
