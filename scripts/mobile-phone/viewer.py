#!/usr/bin/env python3
"""Password-gated reverse proxy for the official noVNC web client.

The phone screen is served by x11vnc + websockify + noVNC. This process only
adds the phone-password gate, proxies the noVNC page/assets/WebSocket, and
handles APK installation from the dashboard. It deliberately has no MJPEG,
screenshot, or alternate screen renderer: both exposed screens use noVNC.
"""
import hashlib
import hmac
import http.client
import json
import os
import select
import shutil
import socket
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

PORT = int(os.environ.get("VIEWER_PORT", "8081"))
VNC_BACKEND = ("127.0.0.1", int(os.environ.get("NOVNC_PORT", "6080")))
PASSWORD = os.getenv("PHONE_PASSWORD", "")
SERIAL = os.environ.get("ADB_SERIAL", "emulator-5554")
TOKEN = hashlib.sha256(PASSWORD.encode()).hexdigest() if PASSWORD else ""
ADB = shutil.which("adb") or next((p for p in (
    "/usr/local/lib/android/sdk/platform-tools/adb",
    os.path.expanduser("~/Android/Sdk/platform-tools/adb"),
) if os.path.exists(p)), "adb")

LOGIN_PAGE = """<!doctype html><html><head><meta charset=utf-8>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to cloud phone</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b16;color:#e8eefc;font:16px system-ui}
main{width:min(92vw,360px);padding:28px;border:1px solid #26375c;border-radius:18px;background:#0d1528}
h1{font-size:22px;margin:0 0 8px}p{color:#9aabcd}input,button{width:100%;padding:13px;border-radius:10px;font:inherit}
input{border:1px solid #34476f;background:#070b16;color:#fff;margin:12px 0}button{border:0;background:#3973f6;color:#fff;font-weight:700;cursor:pointer}
#error{min-height:1.3em;color:#ff8fab}
</style></head><body><main><h1>☁️📱 NishCloudPhone</h1>
<p>Enter the phone password to open the noVNC screen.</p>
<form id="form"><input id="password" type="password" autocomplete="current-password" placeholder="Phone password" required>
<button>Connect to phone</button></form><p id="error" role="alert"></p></main>
<script>document.querySelector('#form').addEventListener('submit',async e=>{e.preventDefault();
 const password=document.querySelector('#password').value;const error=document.querySelector('#error');error.textContent='';
 try{const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
 if(!r.ok){error.textContent='Wrong password';return;}const d=await r.json();const u=new URL(d.t?'/s/'+encodeURIComponent(d.t)+'/vnc.html':'/vnc/vnc.html',location.href);
 u.searchParams.set('autoconnect','true');u.searchParams.set('resize','scale');u.searchParams.set('host','');u.searchParams.set('port','0');u.searchParams.set('password',password);if(d.t){u.searchParams.set('t',d.t);u.searchParams.set('path','/s/'+d.t+'/websockify');}location.replace(u);
 }catch(_){error.textContent='Could not reach the phone. Please try again.';}});</script></body></html>"""

STARTING_PAGE = """<!doctype html><html><head><meta charset=utf-8>
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Cache-Control" content="no-store">
<title>Phone screen starting</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b16;color:#dbe7ff;font:16px system-ui;text-align:center}p{color:#9aabcd}</style></head>
<body><main><h2>📱 noVNC screen starting</h2><p>The phone display is still initializing. This page will reconnect automatically.</p></main>
<script>setTimeout(()=>location.reload(),2500);</script></body></html>"""


def vnc_up():
    try:
        with socket.create_connection(VNC_BACKEND, timeout=1):
            return True
    except OSError:
        return False


def _query(path):
    return parse_qs(urlsplit(path).query)


def token_path(path):
    parsed = urlsplit(path)
    parts = parsed.path.split("/", 3)
    if len(parts) < 3 or parts[1] != "s" or not TOKEN:
        return None
    if not hmac.compare_digest(parts[2], TOKEN):
        return None
    tail = parts[3] if len(parts) == 4 else ""
    return "/" + tail + (("?" + parsed.query) if parsed.query else "")


