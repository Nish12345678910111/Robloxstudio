#!/usr/bin/env bash
# =============================================================================
#  NishCloudPhone - Android 11 in the official Android Emulator (headless).
#  scrcpy renders only the Android display into Xvfb; official noVNC serves
#  that clean screen and forwards keyboard/clipboard input to the phone.
#  The password-gated noVNC proxy + tunnel + Url/Password go live FIRST.
# =============================================================================
set -euo pipefail

SESSION_MINUTES="${SESSION_MINUTES:-300}"
EDITION="android11"
echo ">>> Android edition: $EDITION"
WORKDIR_PHONE="${WORKDIR_PHONE:-$PWD/.phone-vm}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mkdir -p "$WORKDIR_PHONE"
WORKDIR_PHONE="$(cd "$WORKDIR_PHONE" && pwd)"
SCREEN_READY_FILE="$WORKDIR_PHONE/screen-ready"
if [ "${PHASE:-}" = "1" ] || [ "${PHASE:-}" = "2" ]; then
  rm -f "$SCREEN_READY_FILE"
fi
cd "$WORKDIR_PHONE"
# Resolve the SDK location NOW so the viewer launched below can use adb for
# the dashboard's APK-install action. noVNC remains the remote-control layer.
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
NOVNC_PACKAGES=(xvfb x11vnc novnc websockify scrcpy libxcb-xinerama0 libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libgl1 libegl1 libpulse0 xdotool)
NOVNC_INSTALL_LOG="$WORKDIR_PHONE/novnc-install.log"
NOVNC_INSTALL_PID="$WORKDIR_PHONE/novnc-install.pid"
NOVNC_INSTALL_STATUS="$WORKDIR_PHONE/novnc-install.status"
novnc_ready() {
  command -v Xvfb >/dev/null 2>&1 && command -v x11vnc >/dev/null 2>&1 \
    && command -v websockify >/dev/null 2>&1 && command -v scrcpy >/dev/null 2>&1 \
    && [ -f /usr/share/novnc/vnc.html ] && [ -f /usr/share/novnc/vnc_lite.html ]
}
apt_get() {
  # GitHub's Ubuntu image may be running apt-daily/unattended-upgrades when a
  # job starts. Wait for dpkg's lock instead of failing or racing a second apt.
  sudo -n apt-get -o DPkg::Lock::Timeout=180 -o Acquire::Retries=3 \
    -o Acquire::Languages=none "$@"
}
install_novnc_stack() {
  if novnc_ready; then return 0; fi
  local attempt="$WORKDIR_PHONE/novnc-install-attempt.log"
  : > "$attempt"
  if apt_get install -y -qq --no-install-recommends "${NOVNC_PACKAGES[@]}" > "$attempt" 2>&1; then
    cat "$attempt" >> "$NOVNC_INSTALL_LOG"
    return 0
  fi
  cat "$attempt" >> "$NOVNC_INSTALL_LOG"
  # Runner images normally include usable package indexes. Update only if the
  # requested packages are absent from those indexes, not on every cold start.
  if ! grep -Eqi 'Unable to locate package|has no installation candidate' "$attempt"; then
    return 1
  fi
  echo "Package indexes are missing the noVNC packages; refreshing once." >> "$NOVNC_INSTALL_LOG"
  apt_get update -qq >> "$NOVNC_INSTALL_LOG" 2>&1 || return 1
  : > "$attempt"
  if apt_get install -y -qq --no-install-recommends "${NOVNC_PACKAGES[@]}" > "$attempt" 2>&1; then
    cat "$attempt" >> "$NOVNC_INSTALL_LOG"
    return 0
  fi
  cat "$attempt" >> "$NOVNC_INSTALL_LOG"
  return 1
}
wait_for_novnc_install() {
  local max_seconds="$1" second install_pid=""
  [ -f "$NOVNC_INSTALL_PID" ] && install_pid="$(cat "$NOVNC_INSTALL_PID")"
  for ((second=0; second<max_seconds; second++)); do
    [ -f "$NOVNC_INSTALL_STATUS" ] && return 0
    if [ -n "$install_pid" ] && ! kill -0 "$install_pid" 2>/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
# Install the required screen stack in the background during phase 1 so it
# overlaps with SDK/cache preparation. Write a completion marker from the
# background process: checking kill -0 alone can mistake a zombie shell for a
# running installer and start a second apt-get against the same dpkg lock.
if [ "${PHASE:-}" = "1" ] && ! novnc_ready; then
  : > "$NOVNC_INSTALL_LOG"
  rm -f "$NOVNC_INSTALL_STATUS" "$NOVNC_INSTALL_PID"
  (
    result=0
    install_novnc_stack || result=$?
    printf '%s\n' "$result" > "$NOVNC_INSTALL_STATUS.tmp"
    mv "$NOVNC_INSTALL_STATUS.tmp" "$NOVNC_INSTALL_STATUS"
    exit "$result"
  ) >/dev/null 2>&1 &
  echo $! > "$NOVNC_INSTALL_PID"
fi

# ------------------------------------------------------ live FIRST ----------
# Password-gated noVNC proxy + tunnel + saved credentials BEFORE SDK work.
# The viewer stays on its startup page until the scrcpy display is ready.
LIVE_ALREADY=0
TUNNEL_URL=""
if [ "${PHASE:-}" = "2" ] && [ -f viewer.pid ] && kill -0 "$(cat viewer.pid)" 2>/dev/null \
   && [ -f cloudflared-viewer.pid ] && kill -0 "$(cat cloudflared-viewer.pid)" 2>/dev/null; then
  LIVE_ALREADY=1  # phase 1 already brought the screen service up
  VIEWER_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' cloudflared-viewer.log | head -n1 || true)"
fi
if [ "$LIVE_ALREADY" = "0" ]; then
  PHONE_PASSWORD="$VNC_PASSWORD" VIEWER_PORT=8081 ADB_SERIAL="$SERIAL" \
    PHONE_SCREEN_READY_FILE="$SCREEN_READY_FILE" \
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
        PHONE_SCREEN_READY_FILE="$SCREEN_READY_FILE" \
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
if [ ! -x "$SDK/emulator/emulator" ] || [ ! -s "$SDK/system-images/android-30/google_apis/x86_64/system.img" ]; then
  yes | sdkmanager --licenses >/dev/null 2>&1 || true
  [ -x "$SDK/emulator/emulator" ] || sdkmanager "emulator" "platform-tools" >/dev/null
  [ -s "$SDK/system-images/android-30/google_apis/x86_64/system.img" ] || sdkmanager "$IMG_PKG" >/dev/null
fi
# Let the workflow cache a complete emulator install even if a later
# noVNC/emulator startup check fails. Never save a partial SDK download.
if [ -x "$SDK/emulator/emulator" ] && [ -s "$SDK/system-images/android-30/google_apis/x86_64/system.img" ] \
   && [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "sdk_cache_ready=true" >> "$GITHUB_OUTPUT"
fi
if [ ! -d "$AVD_HOME_DIR/phone.avd" ]; then
  echo no | avdmanager create avd -n phone -k "$IMG_PKG" -d pixel_5 --force >/dev/null 2>&1 \
    || echo no | avdmanager create avd -n phone -k "$IMG_PKG" --force >/dev/null
fi
CFG="$AVD_HOME_DIR/phone.avd/config.ini"
set_avd_config() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$CFG"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$CFG"
  else
    printf '%s=%s\n' "$key" "$value" >> "$CFG"
  fi
}
# Configure the guest before the emulator reads config.ini. In particular,
# disabling the hard keyboard makes Android's own on-screen IME appear on tap.
set_avd_config hw.ramSize 8192M
set_avd_config disk.dataPartition.size 32G
set_avd_config hw.lcd.width 432
set_avd_config hw.lcd.height 768
set_avd_config hw.lcd.density 200
set_avd_config hw.cpu.ncore 4
set_avd_config hw.keyboard no
# Both screen URLs require the official noVNC stack. Wait for phase 1's
# installer to finish completely, even if its first package files appeared;
# never launch a second apt-get while the first process may own dpkg's lock.
if [ -f "$NOVNC_INSTALL_PID" ] && [ ! -f "$NOVNC_INSTALL_STATUS" ]; then
  echo ">>> Waiting for the noVNC package install started during phase 1..."
  wait_for_novnc_install 180 || true
fi
if [ -f "$NOVNC_INSTALL_PID" ] && [ ! -f "$NOVNC_INSTALL_STATUS" ]; then
  echo ">>> noVNC install is still running; waiting rather than racing dpkg..."
  wait_for_novnc_install 120 || true
fi
if [ -f "$NOVNC_INSTALL_PID" ] && [ ! -f "$NOVNC_INSTALL_STATUS" ] \
   && kill -0 "$(cat "$NOVNC_INSTALL_PID")" 2>/dev/null; then
  echo "The original noVNC installer has not finished; refusing to start a competing apt-get." >&2
  tail -n 40 "$NOVNC_INSTALL_LOG" 2>/dev/null || true
  exit 1
fi
if ! novnc_ready; then
  echo ">>> Installing/retrying the required noVNC stack..."
  rm -f "$NOVNC_INSTALL_STATUS"
  install_result=0
  install_novnc_stack || install_result=$?
  printf '%s\n' "$install_result" > "$NOVNC_INSTALL_STATUS"
  if [ "$install_result" -ne 0 ] || ! novnc_ready; then
    echo "Required noVNC packages are unavailable; refusing to start a phone without a real noVNC screen." >&2
    tail -n 40 "$NOVNC_INSTALL_LOG" 2>/dev/null || true
    exit 1
  fi
fi
if ! novnc_ready; then
  echo "Required noVNC stack did not become ready; no phone screen will be started." >&2
  tail -n 40 "$NOVNC_INSTALL_LOG" 2>/dev/null || true
  exit 1
fi
USE_VNC=1
echo ">>> Required noVNC + scrcpy stack: ready"
Xvfb :99 -screen 0 432x768x24 -nolisten tcp > xvfb.log 2>&1 &
echo $! > xvfb.pid
export DISPLAY=:99 SDL_VIDEODRIVER=x11 SDL_AUDIODRIVER=dummy QT_XCB_GL_INTEGRATION=none QT_QPA_PLATFORM=xcb
sleep 2
if ! kill -0 "$(cat xvfb.pid)" 2>/dev/null; then
  echo "Xvfb failed to start; noVNC cannot display the phone." >&2
  tail -n 40 xvfb.log 2>/dev/null || true
  exit 1
fi
ACCEL="off"; [ -w /dev/kvm ] && ACCEL="on"
launch_emu() {
  # Run the emulator headlessly so its host warning dialogs and control panel
  # cannot leak into the phone screen. scrcpy below displays the guest only.
  nohup "$SDK/emulator/emulator" -avd phone -no-window -no-audio -no-boot-anim \
    -gpu swiftshader_indirect -accel "$1" -memory 4096 -cores 4 -partition-size 32768 \
    -port 5554 -no-snapshot -wipe-data -netdelay none -netspeed full -camera-back none -camera-front none -no-metrics \
    > emulator.log 2>&1 &
  echo $! > emulator.pid
}
emu_alive() { [ -f emulator.pid ] && kill -0 "$(cat emulator.pid)" 2>/dev/null; }
launch_emu "$ACCEL"; sleep 12
if ! emu_alive && [ "$ACCEL" = "on" ]; then
  ACCEL="off"; launch_emu off; sleep 12
fi
if ! emu_alive; then
  echo "Headless Android Emulator failed; refusing to start a phone without a screen mirror." >&2
  tail -n 60 emulator.log 2>/dev/null || true
  exit 1
fi
echo "$(date -u +%H:%M:%S) vnc_stack=$USE_VNC emulator_alive=yes" >> supervisor.log 2>/dev/null || true

# Bring up noVNC while Android provisions. It captures the fixed portrait
# Xvfb surface; the emulator UI is headless and only scrcpy is shown there.
: > vnc.log
x11vnc -display :99 -forever -shared -noxdamage -threads -defer 10 -wait 10 -nowf -nowcr \
  -xkb -repeat -rfbport 5900 -passwd "$VNC_PASSWORD" > vnc.log 2>&1 &
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
(
  BOOTED=0
  for _ in $(seq 1 120); do
    if [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" = "1" ]; then
      BOOTED=1
      break
    fi
    sleep 5
  done
  if [ "$BOOTED" != "1" ]; then
    echo "Android did not finish booting; scrcpy cannot start the noVNC display."
    exit 1
  fi
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

  # Mirror only the Android display. This removes the Emulator host toolbar and
  # modal warnings. Keep scrcpy control and clipboard autosync enabled so VNC
  # keyboard/mouse events and the noVNC clipboard reach Android.
  SCRCPY_LOG="$WORKDIR_PHONE/scrcpy.log"
  : > "$SCRCPY_LOG"
  SDL_VIDEODRIVER=x11 SDL_AUDIODRIVER=dummy nohup scrcpy --fullscreen --prefer-text \
    --window-borderless --window-title NishCloudPhone --max-size 768 \
    > "$SCRCPY_LOG" 2>&1 &
  SCRCPY_PID=$!
  printf '%s\n' "$SCRCPY_PID" > "$WORKDIR_PHONE/scrcpy.pid"
  SCREEN_READY=0
  for _ in $(seq 1 60); do
    SCRCPY_WINDOW="$(xdotool search --onlyvisible --name 'NishCloudPhone' 2>/dev/null | head -n1 || true)"
    if [ -n "$SCRCPY_WINDOW" ]; then
      xdotool windowraise "$SCRCPY_WINDOW" >/dev/null 2>&1 || true
      xdotool windowfocus --sync "$SCRCPY_WINDOW" >/dev/null 2>&1 || true
      touch "$SCREEN_READY_FILE"
      SCREEN_READY=1
      break
    fi
    if ! kill -0 "$SCRCPY_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  if [ "$SCREEN_READY" != "1" ]; then
    echo "scrcpy did not create its display window; leaving the screen in starting state."
    tail -n 40 "$SCRCPY_LOG" 2>/dev/null || true
    exit 1
  fi

  for _ in 1 2 3 4 5 6; do sleep 30; $S input keyevent 224 >/dev/null 2>&1 || true; $S svc wifi enable >/dev/null 2>&1 || true; done
) > setup-skip.log 2>&1 &

if [ "${START_ONLY:-0}" = "1" ]; then
  for _ in $(seq 1 180); do
    [ -f "$SCREEN_READY_FILE" ] && exit 0
    if ! emu_alive; then break; fi
    sleep 1
  done
  echo "Phone screen mirror did not become ready; refusing to report a live phone." >&2
  tail -n 40 setup-skip.log 2>/dev/null || true
  tail -n 40 "$WORKDIR_PHONE/scrcpy.log" 2>/dev/null || true
  exit 1
fi
DEADLINE=$(( $(date +%s) + SESSION_MINUTES * 60 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  kill -0 "$(cat emulator.pid)" 2>/dev/null || { echo "phone stopped"; exit 1; }
  sleep 30
done
exit 0
