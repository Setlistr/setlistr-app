# Provenance sample: which external sources MusicBrainz events with setlists cite.
import json, time, urllib.request, urllib.parse, collections
UA = "SetlistrBenchmark/0.1 ( https://setlistr.ai )"
def get(url):
    for att in range(5):
        time.sleep(1.5 + att * 3)
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30))
        except Exception: pass
d = json.load(open("musicbrainz-probe.json")); mb = {a["query"]: a["mbid"] for a in d["artists"]}
picked = []
for who, n in (("Phish", 15), ("Radiohead", 7), ("Phoebe Bridgers", 5)):
    evs, off = [], 0
    while off < 700:
        b = get("https://musicbrainz.org/ws/2/event?" + urllib.parse.urlencode({"artist": mb[who], "limit": 100, "offset": off, "fmt": "json"}))
        evs += b["events"]; off += 100
        if off >= b["event-count"]: break
    ws = sorted([e for e in evs if (e.get("setlist") or "").strip()], key=lambda e: e["life-span"].get("begin") or "", reverse=True)[:n]
    picked += [(who, e["id"]) for e in ws]
rows = []
for who, i in picked:
    e = get(f"https://musicbrainz.org/ws/2/event/{i}?inc=place-rels+url-rels&fmt=json")
    if not e: continue
    sl = (e.get("setlist") or "").splitlines()
    songs = [l for l in sl if l.startswith("*")]
    linked = [l for l in songs if "[" in l and "|" in l]
    rows.append({"artist": who, "date": e["life-span"].get("begin"), "has_place": any(r.get("target-type") == "place" for r in e.get("relations", [])),
                 "sources": sorted({r["url"]["resource"].split("/")[2] for r in e.get("relations", []) if r.get("target-type") == "url"}),
                 "song_lines": len(songs), "song_lines_linked_to_mb": len(linked), "has_time": bool(e.get("time"))})
src = collections.Counter(s for r in rows for s in (r["sources"] or ["(none cited)"]))
json.dump({"n": len(rows), "sources": src, "rows": rows}, open("musicbrainz-provenance.json", "w"), indent=1)
print(len(rows), dict(src)); print(sum(r["song_lines_linked_to_mb"] for r in rows), "/", sum(r["song_lines"] for r in rows), "song lines linked to MB entities")
print("with place", sum(r["has_place"] for r in rows), "with time", sum(r["has_time"] for r in rows))
