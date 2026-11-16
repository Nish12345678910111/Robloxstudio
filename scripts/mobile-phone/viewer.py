#!/usr/bin/env python3
"""NishCloudPhone viewer for the official Android Emulator (no QEMU, no VNC).

Pipeline: Android screenrecord (H.264) -> ffmpeg -> MJPEG frames shared to
browsers, with an ADB screencap rescue that grabs a real frame whenever the
stream stalls (e.g. while the emulator is still booting). Input goes back
over ADB: tap / swipe / keys / typed text / paste.

Env: VIEWER_PORT (8081), PHONE_PASSWORD (gate + API key), ADB_SERIAL.
Only stdlib + adb + ffmpeg are used.
"""
import hashlib, hmac, json, os, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VIEWER_PORT", "8081"))

_last_wake = [0.0]
def grab_screencap():
    """Rescue frame straight from the emulator via ADB screencap -> JPEG."""
    try:
        r = subprocess.run(["adb", "-s", SERIAL, "exec-out", "screencap", "-p"],
                           capture_output=True, timeout=15)
        if not r.stdout or len(r.stdout) < 2000:
            return
        c = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0",
                            "-vf", f"scale={SW}:{SH}", "-q:v", "5", "-f", "image2pipe",
                            "-vcodec", "mjpeg", "pipe:1"],
                           input=r.stdout, capture_output=True, timeout=15)
        if c.stdout and len(c.stdout) > 2000:
            with lock:
                latest["jpg"], latest["t"] = c.stdout, time.time()
    except Exception as e:
        print("screencap error:", e, flush=True)

def run_dump_pipeline():
    """Whenever the live stream stalls >3s, grab a real frame so the screen
    is never stuck black (boot, GPU hiccup, stream restart)."""
    time.sleep(3)
    while True:
        with lock:
            stale = time.time() - latest["t"] > 3
        if stale:
            if time.time() - _last_wake[0] > 8:
                _last_wake[0] = time.time()
                adb("shell", "input", "keyevent", "224")  # wake display
            grab_screencap()
            time.sleep(0.5)
        else:
            time.sleep(0.5)

PASSWORD = os.getenv("PHONE_PASSWORD", "")
SERIAL = os.environ.get("ADB_SERIAL", "127.0.0.1:5555")
DW, DH = 540, 960           # device pixels (tap mapping)
SW, SH = 432, 768           # stream pixels (light = fast frames)
TOKEN = hashlib.sha256(PASSWORD.encode()).hexdigest() if PASSWORD else ""

latest = {"jpg": None, "t": 0.0}
lock = threading.Lock()

def adb(*args, timeout=15):
    try:
        return subprocess.run(["adb", "-s", SERIAL, *args],
                              capture_output=True, text=True, timeout=timeout)
    except Exception as e:
        print("adb error:", e, flush=True)

