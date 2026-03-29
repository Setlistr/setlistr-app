[SETLISTR-SKILLS-ROADMAP.md](https://github.com/user-attachments/files/26331838/SETLISTR-SKILLS-ROADMAP.md)
# Setlistr Skills — Long-Term Roadmap & Setup Instructions

## What This Document Is
A plain-English guide for Jesse (and any future developer) on:
1. Where to put the skill files
2. How to add them to the repo right now
3. What skills to add over the next 6 months as Setlistr grows

---

## PART 1 — HOW TO ADD SKILLS TO THE REPO RIGHT NOW

### What you need
- Access to your Setlistr GitHub repo
- The 5 skill files from this session downloaded to your computer
- 10 minutes

---

### Step-by-step instructions

**Step 1: Go to your GitHub repo**
Open your browser and go to github.com. Sign in and open the Setlistr repository.

**Step 2: Navigate into the setlistr-2 folder**
Click on the `setlistr-2` folder — this is where all your app code lives.

**Step 3: Create the skills folder**
- Click the "Add file" button (top right of the file list)
- Click "Create new file"
- In the filename box at the top, type: `skills/README.md`
- GitHub will automatically create the `skills/` folder when you include the slash
- Paste the contents of the README.md file from this session into the text area
- Scroll down and click "Commit changes"
- Add a commit message like: "Add Setlistr skills folder"
- Click "Commit changes" again

**Step 4: Add each skill file**
Repeat the same process for each of the 5 skill files:
- Click "Add file" → "Create new file"
- Type the filename: `skills/01-architecture.md` (then 02, 03, 04, 05)
- Paste the contents of each file
- Commit with a message like "Add architecture skill"

**That's it.** Your repo will now have a `/skills` folder with 6 files inside it.

---

### What to tell Claude at the start of each session
Until a developer sets up Claude Code, begin each chat session with:

> "We're working on Setlistr. The skills are in the /skills folder of the repo.
> Here's the architecture skill: [paste 01-architecture.md]
> Here's the demo stability skill: [paste 05-demo-stability.md]"

You don't need to paste all 5 every time — just the ones relevant to what you're building that day.

---

## PART 2 — LONG-TERM SKILLS ROADMAP

### The next 6 months — what to build and when

---

### Phase 1: Right Now (Pre-Demo)
**Skills you have:**
- Architecture (01)
- Design System (02)
- Detection Pipeline (03)
- PRO & Music Industry (04)
- Demo Stability Rules (05)

**Goal:** Stability. Nothing new. Nail the demo.

---

### Phase 2: After the Demo (Month 1–2)
**Add these skills as you build:**

**06 — Onboarding Flow**
When you build out artist onboarding (Spotify bootstrap, profile setup), document
the exact steps and logic so it never gets broken by future changes.

**07 — Dashboard & Submission Status**
The dashboard is your user's home base. Document the states (no shows, shows in
progress, shows ready to submit, shows submitted) so any developer knows exactly
what to build and test.

**08 — Testing & QA Checklist**
A simple skill that lists what to manually test before any deployment:
- New show creation
- Live capture (humming detection)
- End-of-show flow
- CSV export for each PRO
- Auth (login, logout, signup)

This is the most valuable skill you don't have yet. It prevents regressions.

---

### Phase 3: Developer Joins (Month 2–3)
**Convert all skills to Claude Code format:**
When a real developer joins, they rename each .md file to SKILL.md and put each
in its own subfolder. Example:

```
skills/
  architecture/
    SKILL.md
  design-system/
    SKILL.md
  detection-pipeline/
    SKILL.md
```

Claude Code will then auto-apply the right skill based on what's being worked on.
No manual pasting required.

**New skills the developer should create:**

**09 — API Routes Map**
Documents every API route, what it does, what it expects, what it returns.
Prevents the "what does this endpoint do?" confusion as the codebase grows.

**10 — Supabase RLS Policies**
Row Level Security rules are invisible and easy to break. Documenting the
expected policies for each table prevents the silent auth bugs you've already
experienced.

**11 — Deployment Checklist**
Step-by-step for deploying to Vercel safely: env variable checks, migration
checks, smoke tests after deploy.

---

### Phase 4: Growth & Partnerships (Month 3–6)
**Skills that reflect business maturity:**

**12 — PRO Partner API Specs**
When you pursue direct API integrations with SOCAN, ASCAP, or BMI, document
the spec and auth flow here. This becomes the source of truth for that work.

**13 — Recognition Engine Adapter**
When you add a second detection engine (beyond ACRCloud), document the adapter
pattern here. Which engines exist, how to add a new one, how shadow mode testing
works.

**14 — Artist-Facing Language Guide**
The words you use matter. Document approved language for confidence states,
match results, and royalty estimates. Prevents inconsistency across the app as
more people contribute.

---

## PART 3 — THE BIG PICTURE

### Why this matters
Right now you're the only person who holds all of Setlistr's context in your head.
That's a risk. These skill files move that knowledge into the repo — where it's
permanent, searchable, and handoff-ready.

When you bring a developer in, they can read the /skills folder and be productive
on day one. When you raise a round and a VC's technical advisor looks at the repo,
they see a team that thinks in systems. When something breaks at 11pm, the skills
folder is the first place anyone looks.

### The rule going forward
Every time you make a significant decision about how Setlistr works — a detection
threshold, a DB schema change, a new UI pattern — update the relevant skill file.
Treat it like a living document, not a one-time setup.

That habit is worth more than any individual feature.
