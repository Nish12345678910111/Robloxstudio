import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispatchPhone } from "../functions/_lib/github.js";

const startScript = readFileSync(new URL("../scripts/mobile-phone/start.sh", import.meta.url), "utf8");
const workflowScript = readFileSync(new URL("../.github/workflows/cloud-phone.yml", import.meta.url), "utf8");
const viewerScript = readFileSync(new URL("../scripts/mobile-phone/viewer.py", import.meta.url), "utf8");
const githubScript = readFileSync(new URL("../functions/_lib/github.js", import.meta.url), "utf8");
const phonesApiScript = readFileSync(new URL("../functions/api/phones.js", import.meta.url), "utf8");
const dashboardScript = readFileSync(new URL("../cloudflare-pages/src/shared/Dashboard.jsx", import.meta.url), "utf8");
const phoneRouteScript = readFileSync(new URL("../cloudflare-pages/src/shared/PhoneRoute.jsx", import.meta.url), "utf8");

test("cloud phone mirrors a headless emulator without host dialogs or emulator controls", () => {
  assert.match(startScript, /emulator" -avd phone -no-window/);
  assert.match(startScript, /scrcpy --fullscreen --prefer-text/);
  assert.match(startScript, /--window-borderless --window-title NishCloudPhone/);
  assert.match(startScript, /Xvfb :99 -screen 0 432x768x24/);
  assert.doesNotMatch(startScript, /-clip\s+\d+x\d+/);
  assert.doesNotMatch(startScript, /--no-control|--no-clipboard-autosync/);
});

test("the selected cloud-phone RAM, CPU and disk values reach the emulator", () => {
  assert.match(startScript, /set_avd_config hw\.ramSize "\$\{RAM_MB\}M"/);
  assert.match(startScript, /-memory "\$RAM_MB" -cores "\$CPU_CORES"/);
  assert.match(startScript, /-partition-size "\$\(\(DISK_GB \* 1024\)\)"/);
  assert.doesNotMatch(startScript, /-memory 4096 -cores 4/);
});

test("only the supported Android 11 and Android 15 x86_64 profiles can start phones", () => {
  assert.match(workflowScript, /default: "android11"[\s\S]*options: \["android11", "android15"\]/);
  assert.match(workflowScript, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(workflowScript, /ubuntu-24\.04-arm|options:.*android15-arm64/);
  assert.match(startScript, /android11\) ANDROID_API_LEVEL=30; ANDROID_VERSION=11; ANDROID_ABI=x86_64/);
  assert.match(startScript, /android15\) ANDROID_API_LEVEL=35; ANDROID_VERSION=15; ANDROID_ABI=x86_64/);
  assert.match(startScript, /PHONE_SYSTEM_IMAGE="system-images;android-\$\{ANDROID_API_LEVEL\};google_apis;\$\{ANDROID_ABI\}"/);
  assert.match(startScript, /x86_64:x86_64/);
  assert.match(startScript, /\$SDK\/emulator\/emulator" -accel-check/);
  assert.match(workflowScript, /sudo modprobe kvm/);
  assert.match(workflowScript, /cloudflared-bin-v2-\$\{\{ runner\.arch \}\}/);
  assert.match(startScript, /SCREEN_START_TIMEOUT=180/);
  assert.match(startScript, /BOOT_WAIT_ATTEMPTS=120/);
  assert.match(workflowScript, /cloud-phone-runtime-v8-\$\{\{ inputs\.edition \}\}/);
  assert.match(workflowScript, /PHASE: "1"\s+EDITION: \$\{\{ inputs\.edition \}\}/);
  assert.match(phonesApiScript, /PHONE_EDITIONS = new Set\(\["android11", "android15"\]\)/);

  const dispatchStart = githubScript.indexOf("export async function dispatchPhone");
  const dispatchEnd = githubScript.indexOf("export async function cancelRun", dispatchStart);
  const dispatchBody = githubScript.slice(dispatchStart, dispatchEnd);
  assert.match(dispatchBody, /\["android11", "android15"\]\.includes\(edition\)/);
  assert.doesNotMatch(dispatchBody, /android15-arm64/);
  assert.doesNotMatch(startScript, /android15-arm64|Cuttlefish|arm64-v8a/);
  assert.doesNotMatch(dashboardScript, /value="android15-arm64"/);
});

test("ARM64 run requests are blocked clearly while old runs remain identifiable", () => {
  assert.match(phonesApiScript, /Android 15 ARM64 is paused because hosted ARM64 runners do not provide usable KVM/);
  assert.match(dashboardScript, /Android 15 ARM64 is paused until a KVM-capable runner is available/);
  assert.match(dashboardScript, /Android 15 ARM64 · unsupported legacy run/);
  assert.match(phoneRouteScript, /Android 15 ARM64 · unsupported legacy run/);
  assert.match(githubScript, /\["android15", "android15-arm64"\]\.includes\(run\.inputs\?\.edition\)/);
});

test("workflow dispatch refuses the paused ARM64 profile before GitHub access", async () => {
  await assert.rejects(dispatchPhone("phone-test", {}, "android15-arm64"), error => {
    assert.equal(error.code, "UNSUPPORTED_EDITION");
    assert.equal(error.message, "Unsupported Android edition.");
    return true;
  });
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

test("crash-log download is authenticated and reads the Android crash buffer", () => {
  const getHandler = viewerScript.indexOf("    def do_GET(self):");
  const authCheck = viewerScript.indexOf("        if not authed(self):", getHandler);
  const crashRoute = viewerScript.indexOf('        if path == "/crash-log":', getHandler);
  assert.ok(getHandler >= 0, "GET handler should exist");
  assert.ok(authCheck > getHandler, "crash-log requests should pass authentication first");
  assert.ok(crashRoute > authCheck, "crash-log route should be inside the authenticated GET handler");
  assert.match(viewerScript, /"logcat", "-b", "crash", "-d", "-t", "250"/);
  assert.match(viewerScript, /Cloud Phone runtime context/);
  assert.match(viewerScript, /ro\.product\.cpu\.abi/);
  assert.match(viewerScript, /ro\.dalvik\.vm\.native\.bridge/);
  assert.match(viewerScript, /Android crash buffer \(logcat -b crash\)/);
  assert.match(dashboardScript, /Download the latest Android crash trace/);
  assert.match(dashboardScript, /\/crash-log/);
});
