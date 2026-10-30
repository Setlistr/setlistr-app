# Finding: the setlist-photo title matcher silently substitutes wrong songs

*Recorded 2026-10-30 from the local Before-tonight benchmark. No production data was read. **No fix is authorised.***

**Where:** `app/api/parse-setlist/route.ts` at `21d2b63`: `fuzzyMatch` and `similarity`, then the substitution:

```ts
return { ...song, title: match.title, artist: match.artist || song.artist }
```

**Behaviour:**
- Each extracted line is compared with the user's catalogue: word overlap, plus a 0.85 floor whenever one normalised string contains the other.
- The best score above 0.65 **replaces the title and artist without telling the user**.
- Ties keep the first catalogue row (strict `>`).
- One line yields at most one song.

## Reproducible examples

Script `docs/before-tonight-benchmark/matcher-repro.js`. It has no network calls and copies the matcher logic verbatim. The catalogue contains the artist's own "Dreams" and a cover of Fleetwood Mac's "Dreams".

| Written on the setlist | Production result | Correct | Failure |
|---|---|---|---|
| `Dreams (FM)` | Dreams · Lena Hart | Dreams · Fleetwood Mac (writer Stevie Nicks) | **Ambiguous title:** a silent wrong work; the songwriter would be wrong on the claim sheet |
| `Dreams - Fleetwood Mac` | Dreams · Lena Hart | Dreams · Fleetwood Mac | The same: the artist hint is ignored |
| `Harbour > June` | Harbour | Harbour, then June | **Medley:** the second song is dropped |
| `Medley: Wildfire Season / Neon Lights` | Wildfire Season with this catalogue; **Neon Lights** with the full benchmark catalogue | Both songs | **Medley:** one song dropped, and *which* one depends on catalogue row order |
| `Home Agn` (constructed abbreviation) | Home | Home Again (probably) | **Ambiguous title:** a substring match wins without a question |

**Counts across all 40 synthetic fixtures** (ground-truth titles fed straight to the matcher, so transcription errors are excluded):

| Failure | Occurrences |
|---|---|
| Cover "Dreams (FM)" assigned to the artist's own "Dreams" | 9 of 9 |
| Medley lines whose second song was dropped | 8 of 8 |
| Medley lines whose kept song was the second title rather than the first | 6 of 8 |
| An acronym ("PMM") left unmatched | 2 |

The unmatched acronym is kept as written, so it's not a wrong song.

**Why it matters:**
- **Silent and wrong, not merely missing:** a confirmer sees a plausible title and has no prompt to check it.
- **For a cover, the composition and its writers are wrong**, and that carries through to Prepare and the claim sheet.
- **Medley songs vanish** from the performed record.

**Limits of this finding:**
- The catalogue and fixtures are synthetic.
- Real-world frequency is unknown: how often artists have same-titled songs or write medleys on one line.
- The Review screen may let users correct these, but nothing flags them.

**Possible directions (not authorised, not built):**
- keep the score and show low or tied matches as a question instead of substituting;
- split medley separators (`>`, `/`, "Medley:") into separate songs;
- use an artist hint in parentheses.

A candidate matcher in the benchmark does these things, but it is **development evidence only** (see the benchmark report).
