# Synthetic benchmark fixtures: a fictional artist ("Lena Hart"), her catalogue,
# bookings (with association traps) and 40 stage-setlist photos' ground truth.
# Every name is invented except the cover songs' real titles and writers.
# Output: fixtures/truth.json. Images are rendered by render.js from this file.
import json, random, os
random.seed(20261030)
OUT = os.path.join(os.path.dirname(__file__), "fixtures"); os.makedirs(OUT, exist_ok=True)

ORIG = ["Neon Lights", "Old Favourite", "Harbour", "June", "Home", "Home Again", "Paper Moon Motel", "Glasshouse",
        "Small Hours", "Northbound", "Ribbon", "Static Bloom", "Saint Agnes", "Low Tide", "The Long Way Round",
        "Wildfire Season", "Copper", "Undertow", "Late Bloomer", "Kite String", "Dreams", "Sparrow", "Blue Hour",
        "Parking Lot Prayer", "Lighthouse Keeper"]
catalogue = [{"id": f"o{i}", "title": t, "artist": "Lena Hart", "kind": "original", "writers": ["Lena Hart"], "released": True} for i, t in enumerate(ORIG)]
catalogue += [{"id": "u1", "title": "Marigold", "artist": "Lena Hart", "kind": "original", "writers": ["Lena Hart"], "released": False},
              {"id": "u2", "title": "Ferris Wheel", "artist": "Lena Hart", "kind": "original", "writers": ["Lena Hart", "Sam Ortiz"], "released": False}]
COVERS = [("c1", "Jolene", "Dolly Parton", ["Dolly Parton"]), ("c2", "Dreams", "Fleetwood Mac", ["Stevie Nicks"]),
          ("c3", "Hallelujah", "Leonard Cohen", ["Leonard Cohen"]), ("c4", "Landslide", "Fleetwood Mac", ["Stevie Nicks"]),
          ("c5", "Dancing in the Dark", "Bruce Springsteen", ["Bruce Springsteen"])]
catalogue += [{"id": i, "title": t, "artist": a, "kind": "cover", "writers": w, "released": True} for i, t, a, w in COVERS]
# Played but NOT in the catalogue: brand-new unreleased songs and a one-off cover.
NEW = [{"title": "Velvet Static", "kind": "new_original"}, {"title": "Gasoline Halo", "kind": "new_original"},
       {"title": "Harvest Moon", "kind": "new_cover", "writers": ["Neil Young"]}]
by_title = {}
for c in catalogue: by_title.setdefault(c["title"], []).append(c)

# How each song may be written on a stage setlist (abbreviations are a hard case).
ABBR = {"Neon Lights": ["Neon"], "Old Favourite": ["Old Fav"], "Paper Moon Motel": ["PMM", "Paper Moon"],
        "The Long Way Round": ["Long Way"], "Parking Lot Prayer": ["Parking Lot"], "Lighthouse Keeper": ["Lighthouse"],
        "Wildfire Season": ["Wildfire"], "Dancing in the Dark": ["Dancing in the Dark"], "Saint Agnes": ["St Agnes", "St. Agnes"]}

VENUES = [("Mohawk", "Austin", "America/Chicago"), ("Thalia Hall", "Chicago", "America/Chicago"), ("Empty Bottle", "Chicago", "America/Chicago"),
          ("First Avenue", "Minneapolis", "America/Chicago"), ("The Bluebird", "Denver", "America/Denver"), ("Neumos", "Seattle", "America/Los_Angeles"),
          ("Doug Fir", "Portland", "America/Los_Angeles"), ("The Independent", "San Francisco", "America/Los_Angeles"), ("Lodge Room", "Los Angeles", "America/Los_Angeles"),
          ("Rough Trade", "New York", "America/New_York"), ("The Sinclair", "Cambridge", "America/New_York"), ("Black Cat", "Washington", "America/New_York"),
          ("Mercy Lounge", "Nashville", "America/Chicago"), ("Terminal West", "Atlanta", "America/New_York"), ("Lee's Palace", "Toronto", "America/Toronto"),
          ("Bootleg", "Los Angeles", "America/Los_Angeles"), ("Pabst Theater", "Milwaukee", "America/Chicago"), ("Turf Club", "St. Paul", "America/Chicago")]

# 40 shows, one fixture each, between Feb and Oct 2026; plus trap bookings.
from datetime import date, timedelta
bookings, d = [], date(2026, 2, 6)
for i in range(40):
    v = VENUES[i % len(VENUES)]
    d = d + timedelta(days=random.choice([1, 2, 3, 5, 9]))
    bookings.append({"id": f"b{i:02d}", "venue": v[0], "city": v[1], "tz": v[2], "local_date": d.isoformat(), "time": random.choice(["20:00", "20:30", "21:00", "21:30"]), "status": "scheduled", "fixture": f"f{i:02d}"})
