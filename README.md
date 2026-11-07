# Robloxstudio

## 📱 Mobile Phone workflow (QEMU + noVNC + Cloudflare)

A GitHub Actions workflow that runs a **mobile phone (Android-x86) inside
QEMU**, shows its screen in your browser with **noVNC**, and gives you a
**randomly generated public Cloudflare URL** — protected by a **password**.

Workflow file: [`.github/workflows/mobile-phone-qemu-novnc.yml`](.github/workflows/mobile-phone-qemu-novnc.yml)
· Engine script: [`scripts/mobile-phone/start.sh`](scripts/mobile-phone/start.sh)
(The old Windows RDP workflow in `main.yml` is unchanged.)

### How to use it

1. Go to the **Actions** tab → **📱 Mobile Phone (QEMU + noVNC + Cloudflare)** → **Run workflow**.
2. Optionally set RAM / CPU / storage / session length. Leave *VNC password*
   empty to get a random one (recommended).
3. Open the running job → step **“📱 Boot phone + start noVNC + open Cloudflare tunnel”**.
   After ~1–3 minutes it prints a banner like:

   ```
   ====================================================================
     📱  YOUR MOBILE PHONE IS LIVE
   ====================================================================
     Cloudflare URL : https://random-words.trycloudflare.com/vnc.html?autoconnect=true&resize=scale
     VNC Password   : Ab3xY9kq
   ```

   The same URL + password also appear in the run's **Summary** page.
4. Open the **Cloudflare URL** in any browser (PC or another phone), click
   **Connect**, and type the **VNC password**.
5. You're on the phone. Mouse click = tap, drag = swipe. First Android boot
   can take 2–5 minutes; if you see a boot menu, choose
   **“Live CD – Run Android-x86 without installation”**.
6. To switch the phone off: **Actions → the running run → Cancel workflow.**
   Everything (phone, disk, tunnel) is deleted when the run ends.

### How it works

```
Browser ──HTTPS──► Cloudflare (random *.trycloudflare.com URL)
                        │  outbound-only tunnel (cloudflared, no account/token)
                        ▼
              noVNC / websockify  127.0.0.1:6080
                        │  VNC password auth (8 chars - VNC protocol limit)
                        ▼
              QEMU  Android-x86  720×1280 portrait, virtio disk/net, USB tablet (= touch)
                        └─ KVM acceleration if /dev/kvm exists, else TCG emulation
```

* No inbound ports, no secrets, and no Cloudflare/Tailscale account needed —
  Quick Tunnels are free, anonymous and random per run.
* The URL is re-printed in the log every 5 minutes so it's easy to find.
* The Android ISO (~900 MB) is cached between runs with `actions/cache`.

### Run it locally (Linux)

```bash
sudo apt install qemu-system-x86 qemu-utils novnc websockify socat cloudflared curl
./scripts/mobile-phone/start.sh   # prints the Cloudflare URL + password
```

### Notes & limits

* GitHub-hosted jobs max out at **360 minutes** — that's the longest session.
* Android-x86 9.0 is used because it boots reliably under QEMU on x86_64
  runners; ARM phone images would be far too slow under emulation here.
* Treat **both** the URL and the password as secrets: anyone who has both
  can control the phone screen.
* VNC passwords are limited to **8 characters** by the VNC protocol itself,
  which is why the generated password is 8 characters long.

---

## ☁️ NishCloudPhone dashboard (Vercel)

Website project: **nishcloudphone** on Vercel, connected to this GitHub repo.

- Login-protected dashboard (password in Vercel env `DASHBOARD_PASSWORD`, httpOnly HMAC session cookie, security headers, timing-safe compare).
- **+ New Cloud Phone** button dispatches the `Cloud Phone` workflow per click — create as many phones as GitHub lets you run concurrently; each card shows `Url - ...` / `Password - ...` and embeds the live noVNC screen inside a phone-sized box when initialized. Stop button cancels that run.
- URL/password are fetched **server-side only** from the run's private `cloud-phone-info` Actions artifact. The GitHub token is **only** a Vercel server env var (`GITHUB_TOKEN`, fine-grained PAT with Actions read/write on this repo) — never in browser code, never in the repo.
- **Max specs per phone:** 4 vCPU · 12 GB RAM · 32 GB storage · 340 min keep-alive (GitHub hard-kills jobs at ~360 min, so "forever" isn't possible on Actions — when a phone dies, create a new one).
