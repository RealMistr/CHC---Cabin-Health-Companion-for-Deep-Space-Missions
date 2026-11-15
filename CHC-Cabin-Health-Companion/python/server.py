"""CHC (Cabin Health Companion) server.  Run:  python server.py    then open http://127.0.0.1:8000

- Serves the app.
- Gives the app every JSON file in data/ (except the examples listed in SKIP), so the
  data folder is the source of truth: drop a file in, reload the page.
- Accepts live readings from Python scripts (POST /api/readings, see simulate.py) and
  pushes them to the open page every few seconds. They are also saved to
  data/received.jsonl so they survive a restart.
- Files uploaded in the app's Data dialog are saved into data/ as well.

Standard library only (Python 3.8+).

Endpoints
  GET  /api/status              {"app": "chc", "files": n, "seq": n}
  GET  /api/data                {"files": [{"name", "data"}], "seq": n}
  GET  /api/live?since=N        {"seq": n, "chunks": [...]}   chunks posted after N
  POST /api/readings            body: {"readings": [...], "series": [...]}  ->  {"ok", "seq", "warnings"}
  POST /api/upload?name=x.json  body: a data file  ->  saved as data/x.json
"""
import argparse
import functools
import json
import os
import re
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import halo  # noqa: E402

APP_DIR = halo.ROOT
DATA_DIR = os.path.join(APP_DIR, "data")
RECEIVED = os.path.join(DATA_DIR, "received.jsonl")
SKIP = {"sample-mission.json", "template.json", "example-second-crew-member.json", "radiation-msl-cruise.json"}  # examples: load them with the Data button


def _skipped(name):
    """Example files (and the generated sample-crew-*.json) are not loaded as real data."""
    return name in SKIP or name.lower().startswith("sample-crew-")
MAX_BODY = 50 * 1024 * 1024

_lock = threading.Lock()
_live = []      # [(seq, chunk)]
_seq = 0


def data_files():
    """Every data file plus the received live chunks, as [{"name", "data"}]."""
    out = []
    if not os.path.isdir(DATA_DIR):
        return out
    for name in sorted(os.listdir(DATA_DIR)):
        if not name.lower().endswith(".json") or _skipped(name):
            continue
        try:
            with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
                out.append({"name": name, "data": json.load(f)})
        except (OSError, ValueError) as e:
            out.append({"name": name, "error": "Could not read: %s" % e})
    if os.path.exists(RECEIVED):
        merged = {"readings": [], "series": []}
        with open(RECEIVED, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    c = json.loads(line)
                except ValueError:
                    continue
                merged["readings"].extend(c.get("readings") or [])
                merged["series"].extend(c.get("series") or [])
                if c.get("crew"):
                    merged["crew"] = c["crew"]
        out.append({"name": "received.jsonl (live and logged)", "data": merged})
    return out


def normalise_chunk(obj):
    if isinstance(obj, list):
        obj = {"readings": obj}
    if not isinstance(obj, dict):
        raise ValueError("Send a JSON object with readings and/or series.")
    chunk = {k: obj[k] for k in ("readings", "series", "crew", "ecg") if k in obj}
    if not chunk:
        raise ValueError("Nothing to add: expected readings, series, crew or ecg.")
    return chunk


class Handler(SimpleHTTPRequestHandler):
    server_version = "HaloVitals/1"
    # explicit types: on Windows the registry can map .js to text/plain, which breaks the offline service worker
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map, **{
        ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
        ".json": "application/json", ".webmanifest": "application/manifest+json", ".html": "text/html"})

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/live"):
            return  # the page polls this every few seconds
        sys.stderr.write("  %s\n" % (fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("Body too large (limit 50 MB).")
        return json.loads(self.rfile.read(n).decode("utf-8") or "null")

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/api/status":
            return self._json({"app": "chc", "files": len(data_files()), "seq": _seq})
        if u.path == "/api/data":
            return self._json({"files": data_files(), "seq": _seq})
        if u.path == "/api/live":
            since = int((parse_qs(u.query).get("since") or ["0"])[0] or 0)
            with _lock:
                chunks = [c for s, c in _live if s > since]
                return self._json({"seq": _seq, "chunks": chunks})
        if u.path.startswith("/python/") or u.path.endswith((".py", ".jsonl")):
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        global _seq
        u = urlparse(self.path)
        try:
            if u.path == "/api/readings":
                chunk = normalise_chunk(self._body())
                warnings = halo.validate(chunk)
                os.makedirs(DATA_DIR, exist_ok=True)
                with _lock:
                    _seq += 1
                    _live.append((_seq, chunk))
                    del _live[:-2000]   # keep memory bounded; history is in the file
                    with open(RECEIVED, "a", encoding="utf-8") as f:
                        f.write(json.dumps(chunk) + "\n")
                    seq = _seq
                return self._json({"ok": True, "seq": seq, "warnings": warnings})
            if u.path == "/api/upload":
                name = (parse_qs(u.query).get("name") or ["upload.json"])[0]
                name = re.sub(r"[^A-Za-z0-9._-]+", "-", os.path.basename(name)).strip(".-") or "upload"
                if not name.lower().endswith(".json"):
                    name += ".json"
                if _skipped(name):
                    name = "uploaded-" + name
                data = self._body()
                os.makedirs(DATA_DIR, exist_ok=True)
                with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
                    json.dump(data, f)
                return self._json({"ok": True, "saved": "data/" + name, "warnings": halo.validate(data)})
            return self._json({"ok": False, "error": "Unknown endpoint"}, 404)
        except ValueError as e:
            return self._json({"ok": False, "error": str(e)}, 400)


def main():
    ap = argparse.ArgumentParser(description="Serve CHC (Cabin Health Companion) and accept live data from Python.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to open it from other devices on your network")
    a = ap.parse_args()
    handler = functools.partial(Handler, directory=APP_DIR)
    srv = ThreadingHTTPServer((a.host, a.port), handler)
    files = [f["name"] for f in data_files()]
    print("CHC running at http://%s:%d" % ("127.0.0.1" if a.host in ("0.0.0.0", "") else a.host, a.port))
    print("Data folder: %s" % DATA_DIR)
    print("Loaded files: %s" % (", ".join(files) if files else "none yet (the app shows sample data until data arrives)"))
    print("Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