# Traps: same city next night; same-day festival afternoon set; cancelled; a date-only booking.
traps = []
for i, kind in ((3, "same_city_next_day"), (11, "same_day_other_set"), (19, "same_city_next_day"), (27, "cancelled_next_day"), (33, "same_day_other_set"), (36, "date_only_same_day")):
    b = bookings[i]; bd = date.fromisoformat(b["local_date"])
    if kind == "same_city_next_day": t = {"venue": "Hideout", "city": b["city"], "tz": b["tz"], "local_date": (bd + timedelta(days=1)).isoformat(), "time": "21:00", "status": "scheduled"}
    elif kind == "same_day_other_set": t = {"venue": f"{b['city']} Riverfront Fest", "city": b["city"], "tz": b["tz"], "local_date": b["local_date"], "time": "15:30", "status": "scheduled"}
    elif kind == "cancelled_next_day": t = {"venue": "The Echo", "city": "Los Angeles", "tz": "America/Los_Angeles", "local_date": (bd + timedelta(days=1)).isoformat(), "time": "20:00", "status": "cancelled"}
    else: t = {"venue": "Record store in-store", "city": b["city"], "tz": b["tz"], "local_date": b["local_date"], "time": None, "status": "scheduled"}
    t.update({"id": f"t{i:02d}", "trap": kind, "fixture": None}); traps.append(t)
# Make sure every next-day trap date doesn't collide with the next real booking date (it may; that's realistic).
all_bookings = bookings + traps

STYLES = ["typed", "typed", "marker", "marker", "hand_bradley", "hand_noteworthy", "hand_chalk", "hand_snell"]
CONDS = ["clean", "clean", "angle", "angle", "glare", "lowlight", "crop_bottom", "tape_shadow"]
originals = [c for c in catalogue if c["kind"] == "original" and c["released"]]

