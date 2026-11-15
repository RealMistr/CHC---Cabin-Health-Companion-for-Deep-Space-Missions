"""Example Bio-Monitor simulation based on averages.

Live mode (the server must be running in another window):
    python simulate.py                 one sample per channel every 5 seconds
    python simulate.py --every 2

History file (no server needed), e.g. 30 days of 1-minute samples:
    python simulate.py --days 30 --out ../data/biomonitor-sim.json

Edit AVERAGES and SCHEDULE below, or replace sample_at() with your own model.
"""
import argparse
import datetime as dt
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import halo  # noqa: E402

# resting average, extra per MET above rest, and random spread (± one standard deviation)
AVERAGES = {
    "heart_rate":  {"rest": 61,   "per_met": 15,  "sd": 2.5, "sleep": -5,  "decimals": 0},
    "spo2":        {"rest": 97.2, "per_met": 0,   "sd": 0.8, "sleep": 0,   "decimals": 0, "max": 100},
    "bp_sys":      {"rest": 114,  "per_met": 6,   "sd": 3,   "sleep": -6,  "decimals": 0},
    "bp_dia":      {"rest": 74,   "per_met": 1.4, "sd": 2,   "sleep": -4,  "decimals": 0},
    "resp_rate":   {"rest": 13.5, "per_met": 3,   "sd": 1,   "sleep": -1,  "decimals": 0},
    "ventilation": {"rest": 6.6,  "per_met": 2.7, "sd": 0.4, "sleep": -0.6, "decimals": 1},
    "skin_temp":   {"rest": 33.6, "per_met": 0.15, "sd": 0.1, "sleep": 0.6, "decimals": 2},
}

# station day in UTC hours: (start, end, METs)
SCHEDULE = [
    (21.5, 24, 0.9), (0, 6, 0.9),   # sleep
    (6, 7, 1.4),                     # post-sleep
    (8.5, 9.5, 4.4),                 # resistive exercise
    (15, 15.75, 7.0),                # treadmill
]
WORK_METS = 1.7


def activity_at(t):
    h = t.hour + t.minute / 60
    for a, b, mets in SCHEDULE:
        if a <= h < b:
            return mets
    return WORK_METS


def sample_at(t):
    """One value per channel at datetime t (UTC)."""
    act = max(0.8, activity_at(t) + random.gauss(0, 0.2))
    sleeping = act < 1
    diurnal = math.sin((t.hour + t.minute / 60 - 9) / 24 * 2 * math.pi)
    out = {"activity": round(act, 1)}
    for key, a in AVERAGES.items():
        v = a["rest"] + (act - 1) * a["per_met"] + (a["sleep"] if sleeping else 0) + random.gauss(0, a["sd"])
        if key in ("heart_rate", "bp_sys"):
            v += 2.5 * diurnal
        if "max" in a:
            v = min(a["max"], v)
        out[key] = round(v, a["decimals"]) if a["decimals"] else int(round(v))
    return out


def live(url, every):
    print("Sending live Bio-Monitor samples to %s every %ss. Ctrl+C to stop." % (url, every))
    while True:
        t = dt.datetime.now(dt.timezone.utc)
        s = sample_at(t)
        chunk = {"readings": [{"metric": k, "time": halo.iso(t), "value": v} for k, v in s.items()]}
        try:
            reply = halo.send(chunk, url)
            note = "" if not reply.get("warnings") else "  warnings: %s" % reply["warnings"]
            print("%s  HR %s  SpO2 %s  BP %s/%s%s" % (t.strftime("%H:%M:%S"), s["heart_rate"], s["spo2"], s["bp_sys"], s["bp_dia"], note))
        except OSError as e:
            print("Could not reach the server (%s). Is `python server.py` running?" % e)
        time.sleep(every)


def history(days, out, interval_s):
    end = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
    start = end - dt.timedelta(days=days)
    n = int((end - start).total_seconds() // interval_s) + 1
    cols = {k: [] for k in list(AVERAGES) + ["activity"]}
    for i in range(n):
        s = sample_at(start + dt.timedelta(seconds=i * interval_s))
        for k in cols:
            cols[k].append(s[k])
    ds = halo.Dataset()
    for k, vals in cols.items():
        ds.add_series(k, vals, start=start, interval_s=interval_s)
    problems = ds.save(out)
    print("Wrote %s: %d samples per channel, %s to %s UTC" % (out, n, start.strftime("%d %b %H:%M"), end.strftime("%d %b %H:%M")))
    for p in problems:
        print("  " + p)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=halo.DEFAULT_URL)
    ap.add_argument("--every", type=float, default=5, help="seconds between live samples")
    ap.add_argument("--days", type=float, help="write a history file instead of sending live")
    ap.add_argument("--out", default=os.path.join(halo.ROOT, "data", "biomonitor-sim.json"))
    ap.add_argument("--interval", type=int, default=60, help="seconds between samples in the history file")
    a = ap.parse_args()
    try:
        if a.days:
            history(a.days, a.out, a.interval)
        else:
            live(a.url, a.every)
    except KeyboardInterrupt:
        print("\nStopped.")