def authed(handler):
    if not PASSWORD:
        return True
    if token_path(handler.path) is not None:
        return True
    query = _query(handler.path)
    supplied_password = (query.get("password") or [""])[0]
    supplied_token = (query.get("t") or [""])[0]
    if supplied_password and hmac.compare_digest(supplied_password, PASSWORD):
        return True
    if supplied_token and hmac.compare_digest(supplied_token, TOKEN):
        return True
    cookie = handler.headers.get("Cookie", "")
    for item in cookie.split(";"):
        name, _, value = item.strip().partition("=")
        if name == "ncp_view" and hmac.compare_digest(value, TOKEN):
            return True
    return False


def session_cookie():
    if not TOKEN:
        return None
    return f"ncp_view={TOKEN}; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=86400"


def no_vnc_url():
    prefix = f"/s/{TOKEN}" if TOKEN else ""
    params = {"autoconnect": "true", "resize": "scale", "host": "", "port": "0",
              "path": f"{prefix}/websockify" if prefix else "websockify"}
    if PASSWORD:
        params["password"] = PASSWORD
    if TOKEN:
        params["t"] = TOKEN
    return f"{prefix}/vnc.html?" + urlencode(params)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        cookie = session_cookie()
        if cookie:
            self.send_header("Set-Cookie", cookie)
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if data:
            self.wfile.write(data)

    def _redirect(self, path):
        self.send_response(302)
        self.send_header("Location", path)
        self.send_header("Cache-Control", "no-store")
        cookie = session_cookie()
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", "0")
        self.end_headers()

    @staticmethod
    def _backend_path(path):
        routed = token_path(path)
        if routed is not None:
            return routed
        parsed = urlsplit(path)
        clean = parsed.path
        if clean == "/vnc":
            clean = "/vnc.html"
        elif clean.startswith("/vnc/"):
            clean = clean[4:]
        return clean + (("?" + parsed.query) if parsed.query else "")

    def _proxy_http(self, path=None):
        connection = None
        try:
            connection = http.client.HTTPConnection(*VNC_BACKEND, timeout=30)
            headers = {key: value for key, value in self.headers.items()
                       if key.lower() not in ("host", "connection", "content-length", "transfer-encoding")}
            headers["Host"] = f"{VNC_BACKEND[0]}:{VNC_BACKEND[1]}"
            connection.request("GET", path or self._backend_path(self.path), headers=headers)
            response = connection.getresponse()
            data = response.read()
            self.send_response(response.status)
            for key, value in response.getheaders():
                if key.lower() in ("connection", "transfer-encoding", "content-length", "cache-control", "set-cookie"):
                    continue
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            cookie = session_cookie()
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            if data:
                self.wfile.write(data)
        except Exception:
            self._send(502, "noVNC screen is temporarily unavailable")
        finally:
            if connection:
                connection.close()

    def _proxy_ws(self, path=None):
        upstream = None
        try:
            upstream = socket.create_connection(VNC_BACKEND, timeout=10)
            target = path or self._backend_path(self.path)
            lines = [f"GET {target} HTTP/1.1"]
            for key, value in self.headers.items():
                if key.lower() == "host":
                    value = f"{VNC_BACKEND[0]}:{VNC_BACKEND[1]}"
                lines.append(f"{key}: {value}")
            upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())
            upstream.settimeout(None)
            self.connection.settimeout(None)
            while True:
                ready, _, _ = select.select([upstream, self.connection], [], [], 60)
                if not ready:
                    continue
                closed = False
                for source in ready:
                    data = source.recv(65536)
                    if not data:
                        closed = True
                        break
                    (self.connection if source is upstream else upstream).sendall(data)
                if closed:
                    break
        except Exception:
            pass
        finally:
            if upstream:
                upstream.close()
            try:
                self.connection.close()
            except Exception:
                pass

    def do_GET(self):
        path = urlsplit(self.path).path
        is_websocket = "websocket" in (self.headers.get("Upgrade") or "").lower()
        if not authed(self):
            if path in ("/", "/index.html"):
                return self._send(200, LOGIN_PAGE)
            return self._send(401, "login first")
        if not vnc_up():
            return self._send(503, STARTING_PAGE)
        if is_websocket:
            return self._proxy_ws()
        if path in ("/", "/index.html", "/vnc", "/vnc/vnc.html"):
            return self._redirect(no_vnc_url())
        return self._proxy_http()

    def do_HEAD(self):
        # noVNC uses GET for its assets; keep HEAD requests inside the same
        # password gate rather than exposing the backend directly.
        if not authed(self):
            return self._send(401, "login first")
        if not vnc_up():
            return self._send(503, STARTING_PAGE)
        return self._proxy_http()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.close_connection = True
            return self._send(400, "invalid content length", extra={"Connection": "close"})
        if length < 0 or length > 300 * 1024 * 1024:
            self.close_connection = True
            return self._send(413, "request too large", extra={"Connection": "close"})
        if path == "/login":
            if length > 4096:
                self.close_connection = True
                return self._send(413, "request too large", extra={"Connection": "close"})
            raw_body = self.rfile.read(length) if length else b""
            try:
                body = json.loads(raw_body or b"{}")
            except Exception:
                body = {}
            supplied = str(body.get("password", ""))
            ok = hmac.compare_digest(supplied, PASSWORD) if PASSWORD else True
            if not ok:
                return self._send(401, json.dumps({"error": "wrong password"}), "application/json")
            return self._send(200, json.dumps({"t": TOKEN}), "application/json")
        if not authed(self):
            self.close_connection = True
            return self._send(401, "login first", extra={"Connection": "close"})
        if path != "/install-apk":
            self.close_connection = True
            return self._send(404, "not found", extra={"Connection": "close"})
        if length < 10000:
            self.close_connection = True
            return self._send(400, json.dumps({"ok": False, "message": "That file is not an APK."}), "application/json",
                              {"Access-Control-Allow-Origin": "*", "Connection": "close"})
        raw_body = self.rfile.read(length) if length else b""
        if raw_body[:2] != b"PK":
            return self._send(400, json.dumps({"ok": False, "message": "That file is not an APK."}), "application/json",
                              {"Access-Control-Allow-Origin": "*"})
        try:
            with tempfile.NamedTemporaryFile(prefix="ncp-", suffix=".apk", delete=False) as file:
                file.write(raw_body)
                tmp = file.name
            try:
                result = subprocess.run([ADB, "-s", SERIAL, "install", "-r", "-g", tmp],
                                        capture_output=True, text=True, timeout=300)
                output = ((result.stdout or "") + (result.stderr or "")).strip()
            finally:
                try:
                    os.unlink(tmp)
                except OSError:
                    pass
        except Exception as error:
            output = f"install error: {error}"
        if "Success" in output:
            message, ok = "App installed - check the phone's app drawer.", True
        elif "NO_MATCHING_ABIS" in output or "INSTALL_FAILED_NO_MATCHING" in output:
            message, ok = "This APK is built for a different processor, so this phone cannot run it.", False
        elif "INSTALL_FAILED_ALREADY_EXISTS" in output:
            message, ok = "That app is already installed.", False
        elif "INSTALL_FAILED_INSUFFICIENT_STORAGE" in output:
            message, ok = "The phone is out of storage.", False
        else:
            message, ok = "Install failed: " + (output.splitlines()[-1][:160] if output else "unknown error"), False
        return self._send(200, json.dumps({"ok": ok, "message": message}), "application/json",
                          {"Access-Control-Allow-Origin": "*"})


if __name__ == "__main__":
    print(f"noVNC proxy on :{PORT} -> {VNC_BACKEND[0]}:{VNC_BACKEND[1]}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
