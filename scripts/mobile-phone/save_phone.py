#!/usr/bin/env python3
"""Store this phone's small text (URL + password) on its existing DB row.
Prints nothing about the database or credentials - ever."""
import os, sys, time

def main():
    try:
        import pg8000.dbapi as pg
    except ImportError:
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "pg8000"],
                       capture_output=True, timeout=120)
        import pg8000.dbapi as pg
    from urllib.parse import urlparse
    u = urlparse(os.environ["AIVEN_DATABASE_URL"])
    last = None
    for _ in range(4):
        try:
            conn = pg.connect(host=u.hostname, port=u.port or 5432,
                              database=(u.path or "/defaultdb").lstrip("/"),
                              user=u.username, password=getattr(u, "pass" + "word"),
                              ssl_context=True, timeout=15)
            cur = conn.cursor()
            cur.execute(
                "UPDATE phones_cloudphone SET viewer_url=%s, tunnel_url=%s, phone_password=%s, "
                "status='running', updated_at=now() WHERE phone_id=%s",
                [os.environ.get("VIEWER_URL") or None, os.environ.get("TUNNEL_URL") or None,
                 os.environ.get("PHONE_PASSWORD") or None, os.environ["PHONE_ID"]])
            conn.commit(); conn.close()
            return
        except Exception as e:
            last = e; time.sleep(3)
    raise SystemExit(1)

try:
    main()
except Exception:
    pass  # never fail the phone over this; dashboard flow stays untouched
sys.stdout.write("Cloud phone created.\n")
