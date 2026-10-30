# Proposed correction: unsupported public website claims

*Proposal, 2026-10-30; production `21d2b63`.* This proposal is separate from the full website audit, which hasn't been done and mustn't delay the Before-tonight experiment. Nothing has changed on the site. Each replacement needs owner approval and then its own small release.

**Shipped behaviour the copy must match [repo]:**
- **Live capture** recognises songs automatically. The team then confirms them in Review ("Save & Complete").
- **Confirmation isn't independent verification.** No "verified" status exists.
- **Setlistr doesn't file with any PRO.** Prepare builds a per-PRO claim sheet; the artist (or someone they authorise) files in the PRO's own portal. "Mark as submitted" is the user's own statement. Setlistr never sees whether a PRO received, accepted or paid anything.
- **Every supported PRO is treated equally:** SOCAN, ASCAP, BMI, PRS, APRA, SESAC and GMR.

| # | Where | Current text | Proposed replacement |
|---|---|---|---|
| 1 | `app/how-it-works/page.tsx`, page description (meta) | "How Setlistr automatically captures your live setlist, verifies every song, and submits royalty claims to SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR." | "How Setlistr captures your live setlist, lets you confirm every song, and prepares the claim you file with SOCAN, ASCAP, BMI, PRS, APRA, SESAC or GMR." |
| 2 | how-it-works, Open Graph description | "From planned setlist to verified performance to royalty submission — the full pipeline." | "From tonight's show to a confirmed setlist and a claim you're ready to file." |
| 3 | how-it-works, capture step | "…confirms each song as it's played and verifies it against your set…" | "…recognises each song as it's played, ready for you to confirm after the show. No phone-waving, no reconstructing the set from memory." |
| 4 | how-it-works, show-complete step (copy and alt text) | "…already a verified, timestamped record — every song, source-confirmed, ready to move into submission." Alt: "…a verified eight-song setlist captured live" | "When you walk off stage, every recognised song is timestamped and waiting for your review. Confirm it, and the show is on your record." Alt: "Setlistr show-complete screen with an eight-song setlist captured live" |
| 5 | how-it-works, claim step (title and alt text) | "Verified shows move to claim." Alt: "…verified shows marked ready to claim" | "Confirmed shows move to Prepare." Alt: "Setlistr Submissions screen listing confirmed shows to prepare" |
| 6 | how-it-works, Career and share steps (alt text and copy) | "verified shows" (3 places) | "confirmed shows" |
| 7 | how-it-works FAQ, "How do I submit a setlist…" | "…then routes verified show data through the submission pipeline to your registered performing rights organization… without manual paperwork." | "Setlistr captures your setlist during the show, and you confirm it afterwards. Prepare then turns it into a claim sheet in your PRO's format (SOCAN, ASCAP, BMI, PRS, APRA, SESAC or GMR), which you file in your PRO's own portal." |
| 8 | how-it-works FAQ, "How does Setlistr verify a live performance?" | "…then confirms each detection before it becomes part of the permanent performance record." | **Question:** "How does Setlistr record a live performance?" **Answer:** "Setlistr listens during the show and recognises songs as they're played. Afterwards you review the list, fix anything it missed or got wrong, and confirm it. Only confirmed shows count on your record." (The current answer also describes matching against "the artist's planned setlist and a cover catalog in real time". That isn't checked here and is left out until it is.) |
| 9 | how-it-works FAQ, "Why…" (line 71) | "…creating a verified record of every performance so no show goes unaccounted for." | "…keeping a confirmed record of every show you capture, so none is forgotten when it's time to file." |
| 10 | how-it-works hero | "…between walking on stage and a royalty claim landing at your PRO." | "…between walking on stage and filing your claim with your PRO." |
| 11 | `app/page.tsx`, hero badge | "Verified Performance Intelligence" | "The Live Performance Record" |
| 12 | `app/page.tsx`, SEO paragraph | "…automatically capturing setlist data and routing it through the submission pipeline so no performance goes unaccounted for." | "…capturing setlists during the show, keeping a confirmed record of every performance, and preparing the claim you file with your PRO." |
| 13 | Landing pages' calls to action (`get-paid`, `get-paid-for-live-shows`, `submit-setlists-pro`, `unclaimed-music-royalties`, `what-is-live-performance-royalty`) | "captures your setlist automatically" / "builds your setlist automatically… ready to submit to any PRO" / "Never miss a setlist again" | Keep "automatically" for capture, which is true of live capture. Add the confirmation step: "…captures your setlist during the show, ready for you to confirm." Replace "ready to submit to any PRO" with "ready to prepare for your PRO". Replace "Never miss a setlist again" with "Keep every setlist". |

**Not in this correction:**
- the page-by-page audit;
- screenshots that display the word "verified" (to check during the audit);
- claims about earnings or royalty amounts.
