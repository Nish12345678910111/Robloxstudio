import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const startScript = readFileSync(new URL("../scripts/mobile-phone/start.sh", import.meta.url), "utf8");
const viewerScript = readFileSync(new URL("../scripts/mobile-phone/viewer.py", import.meta.url), "utf8");

test("cloud phone mirrors a headless emulator without host dialogs or emulator controls", () => {
  assert.match(startScript, /emulator" -avd phone -no-window/);
  assert.match(startScript, /scrcpy --fullscreen --prefer-text/);
  assert.match(startScript, /--window-borderless --window-title NishCloudPhone/);
  assert.match(startScript, /Xvfb :99 -screen 0 432x768x24/);
  assert.doesNotMatch(startScript, /-clip\s+\d+x\d+/);
  assert.doesNotMatch(startScript, /--no-control|--no-clipboard-autosync/);
});

test("soft keyboard is configured before emulator launch and VNC accepts mapped keys", () => {
  const keyboardConfig = startScript.indexOf("set_avd_config hw.keyboard no");
  const emulatorLaunch = startScript.indexOf('nohup "$SDK/emulator/emulator"');
  assert.ok(keyboardConfig >= 0 && emulatorLaunch > keyboardConfig);
  assert.match(startScript, /show_ime_with_hard_keyboard 1/);
  assert.match(startScript, /-xkb -repeat -rfbport/);
});

test("password-gated viewer waits for the Android mirror before opening noVNC", () => {
  assert.match(startScript, /PHONE_SCREEN_READY_FILE="\$SCREEN_READY_FILE"/);
  assert.match(startScript, /touch "\$SCREEN_READY_FILE"/);
  assert.match(viewerScript, /SCREEN_READY_FILE = os\.environ\.get\("PHONE_SCREEN_READY_FILE", ""\)/);
  assert.match(viewerScript, /if SCREEN_READY_FILE and not os\.path\.isfile\(SCREEN_READY_FILE\):/);
});
