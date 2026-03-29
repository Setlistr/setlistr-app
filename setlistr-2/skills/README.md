[README.md](https://github.com/user-attachments/files/26331805/README.md)
# Setlistr Skills

Reusable context documents for AI-assisted development. These files serve two purposes:

1. **Today** — paste relevant files at the start of a Claude chat session to give instant full context
2. **When a developer joins** — these become Claude Code SKILL.md files that auto-apply to the right tasks

## Files

| File | Purpose | When to use |
|---|---|---|
| `01-architecture.md` | Stack, DB, file structure, coding rules | Every session |
| `02-design-system.md` | Colors, fonts, inline styles, UI patterns | Any UI/component work |
| `03-detection-pipeline.md` | ACRCloud, OpenAI fallback, confidence states | Detection/identify route work |
| `04-pro-music-industry.md` | PRO exports, ISRC, royalties, industry context | Export, reporting, royalty features |
| `05-demo-stability.md` | Current guardrails — what's in/out of scope | Every session until after the demo |

## Usage (current — chat interface)
Start a session by telling Claude: *"Read these skills before we begin"* and paste the contents of the relevant files.

## Usage (future — Claude Code)
Rename files to `SKILL.md`, place each in its own subfolder under `/skills`, and Claude Code will auto-apply them based on the task being performed.
