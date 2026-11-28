import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dispatchPhone } from "../functions/_lib/github.js";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const startScript = read("../scripts/mobile-phone/start.sh");
const workflowScript = read("../.github/workflows/cloud-phone.yml");
const viewerScript = read("../scripts/mobile-phone/viewer.py");
const githubScript = read("../functions/_lib/github.js");
const phonesApiScript = read("../functions/api/phones.js");
const dashboardScript = read("../cloudflare-pages/src/shared/Dashboard.jsx");
const phoneRouteScript = read("../cloudflare-pages/src/shared/PhoneRoute.jsx");

test("Android Emulator and Cuttlefish both mirror only the Android display", () => {
  assert.match(startScript, /nohup "\$SDK\/emulator\/emulator" -avd phone -no-window/);
  assert.match(startScript, /nohup cvd --group_name="\$CVD_GROUP" create/);
  assert.match(startScript, /scrcpy --fullscreen --prefer-text/);
  assert.match(startScript, /--window-borderless --window-title NishCloudPhone/);
  assert.match(startScript, /Xvfb :99 -screen 0 432x768x24/);
  assert.doesNotMatch(startScript, /-clip\s+\d+x\d+/);
  assert.doesNotMatch(startScript, /--no-control|--no-clipboard-autosync/);
});

test("selected phone RAM, CPU, and disk settings reach both runtime engines", () => {
  assert.match(startScript, /set_avd_config hw\.ramSize "\$\{RAM_MB\}M"/);
  assert.match(startScript, /-memory "\$RAM_MB" -cores "\$CPU_CORES"/);
  assert.match(startScript, /-partition-size "\$\(\(DISK_GB \* 1024\)\)"/);
  assert.match(startScript, /--cpus="\$CPU_CORES" --memory_mb="\$RAM_MB"/);
  assert.match(startScript, /--blank_data_image_mb="\$\(\(DISK_GB \* 1024\)\)" --data_policy=always_create/);
  assert.doesNotMatch(startScript, /-memory 4096 -cores 4/);
});

