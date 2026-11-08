#!/usr/bin/env python3
"""NishCloudPhone own fast viewer (no noVNC).

Pipeline: Android screenrecord (H.264) -> ffmpeg -> MJPEG frames shared to
browsers. Input goes back over ADB: tap / swipe / keys / typed text / paste.
That is far lower-latency than VNC framebuffer polling, and the page is our
own HTML: a secure password input first, then the live phone screen.

Env: VIEWER_PORT (8081), PHONE_PASSWORD (gate + API key), PHONE_W,H (720x1280)
Only stdlib + adb + ffmpeg are used.
"""
import hashlib, hmac, json, os, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("VIEWER_PORT", "8081"))
PASSWORD = os.getenv("PHONE_PASSWORD", "")
SERIAL = os.environ.get("ADB_SERIAL", "127.0.0.1:5555")
DW, DH = 720, 1280          # device pixels (tap mapping)
SW, SH = 540, 960           # stream pixels (fast)
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
            adb("connect", SERIAL, timeout=10)
            rec = subprocess.Popen(
                ["adb", "-s", SERIAL, "exec-out", "screenrecord",
                 "--output-format=h264", f"--size={SW}x{SH}",
                 "--bit-rate=2500000", "--time-limit=170", "-"],
                stdout=subprocess.PIPE)
            ff = subprocess.Popen(
                ["ffmpeg", "-hide_banner", "-loglevel", "error",
                 "-fflags", "nobuffer", "-flags", "low_delay",
                 "-i", "pipe:0", "-vf", "fps=18", "-q:v", "6",
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
body{margin:0;background:#070b16;color:#e8eefc;font-family:system-ui;text-align:center}
#gate{margin:18vh auto;max-width:320px;background:#0d1528;padding:28px;border-radius:20px;border:1px solid #1d2b4d}
input,button{padding:12px;border-radius:12px;border:1px solid #2a3a63;background:#0a1122;color:#fff;font-size:16px}
button{background:linear-gradient(135deg,#2563eb,#7c3aed);font-weight:700;cursor:pointer}
#bar{display:flex;gap:8px;justify-content:center;padding:10px;flex-wrap:wrap}
#bar button{background:#1b2745;font-size:14px}
#scr{max-width:min(96vw,430px);max-height:82vh;border:6px solid #1f2a47;border-radius:28px;touch-action:none;background:#000}
#kbd{position:absolute;opacity:0;pointer-events:none}
</style></head><body>
<div id="gate"><h2>☁️📱 NishCloudPhone</h2><p>Enter the phone password</p>
<form id="f"><input type="password" id="pw" placeholder="Password" autocomplete="current-password"><br><br>
<button style="width:100%">Connect →</button></form><p id="e" style="color:#ff8fab"></p></div>
<div id="app" style="display:none">
 <div id="bar">
  <button data-k="187">◁ Back</button><button data-k="3">● Home</button><button data-k="187" id="rec" data-k2="82">▤ Apps</button>
  <button id="clip">📋 Paste my clipboard</button><button id="kbdbtn">⌨️ Keyboard</button>
 </div>
 <img id="scr" alt="Cloud Phone screen"><textarea id="kbd" autocomplete="off"></textarea>
</div>
<script>
const $=s=>document.querySelector(s); let lastVal="";
$('#f').onsubmit=async e=>{e.preventDefault();
 const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#pw').value})});
 if(r.ok){$('#gate').style.display='none';$('#app').style.display='block';$('#scr').src='/stream.mjpg?t='+Date.now();}
 else $('#e').textContent='Wrong password';};
const post=(u,b)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});
document.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>post('/key',{code:+b.dataset.k}));
$('#clip').onclick=async()=>{try{const t=await navigator.clipboard.readText(); if(t) post('/text',{text:t});}catch(e){alert('Clipboard blocked - tap Keyboard and paste there');$('#kbd').focus();}};
$('#kbdbtn').onclick=()=>{lastVal='';$('#kbd').value='';$('#kbd').focus();};
$('#kbd').addEventListener('input',e=>{const v=e.target.value; if(v.length>lastVal.length) post('/text',{text:v.slice(lastVal.length)}); else if(v.length<lastVal.length) post('/key',{code:67}); lastVal=v;});
let down=null; const img=$('#scr');
const pos=e=>{const r=img.getBoundingClientRect();return{x:Math.round((e.clientX-r.left)/r.width*720),y:Math.round((e.clientY-r.top)/r.height*1280)}};
img.addEventListener('pointerdown',e=>{down=pos(e);img.setPointerCapture(e.pointerId)});
img.addEventListener('pointerup',e=>{if(!down)return;const u=pos(e);
 if(Math.abs(u.x-down.x)<12&&Math.abs(u.y-down.y)<12) post('/tap',down); else post('/swipe',{x1:down.x,y1:down.y,x2:u.x,y2:u.y,duration:180}); down=null;});
img.addEventListener('contextmenu',e=>e.preventDefault());
</script></body></html>"""

def authed(h):
    if not PASSWORD:
        return True
    cookie = h.headers.get("Cookie", "")
    return f"ncp_view={TOKEN}" in cookie

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
        if self.path in ("/", "/index.html"):
            return self._send(200, HTML)
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
        n = int(self.headers.get("Content-Length", 0))
        try: body = json.loads(self.rfile.read(n) or b"{}")
        except Exception: body = {}
        if self.path == "/login":
            ok = hmac.compare_digest(str(body.get("password", "")), PASSWORD) if PASSWORD else True
            if not ok: return self._send(401, json.dumps({"error": "wrong password"}), "application/json")
            return self._send(200, "{}", "application/json",
                              {"Set-Cookie": f"ncp_view={TOKEN}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400"})
        if not authed(self): return self._send(401, "login first")
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
    print(f"viewer on :{PORT} device={DW}x{DH} stream={SW}x{SH}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
