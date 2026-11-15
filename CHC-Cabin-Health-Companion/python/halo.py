"""CHC (Cabin Health Companion) helpers for Python.

Build data files in the format the app reads (see DATA.md), check them, save them,
or send readings live to the running server.  Standard library only.

    import halo
    ds = halo.Dataset(crew={"name": "Aleš Svoboda", "mission_start": "2026-08-01"})
    ds.add_series("heart_rate", start="2026-11-14T00:00:00Z", interval_s=60, values=[62, 63, 61])
    ds.add_reading("body_mass", 71.8, time="2026-11-10T07:30:00Z")
    print(ds.validate())          # [] means no problems
    ds.save("../data/biomonitor.json")

    halo.send({"readings": [{"metric": "heart_rate", "time": halo.now(), "value": 64}]})

The list of metric names, units and possible ranges is read from js/config.js,
so Python and the app always agree.
"""
import datetime as _dt
import json as _json
import os as _os
import re as _re
import urllib.request as _url

ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
CONFIG_JS = _os.path.join(ROOT, "js", "config.js")
DEFAULT_URL = "http://127.0.0.1:8000"
FORMAT = "chc/1"

_metrics = None


def metrics():
    """{key: {"kind", "unit", "valid": (lo, hi) or None, "aliases": [...], "every": ...}} from js/config.js."""
    global _metrics
    if _metrics is not None:
        return _metrics
    with open(CONFIG_JS, encoding="utf-8") as f:
        src = f.read()
    out = {}
    # each metric object starts with `key: "..."`; read its fields up to the next one
    starts = [m.start() for m in _re.finditer(r'\bkey:\s*"', src)]
    for i, s in enumerate(starts):
        block = src[s: starts[i + 1] if i + 1 < len(starts) else len(src)]
        key = _re.match(r'key:\s*"([^"]+)"', block).group(1)

        def field(name, pattern=r'"([^"]*)"'):
            m = _re.search(r'\b' + name + r':\s*' + pattern, block)
            return m.group(1) if m else None

        valid = _re.search(r'\bvalid:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]', block)
        aliases = _re.search(r'\baliases:\s*\[([^\]]*)\]', block)
        out[key] = {
            "kind": field("kind"),
            "unit": field("unit"),
            "every": field("every"),
            "label": field("label"),
            "valid": (float(valid.group(1)), float(valid.group(2))) if valid else None,
            "aliases": _re.findall(r'"([^"]+)"', aliases.group(1)) if aliases else [],
        }
    _metrics = out
    return out


def resolve(name):
    """Metric key for a name or alias, or None."""
    if name is None:
        return None
    n = str(name).strip()
    ms = metrics()
    if n in ms:
        return n
    for k, m in ms.items():
        if n.lower() in [a.lower() for a in m["aliases"]]:
            return k
    return None