def run_pipeline():
    """Keep one shared screencap pipeline alive forever, store latest JPEG."""
    while True:
        try:
            if ":" in SERIAL: adb("connect", SERIAL, timeout=10)
            rec = subprocess.Popen(
                ["adb", "-s", SERIAL, "exec-out", "screenrecord",
                 "--output-format=h264", f"--size={SW}x{SH}",
                 "--bit-rate=1400000", "--time-limit=170", "-"],
                stdout=subprocess.PIPE)
            ff = subprocess.Popen(
                ["ffmpeg", "-hide_banner", "-loglevel", "error",
                 "-fflags", "nobuffer", "-flags", "low_delay",
                 "-i", "pipe:0", "-vf", "fps=15", "-q:v", "7",
                 "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
                stdin=rec.stdout, stdout=subprocess.PIPE)
            buf = b""
            while True:
                chunk = ff.stdout.read(65536)
                if not chunk:
                    break
                buf += chunk
                # split JPEG frames SOI..EOI
                while True:
                    a = buf.find(b"\xff\xd8")
                    b = buf.find(b"\xff\xd9", a + 2) if a >= 0 else -1
                    if a < 0 or b < 0:
                        break
                    frame = buf[a:b + 2]
                    buf = buf[b + 2:]
                    with lock:
                        latest["jpg"], latest["t"] = frame, time.time()
                if len(buf) > 4_000_000:
                    buf = b""
            rec.kill(); ff.kill()
        except Exception as e:
            print("pipeline error:", e, flush=True)
        time.sleep(2)

HTML = """<!doctype html><html><head><meta charset=utf-8>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>NishCloudPhone</title><style>
html,body{height:100%;overflow:hidden}body{margin:0;background:#070b16;color:#e8eefc;font-family:system-ui;text-align:center}
#gate{margin:18vh auto;max-width:320px;background:#0d1528;padding:28px;border-radius:20px;border:1px solid #1d2b4d}
input,button{padding:12px;border-radius:12px;border:1px solid #2a3a63;background:#0a1122;color:#fff;font-size:16px}
button{background:linear-gradient(135deg,#2563eb,#7c3aed);font-weight:700;cursor:pointer}
#bar{position:fixed;left:8px;right:62px;bottom:10px;display:flex;gap:2px;background:rgba(10,16,32,.88);backdrop-filter:blur(10px);padding:6px 8px;border-radius:999px;border:1px solid #2a3a63;z-index:9;transition:transform .25s ease,opacity .25s ease;overflow-x:auto;scrollbar-width:none}
#bar.hide{transform:translateY(140%);opacity:0;pointer-events:none}
#bar::-webkit-scrollbar{display:none}
#bar button{background:transparent;border:0;font-size:12px;padding:8px 9px;white-space:nowrap;border-radius:999px;flex:none}
#tgl{position:fixed;right:10px;bottom:10px;z-index:10;width:42px;height:42px;border-radius:50%;background:rgba(10,16,32,.9);border:1px solid #2a3a63;font-size:19px;line-height:1}
#scr{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;touch-action:none;background:#000;display:block}
#kbd{position:absolute;opacity:0;pointer-events:none}
</style></head><body>
<div id="gate"><h2>☁️📱 NishCloudPhone</h2><p>Enter the phone password</p>
<form id="f"><input type="password" id="pw" placeholder="Password" autocomplete="current-password"><br><br>
<button style="width:100%">Connect →</button></form><p id="e" style="color:#ff8fab"></p></div>
<div id="app" style="display:none">
 <div id="wait" style="position:fixed;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;background:#070b16;z-index:5">
 <div style="width:42px;height:42px;border-radius:50%;border:4px solid #22335e;border-top-color:#4f7cff;animation:sp .9s linear infinite"></div>
 <p style="color:#8ea3cc">Connecting to your phone screen…</p></div>
 <style>@keyframes sp{to{transform:rotate(360deg)}}</style>
 <div id="bar">
  <button data-k="187">◁ Back</button><button data-k="3">● Home</button><button data-k="187" id="rec" data-k2="82">▤ Apps</button>
  <button id="clip">📋 Paste my clipboard</button><button id="kbdbtn">⌨️ Keyboard</button>
 </div>
 <img id="scr" alt=""><textarea id="kbd" autocomplete="off"></textarea>
 <button id="tgl" title="Show / hide buttons">⌄</button>
</div>
<script>
const $=s=>document.querySelector(s); let lastVal="";
if(window.__EMBED){startScreen();}
function startScreen(){$('#gate').style.display='none';$('#app').style.display='block';const img=$('#scr'); const k=window.__TOK||'';
 const boot=()=>{img.src='/stream.mjpg?t='+k+'&x='+Date.now();}; boot(); img.onerror=()=>setTimeout(boot,2000);
 const chk=setInterval(async()=>{try{const r=await fetch('/frame.jpg?t='+k); if(r.ok){$('#wait').style.display='none'; clearInterval(chk);}}catch(e){}},1500);}
$('#f').onsubmit=async e=>{e.preventDefault();
 const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#pw').value})});
 if(r.ok){startScreen();}
 else $('#e').textContent='Wrong password';};
const post=(u,b)=>fetch(u+'?t='+(window.__TOK||''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>post('/key',{code:+b.dataset.k}));
$('#clip').onclick=async()=>{try{const t=await navigator.clipboard.readText(); if(t) post('/text',{text:t});}catch(e){alert('Clipboard blocked - tap Keyboard and paste there');$('#kbd').focus();}};
$('#kbdbtn').onclick=()=>{lastVal='';$('#kbd').value='';$('#kbd').focus();};
$('#kbd').addEventListener('input',e=>{const v=e.target.value; if(v.length>lastVal.length) post('/text',{text:v.slice(lastVal.length)}); else if(v.length<lastVal.length) post('/key',{code:67}); lastVal=v;});
$('#tgl').onclick=()=>{const b=$('#bar'),h=b.classList.toggle('hide');$('#tgl').textContent=h?'⌃':'⌄';};
let down=null; const img=$('#scr');
const pos=e=>{const r=img.getBoundingClientRect();return{x:Math.round((e.clientX-r.left)/r.width*540),y:Math.round((e.clientY-r.top)/r.height*960)}};
img.addEventListener('pointerdown',e=>{down=pos(e);img.setPointerCapture(e.pointerId)});
img.addEventListener('pointerup',e=>{if(!down)return;const u=pos(e);
 if(Math.abs(u.x-down.x)<12&&Math.abs(u.y-down.y)<12) post('/tap',down); else post('/swipe',{x1:down.x,y1:down.y,x2:u.x,y2:u.y,duration:180}); down=null;});
img.addEventListener('contextmenu',e=>e.preventDefault());
</script></body></html>"""

def authed(h):
    if not PASSWORD:
        return True
    cookie = h.headers.get("Cookie", "")
    if f"ncp_view={TOKEN}" in cookie:
        return True
    try:
        from urllib.parse import urlparse, parse_qs
        t = (parse_qs(urlparse(h.path).query).get("t") or [""])[0]
        return bool(t) and hmac.compare_digest(t, TOKEN)
    except Exception:
        return False

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def _send(self, code, body, ctype="text/html", extra=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.path in ("/", "/index.html") or self.path.startswith("/?") or self.path.startswith("/index.html?"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            if (qs.get("t") or [""])[0] == TOKEN and TOKEN:
                page = HTML.replace("const $=s=>document.querySelector(s);",
                                    "const $=s=>document.querySelector(s); window.__EMBED=1; window.__TOK='" + TOKEN + "';")
                return self._send(200, page, extra={"Set-Cookie": f"ncp_view={TOKEN}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=86400"})
            return self._send(200, HTML)
        if self.path.startswith("/frame.jpg"):
            if not authed(self): return self._send(401, "login first")
            with lock: jpg = latest["jpg"]
            if not jpg: return self._send(503, "no frame yet")
            return self._send(200, jpg, "image/jpeg")
        if self.path.startswith("/stream.mjpg"):
            if not authed(self): return self._send(401, "login first")
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            last = 0.0
            try:
                while True:
                    with lock: jpg, t = latest["jpg"], latest["t"]
                    if jpg and t != last:
                        last = t
                        self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n")
                    else:
                        time.sleep(0.03)
            except (BrokenPipeError, ConnectionResetError):
                return
        return self._send(404, "not found")
    def do_POST(self):
        from urllib.parse import urlparse
        _authed_first = authed(self)  # token rides in the query - check BEFORE stripping it
        self.path = urlparse(self.path).path
        n = int(self.headers.get("Content-Length", 0))
        try: body = json.loads(self.rfile.read(n) or b"{}")
        except Exception: body = {}
        if self.path == "/login":
            ok = hmac.compare_digest(str(body.get("password", "")), PASSWORD) if PASSWORD else True
            if not ok: return self._send(401, json.dumps({"error": "wrong password"}), "application/json")
            return self._send(200, "{}", "application/json",
                              {"Set-Cookie": f"ncp_view={TOKEN}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400"})
        if not _authed_first: return self._send(401, "login first")
        if self.path == "/tap":
            adb("shell", "input", "tap", str(int(body["x"])), str(int(body["y"])))
        elif self.path == "/swipe":
            adb("shell", "input", "swipe", str(int(body["x1"])), str(int(body["y1"])),
                str(int(body["x2"])), str(int(body["y2"])), str(int(body.get("duration", 180))))
        elif self.path == "/key":
            adb("shell", "input", "keyevent", str(int(body["code"])))
        elif self.path == "/text":
            text = str(body.get("text", ""))[:2000]
            if text:
                # `input text` needs %s for spaces and shell escaping
                esc = text.replace("\\", "\\\\").replace('"', '\\"').replace("'", "'\\''")
                esc = esc.replace(" ", "%s").replace("\n", "%s")
                adb("shell", f'input text "{esc}"')
        elif self.path == "/getclip":
            r = adb("shell", "cmd", "clipboard", "get")
            return self._send(200, json.dumps({"text": (r.stdout or "")[:2000]}), "application/json")
        else:
            return self._send(404, "not found")
        return self._send(200, "{}", "application/json")

if __name__ == "__main__":
    threading.Thread(target=run_pipeline, daemon=True).start()
    threading.Thread(target=run_dump_pipeline, daemon=True).start()
    print(f"viewer on :{PORT} device={DW}x{DH} stream={SW}x{SH}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
