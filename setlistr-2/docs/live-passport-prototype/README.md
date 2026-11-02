# Live Passport experience prototype (sample artist)

*2026-11-02. Artifact: https://claude.ai/artifact/EwVAyKjY2LMuhXtPUVHo2d (version 2, private).*

**Fictional sample data only.**
- "Lena Hart" and every night, venue and setlist are generated in the page.
- Nothing was discovered, retrieved or recorded.
- It tests whether the experience appeals. It doesn't show that data can be acquired automatically, or that artists would adopt it.
- The real retrieval findings for Jesse Slack are in `../passport-demo/README.md`, unchanged.

**What it shows:**
- Proof's identity block and big figure, with Bebas Neue used selectively.
- A strip with one mark per night.
- Proof-style city rows.
- **One interaction:** open a city to follow its nights. Its marks light up on the strip, and the city shows one insight scoped to the record. Each night shows its evidence when opened.
- **One primary action**, which changes with the moment.

**States:** a touring artist (37 nights) and a new artist (2 nights plus an upcoming show in a new city), each in Light and Dark.

**Screenshots:** in `shots/`, made by `walk2.js`.

## Version 3: one value loop (`passport-loop.html`)

The loop: return to a city, make a creative decision, record what happened, see the history change. It uses the same fictional artist.

1. **Today:** the Montréal show leads, with what has changed since the last visit and the last set there. The wider Passport sits below.
2. **Plan** (*proposed*): starts from the last set there; you swap one song in and compare the two sets. A plan is never part of the record.
3. **After the show** (*simulated*): uses today's setlist-photo reading. Two questions (a crossed-out song and a handwritten addition), then confirm.
4. **Payoff:** the planned list turns into the night as played, with one supported change and the city's history updated. Then the next show's briefing.

The new-artist state has one previous set and a show in a new city.

**Screenshots:** in `loop-shots/`, made by `walk3.js`.