def iso(t):
    """ISO 8601 UTC string from a datetime (naive = UTC), unix seconds, or an ISO string."""
    if t is None:
        return now()
    if isinstance(t, str):
        return t
    if isinstance(t, (int, float)):
        t = _dt.datetime.fromtimestamp(t / 1000 if t > 1e11 else t, tz=_dt.timezone.utc)
    if t.tzinfo is None:
        t = t.replace(tzinfo=_dt.timezone.utc)
    return t.astimezone(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now():
    return iso(_dt.datetime.now(_dt.timezone.utc))


def parse_time(t):
    """datetime (UTC) from what the app accepts, or None."""
    try:
        if isinstance(t, (int, float)):
            return _dt.datetime.fromtimestamp(t / 1000 if t > 1e11 else t, tz=_dt.timezone.utc)
        if isinstance(t, str):
            s = t.strip().replace("Z", "+00:00")
            d = _dt.datetime.fromisoformat(s)
            return d if d.tzinfo else d.replace(tzinfo=_dt.timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
    return None


class Dataset:
    """One data file. Add series (sensor data) and readings (checks), then save()."""

    def __init__(self, crew=None):
        self.data = {"format": FORMAT, "series": [], "readings": []}
        if crew:
            self.data["crew"] = dict(crew)

    def add_series(self, metric, values, start, interval_s, unit=None):
        """Evenly spaced samples. Use None in values for gaps."""
        s = {"metric": metric, "start": iso(start), "interval_s": interval_s, "values": list(values)}
        if unit:
            s["unit"] = unit
        self.data["series"].append(s)
        return self

    def add_samples(self, metric, samples, unit=None):
        """Irregular samples: [(time, value), ...]."""
        s = {"metric": metric, "samples": [[iso(t), v] for t, v in samples]}
        if unit:
            s["unit"] = unit
        self.data["series"].append(s)
        return self

    def add_reading(self, metric, value, time=None, unit=None):
        """One check or lab result."""
        r = {"metric": metric, "time": iso(time), "value": value}
        if unit:
            r["unit"] = unit
        self.data["readings"].append(r)
        return self

    def set_ecg(self, values_mv, start, hz=250, lead="II"):
        self.data["ecg"] = {"start": iso(start), "hz": hz, "lead": lead, "values": list(values_mv)}
        return self

    def validate(self):
        return validate(self.data)

    def save(self, path, indent=None):
        problems = self.validate()
        with open(path, "w", encoding="utf-8") as f:
            _json.dump(self.data, f, indent=indent)
        return problems

    def send(self, url=DEFAULT_URL):
        return send(self.data, url)


def validate(data, limit=20):
    """List of human-readable problems (empty list = fine). Mirrors what the app skips on import."""
    problems, ms = [], metrics()
    if isinstance(data, list):
        data = {"readings": data}
    if not isinstance(data, dict):
        return ["The top level must be a JSON object."]

    def check_value(key, v, where):
        if v is None:
            return
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            problems.append(f"{where}: value {v!r} is not a number")
            return
        lo_hi = ms[key]["valid"]
        if lo_hi and not (lo_hi[0] <= v <= lo_hi[1]):
            problems.append(f"{where}: {v} is outside the possible range {lo_hi[0]} to {lo_hi[1]}")

    for i, r in enumerate(data.get("readings") or []):
        where = f"readings[{i}]"
        key = resolve(r.get("metric", r.get("k")))
        if not key:
            problems.append(f"{where}: unknown metric {r.get('metric', r.get('k'))!r}")
            continue
        if parse_time(r.get("time", r.get("t"))) is None:
            problems.append(f"{where}: time {r.get('time', r.get('t'))!r} could not be read")
        if r.get("unit", r.get("u")) in (None, "", ms[key]["unit"]):
            check_value(key, r.get("value", r.get("v")), where)

    for i, s in enumerate(data.get("series") or []):
        where = f"series[{i}]"
        key = resolve(s.get("metric", s.get("k")))
        if not key:
            problems.append(f"{where}: unknown metric {s.get('metric', s.get('k'))!r}")
            continue
        if "samples" in s:
            for j, p in enumerate(s["samples"][:5000]):
                if parse_time(p[0]) is None:
                    problems.append(f"{where}.samples[{j}]: time could not be read")
                if s.get("unit", s.get("u")) in (None, "", ms[key]["unit"]):
                    check_value(key, p[1], f"{where}.samples[{j}]")
        else:
            if parse_time(s.get("start", s.get("t0"))) is None:
                problems.append(f"{where}: start time missing or unreadable")
            if not (s.get("interval_s", s.get("dt_s")) or 0) > 0:
                problems.append(f"{where}: interval_s must be a positive number")
            vals = s.get("values", s.get("v"))
            if not isinstance(vals, list):
                problems.append(f"{where}: values must be a list")
            elif s.get("unit", s.get("u")) in (None, "", ms[key]["unit"]):
                for j, v in enumerate(vals):
                    check_value(key, v, f"{where}.values[{j}]")
                    if len(problems) > limit:
                        break
        if len(problems) > limit:
            break
    if len(problems) > limit:
        problems = problems[:limit] + ["... more problems not shown"]
    return problems


def send(chunk, url=DEFAULT_URL, timeout=5):
    """POST readings/series to the running server (python server.py). Returns the server's reply."""
    body = _json.dumps(chunk).encode("utf-8")
    req = _url.Request(url.rstrip("/") + "/api/readings", data=body, headers={"Content-Type": "application/json"}, method="POST")
    with _url.urlopen(req, timeout=timeout) as resp:
        return _json.loads(resp.read().decode("utf-8"))


def load(path):
    with open(path, encoding="utf-8") as f:
        return _json.load(f)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Check data files:  python halo.py file1.json [file2.json ...]")
        print("Known metrics:", ", ".join(metrics()))
        sys.exit(0)
    bad = 0
    for p in sys.argv[1:]:
        try:
            probs = validate(load(p))
        except (OSError, ValueError) as e:
            probs = [str(e)]
        print(("OK    " if not probs else "ISSUES") + "  " + p)
        for x in probs:
            print("        " + x)
        bad += bool(probs)
    sys.exit(1 if bad else 0)