test("ARM64 selects a native Cuttlefish build on a KVM-capable runner", () => {
  assert.match(workflowScript, /default: "android11"[\s\S]*options: \["android11", "android15", "android15-arm64"\]/);
  assert.match(workflowScript, /inputs\.edition == 'android15-arm64' && fromJSON\('\["self-hosted", "linux", "ARM64", "kvm"\]'\) \|\| 'ubuntu-latest'/);
  assert.match(workflowScript, /Verify ARM64 KVM runner/);
  assert.match(workflowScript, /\[ -c \/dev\/kvm \]/);
  assert.match(workflowScript, /MEMORY_MB[\s\S]*-ge 15000/);
  assert.match(workflowScript, /CPU_COUNT[\s\S]*-ge 4/);
  assert.match(workflowScript, /self-hosted.*linux.*ARM64.*kvm/);

  const preflightIndex = workflowScript.indexOf("- name: Verify ARM64 KVM runner");
  const screenServiceIndex = workflowScript.indexOf("- name: Start screen service");
  assert.ok(preflightIndex >= 0 && screenServiceIndex > preflightIndex, "KVM preflight must run before publishing a viewer");

  assert.match(startScript, /android11\) ANDROID_API_LEVEL=30; ANDROID_VERSION=11; ANDROID_ABI=x86_64/);
  assert.match(startScript, /android15\) ANDROID_API_LEVEL=35; ANDROID_VERSION=15; ANDROID_ABI=x86_64/);
  assert.match(startScript, /android15-arm64\) ANDROID_API_LEVEL=35; ANDROID_VERSION=15; ANDROID_ABI=arm64-v8a/);
  assert.match(startScript, /if \[ "\$EDITION" != "android15-arm64" \]; then\s+mkdir -p "\$SDK_EARLY"/);
  assert.match(startScript, /CVD_BUILD="android15-qpr2-release\/aosp_cf_arm64_only_phone-userdebug"/);
  assert.match(startScript, /PHONE_SYSTEM_IMAGE="Cuttlefish \$CVD_BUILD"/);
  assert.match(startScript, /cvd fetch --default_build="\$CVD_BUILD" --target_directory="\$CVD_DIR"/);
  assert.match(startScript, /cvd --group_name="\$CVD_GROUP" create/);
  assert.match(startScript, /SERIAL="localhost:6520"/);
  assert.match(startScript, /Android 15 ARM64 Cuttlefish requires an ARM64 host/);
  assert.match(startScript, /Android 15 ARM64 Cuttlefish requires a readable and writable \/dev\/kvm/);

  const runtimeCacheStart = workflowScript.indexOf("- name: Cache Android runtime");
  const runtimeCacheEnd = workflowScript.indexOf("- name: Start Cloud Phone", runtimeCacheStart);
  const runtimeCache = workflowScript.slice(runtimeCacheStart, runtimeCacheEnd);
  assert.match(runtimeCache, /\.phone-vm\/cuttlefish/);
  assert.match(runtimeCache, /cloud-phone-runtime-v9-\$\{\{ inputs\.edition \}\}/);
  assert.match(workflowScript, /steps\.start_phone\.outputs\.runtime_cache_ready/);
  assert.match(workflowScript, /cvd --group_name="\$CVD_GROUP" status/);
  assert.match(workflowScript, /Stop Cloud Phone processes on the runner/);
  assert.match(workflowScript, /stop --clear_instance_dirs/);
  assert.match(workflowScript, /cuttlefish\/host\/usr\/bin\/adb" kill-server/);

  assert.match(workflowScript, /sudo modprobe kvm/);
  assert.match(workflowScript, /cloudflared-bin-v2-\$\{\{ runner\.arch \}\}/);
  assert.match(startScript, /SCREEN_START_TIMEOUT=180/);
  assert.match(startScript, /SCREEN_START_TIMEOUT=960/);
  assert.match(startScript, /BOOT_WAIT_ATTEMPTS=120/);
  assert.match(startScript, /BOOT_WAIT_ATTEMPTS=180/);
  assert.match(workflowScript, /PHASE: "1"\s+EDITION: \$\{\{ inputs\.edition \}\}/);
  assert.match(phonesApiScript, /PHONE_EDITIONS = new Set\(\["android11", "android15", "android15-arm64"\]\)/);
  assert.match(githubScript, /\["android11", "android15", "android15-arm64"\]\.includes\(edition\)/);
  assert.match(githubScript, /\["android15", "android15-arm64"\]\.includes\(run\.inputs\?\.edition\)/);
  assert.match(dashboardScript, /value="android15-arm64">Android 15 ARM64 \(KVM\)/);
  assert.match(dashboardScript, /Android 15 ARM64 · KVM/);
  assert.match(phoneRouteScript, /Android 15 ARM64 · KVM/);
  assert.doesNotMatch([workflowScript, phonesApiScript, dashboardScript, phoneRouteScript].join("\n"), /Android 15 ARM64 is paused|unsupported legacy run/i);
});

test("ARM64 dispatch includes the selected Android 15 ARM64 edition", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return new Response(null, { status: 204 });
  };
  try {
    await dispatchPhone("phone-test", { GITHUB_TOKEN: "test-token" }, "android15-arm64");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.match(request.url, /cloud-phone\.yml\/dispatches$/);
  assert.equal(request.body.inputs.edition, "android15-arm64");
});

test("unsupported Android editions are rejected before GitHub access", async () => {
  await assert.rejects(dispatchPhone("phone-test", {}, "android14"), error => {
    assert.equal(error.code, "UNSUPPORTED_EDITION");
    assert.equal(error.message, "Unsupported Android edition.");
    return true;
  });
});

test("soft keyboard configuration precedes Android Emulator launch and VNC accepts mapped keys", () => {
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
