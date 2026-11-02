# MusicBrainz event probe: what a permitted, free, keyless public source returns.
# Public API, CC0 core data, 1 req/s, identifying User-Agent. Read-only; no scraping.
import json, time, urllib.request, urllib.parse, sys, collections
UA = "SetlistrBenchmark/0.1 ( https://setlistr.ai )"
last = [0.0]
def get(path, **q):
    q['fmt'] = 'json'
    url = "https://musicbrainz.org/ws/2/" + path + "?" + urllib.parse.urlencode(q)
    for attempt in range(4):
        wait = 1.15 - (time.time() - last[0])
        if wait > 0: time.sleep(wait)
        last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except Exception as e:
            time.sleep(2 + attempt * 2)
    raise SystemExit("failed: " + url)
ARTISTS = ["Phish", "Radiohead", "Phoebe Bridgers", "Wednesday", "Ratboys", "Hand Habits", "Lizzie No"]
out = {"retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "requests": 0, "artists": []}
for name in ARTISTS:
    s = get("artist", query='artist:"%s"' % name, limit=5); out["requests"] += 1
    cands = [(a["id"], a["name"], a.get("score"), a.get("disambiguation", ""), a.get("country", "")) for a in s["artists"]]
    exact = [c for c in cands if c[1].lower() == name.lower()]
    mbid = exact[0][0]
    events, off = [], 0
    while True:
        b = get("event", artist=mbid, limit=100, offset=off); out["requests"] += 1
        events += b["events"]; off += 100
        if off >= b["event-count"] or off >= 600: total = b["event-count"]; break
    years = collections.Counter((e.get("life-span", {}).get("begin") or "????")[:4] for e in events)
    recent = [e for e in events if (e.get("life-span", {}).get("begin") or "")[:4] in ("2023", "2024", "2025")]
    with_setlist = [e for e in events if (e.get("setlist") or "").strip()]
    out["artists"].append({
        "query": name, "same_name_candidates": len(exact), "candidates": [{"name": c[1], "disambiguation": c[3], "country": c[4], "score": c[2]} for c in cands],
        "mbid": mbid, "events_total": total, "events_fetched": len(events),
        "events_2023_2025": len(recent), "with_setlist_text": len(with_setlist),
        "recent_with_setlist": len([e for e in recent if (e.get("setlist") or "").strip()]),
        "with_time": len([e for e in events if e.get("time")]), "cancelled": len([e for e in events if e.get("cancelled")]),
        "types": dict(collections.Counter(e.get("type") for e in events)),
        "sample": [{"name": e.get("name"), "date": e.get("life-span", {}).get("begin"), "time": e.get("time"), "type": e.get("type"),
                    "setlist_lines": len((e.get("setlist") or "").splitlines()), "id": e["id"]} for e in (with_setlist or events)[:3]],
    })
    print(name, total, len(recent), len(with_setlist), file=sys.stderr)
json.dump(out, open("musicbrainz-probe.json", "w"), indent=1)