fixtures = []
for i, b in enumerate(bookings):
    fid = b["fixture"]
    n = random.randint(9, 15)
    songs = random.sample(originals, n - 2) + random.sample([c for c in catalogue if c["kind"] == "cover" or not c["released"]], 2)
    random.shuffle(songs)
    lines = []
    if random.random() < 0.55:
        mm, dd = b["local_date"][5:7], b["local_date"][8:10]
        lines.append({"text": random.choice([f"{b['venue'].upper()} {int(mm)}/{int(dd)}", f"{b['city'].upper()} - {b['venue']}", f"{b['venue']} · {int(mm)}.{int(dd)}"]), "kind": "header"})
    performed = []
    enc_at = n - random.choice([1, 2]) if random.random() < 0.6 else None
    for j, s in enumerate(songs):
        if enc_at is not None and j == enc_at: lines.append({"text": random.choice(["ENCORE", "— enc —", "E:"]), "kind": "section"})
        written = s["title"]
        if s["title"] in ABBR and random.random() < 0.5: written = random.choice(ABBR[s["title"]])
        if s["title"] == "Dreams":
            written = "Dreams (FM)" if s["kind"] == "cover" else "Dreams"
        note = random.choice(["", "", "", "", " (capo 2)", " - Bb", " *", " (solo)"])
        lines.append({"text": written + note, "title_text": written, "kind": "song", "mark": "none", "song_id": s["id"]})
        performed.append({"song_id": s["id"]})
    # Hard cases, assigned deterministically so each appears several times.
    hc = []
    if i % 3 == 0:  # crossed-out song: on paper, not played
        k = random.randrange(1, len([l for l in lines if l["kind"] == "song"]) - 1)
        song_lines = [l for l in lines if l["kind"] == "song"]; song_lines[k]["mark"] = "crossed"
        performed = [p for p in performed if p["song_id"] != song_lines[k]["song_id"]]; hc.append("crossed_out")
    if i % 4 == 1:  # handwritten addition: played, written in another pen
        new = random.choice(NEW + [None]) if i % 8 == 1 else None
        if new: add = {"text": new["title"], "title_text": new["title"], "kind": "song", "mark": "added", "new": new}
        else:
            s = random.choice([c for c in originals if c["id"] not in [p["song_id"] for p in performed]])
            add = {"text": s["title"], "title_text": s["title"], "kind": "song", "mark": "added", "song_id": s["id"]}
        pos = random.randrange(2, len(lines))
        lines.insert(pos, add)
        song_order = [l for l in lines if l["kind"] == "song" and l["mark"] != "crossed"]
        performed = [({"song_id": l["song_id"]} if "song_id" in l else {"new": l["new"]}) for l in song_order]; hc.append("addition" + ("_new_song" if new else ""))
    if i % 5 == 2:  # medley on one line
        a, c2 = random.sample([c for c in originals if c["id"] not in [p.get("song_id") for p in performed]], 2)
        txt = random.choice([f"{a['title']} > {c2['title']}", f"Medley: {a['title']} / {c2['title']}"])
        pos = random.randrange(1, len(lines))
        lines.insert(pos, {"text": txt, "title_text": txt, "kind": "song", "mark": "none", "medley": [a["id"], c2["id"]]})
        song_order = [l for l in lines if l["kind"] == "song" and l["mark"] != "crossed"]
        performed = []
        for l in song_order:
            if "medley" in l: performed += [{"song_id": x, "medley": True} for x in l["medley"]]
            elif "song_id" in l: performed.append({"song_id": l["song_id"]})
            else: performed.append({"new": l["new"]})
        hc.append("medley")
    if i % 7 == 3:  # brand-new unreleased song typed into the list (not in catalogue)
        new = NEW[i % 2]
        pos = random.randrange(1, len(lines))
        lines.insert(pos, {"text": new["title"], "title_text": new["title"], "kind": "song", "mark": "none", "new": new})
        song_order = [l for l in lines if l["kind"] == "song" and l["mark"] != "crossed"]
        performed = []
        for l in song_order:
            if "medley" in l: performed += [{"song_id": x, "medley": True} for x in l["medley"]]
            elif "song_id" in l: performed.append({"song_id": l["song_id"]})
            else: performed.append({"new": l["new"]})
        hc.append("unreleased_not_in_catalogue")
    # Off-paper truth the photo cannot show: an unmarked skip, or an unlisted extra song.
    off = None
    if i % 6 == 5:
        cand = [p for p in performed if "song_id" in p and not p.get("medley")]
        skip = cand[len(cand) // 2]; performed = [p for p in performed if p is not skip]; off = {"skipped_unmarked": skip["song_id"]}
    elif i % 6 == 4:
        extra = random.choice([c for c in originals if c["id"] not in [p.get("song_id") for p in performed]])
        performed.append({"song_id": extra["id"]}); off = {"played_unlisted": extra["id"]}
    if any(l.get("song_id") in ("c2", "o20") for l in lines): hc.append("ambiguous_title_dreams")
    if any(l.get("song_id") in ("o4", "o5") for l in lines): hc.append("ambiguous_title_home")
    if any(l.get("song_id", "").startswith("c") for l in lines): hc.append("cover")
    if any(l.get("song_id", "").startswith("u") for l in lines): hc.append("unreleased_in_catalogue")
    if any(l["kind"] == "song" and l["title_text"] in sum(ABBR.values(), []) and l["title_text"] not in by_title for l in lines): hc.append("abbreviation")
    style, cond = STYLES[i % len(STYLES)], CONDS[(i * 3) % len(CONDS)]
    # Photo time: at load-out, after midnight, next morning, or none (a screenshot/edited file).
    pt = ["loadout", "after_midnight", "next_morning", "none"][i % 4]
    fixtures.append({"id": fid, "booking": b["id"], "style": style, "condition": cond, "lines": lines, "performed": performed,
                     "off_paper": off, "hard_cases": sorted(set(hc)), "photo_time": pt})

# Unreadable photos (failure/abandon cases) replace the condition on 3 fixtures.
for k in (7, 22, 38): fixtures[k]["condition"] = random.choice(["unreadable_blur", "unreadable_dark"]); fixtures[k]["expect_unreadable"] = True
# Held-out split: 15 dev, 25 held-out, stratified by style.
ids = [f["id"] for f in fixtures]; dev = set(ids[0::8] + ids[1::8] + ids[4::8])
for f in fixtures: f["split"] = "dev" if f["id"] in dev else "heldout"
json.dump({"artist": "Lena Hart (synthetic)", "catalogue": catalogue, "new_songs": NEW, "bookings": all_bookings, "fixtures": fixtures},
          open(os.path.join(OUT, "truth.json"), "w"), indent=1)
from collections import Counter
print(Counter(f["split"] for f in fixtures), Counter(h for f in fixtures for h in f["hard_cases"]))
print(Counter(f["style"] for f in fixtures), Counter(f["condition"] for f in fixtures))
