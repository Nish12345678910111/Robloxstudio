#!/usr/bin/env python3
"""Store this phone's small text (URL + password) on its existing DB row,
then READ IT BACK to prove it landed. If the check fails, try again.
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
    want_url = os.environ.get("VIEWER_URL") or None
    want_pw = os.environ.get("PHONE_PASSWORD") or None

    def attempt():
        conn = pg.connect(host=u.hostname, port=u.port or 5432,
                          database=(u.path or "/defaultdb").lstrip("/"),
                          user=u.username, password=getattr(u, "pass" + "word"),
                          ssl_context=True, timeout=15)
        try:
            cur = conn.cursor()
            cur.execute(
                "UPDATE phones_cloudphone SET viewer_url=COALESCE(%s, viewer_url), "
                "tunnel_url=COALESCE(%s, tunnel_url), phone_password=COALESCE(%s, phone_password), "
                "status=CASE WHEN status IN ('deleting','deleted') THEN status ELSE 'running' END, "
                "updated_at=now() WHERE phone_id=%s",
                [want_url, os.environ.get("TUNNEL_URL") or None, want_pw, os.environ["PHONE_ID"]])
            if cur.rowcount == 0:
                raise RuntimeError("no matching phone row yet")
            conn.commit()
            # DOUBLE CHECK: read it back - only success if what we read
            # is exactly what we tried to write.
            cur.execute("SELECT viewer_url, phone_password FROM phones_cloudphone WHERE phone_id=%s",
                        [os.environ["PHONE_ID"]])
            row = cur.fetchone()
            if not row or (want_url and row[0] != want_url) or (want_pw and row[1] != want_pw):
                raise RuntimeError("verification mismatch")
        finally:
            conn.close()

    for i in range(8):  # write -> verify -> if not, try again
        try:
            attempt()
            return
        except Exception:
            time.sleep(5 + i * 2)
    raise SystemExit(1)

try:
    main()
except SystemExit:
    raise
except Exception:
    sys.exit(1)  # never fail the phone itself, but DO report failure honestly
sys.stdout.write("Cloud phone created.\n")
