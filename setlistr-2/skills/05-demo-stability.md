[05-demo-stability.md](https://github.com/user-attachments/files/26331834/05-demo-stability.md)
# Setlistr — Demo Stability Rules

## Trigger
Apply this skill at the start of EVERY Setlistr development session. Check proposed changes against these rules before proceeding.

---

## Current Situation
Setlistr has an imminent live demo and investor meeting. Demo stability is the top priority above all else.

## What IS In Scope
Only these three areas are approved for active development:

1. **Manual correction UX on the live capture page**
   - Tap a confirmed song to edit it mid-show
   - This is the core interaction being built out

2. **End-of-show output polish**
   - The summary, export, and review flow after a performance ends
   - Quality and reliability of this output matters for the demo

3. **Activating `detection_events` table logging**
   - Wire up the logging to the existing table
   - No schema changes needed — just activate the writes

## What is NOT In Scope
Do not proceed with any of the following without explicit approval:

- ❌ New features of any kind
- ❌ Detection threshold changes
- ❌ New dependencies or packages
- ❌ Database schema changes
- ❌ Refactoring existing working code
- ❌ UI redesigns outside the three approved areas
- ❌ New API integrations

## If a Proposed Change Seems Risky
Stop and flag it. Ask: "Does this change affect anything that could break the demo?" If yes, do not proceed. Stability over improvement.

## After the Demo
The following are queued for post-demo consideration:
- Claude Code setup for incoming developer
- Vendor-agnostic recognition architecture (BullMQ, Python orchestrator, adapter pattern)
- A/B testing and shadow mode evaluation for detection engines
- Expanded artist profile features
