import json, time, urllib.request, sys
UA = "SetlistrBenchmark/0.1 ( https://setlistr.ai )"
d = json.load(open("musicbrainz-probe.json"))
ids = []
for a in d["artists"]:
    if a["query"] in ("Phish", "Phoebe Bridgers", "Radiohead", "Lizzie No"): ids += [(a["query"], s["id"]) for s in a["sample"][:2]]
res = []
for who, i in ids:
    for att in range(5):
        time.sleep(1.5 + att * 3)
        try:
            req = urllib.request.Request(f"https://musicbrainz.org/ws/2/event/{i}?inc=place-rels+area-rels+artist-rels+url-rels&fmt=json", headers={"User-Agent": UA})
            e = json.load(urllib.request.urlopen(req, timeout=30)); break
        except Exception: pass
    else: continue
    rels = e.get("relations", [])
    res.append({"artist": who, "name": e["name"], "date": e["life-span"].get("begin"), "time": e.get("time"),
      "place": [r["place"]["name"] for r in rels if r.get("target-type") == "place"],
      "area": [r["area"]["name"] for r in rels if r.get("target-type") == "area"],
      "performers": [(r["artist"]["name"], r["type"]) for r in rels if r.get("target-type") == "artist"],
      "urls": [r["url"]["resource"].split("/")[2] for r in rels if r.get("target-type") == "url"],
      "setlist_head": (e.get("setlist") or "").splitlines()[:6]})
json.dump(res, open("musicbrainz-events-sample.json", "w"), indent=1)
for r in res: print(json.dumps(r)[:600])
