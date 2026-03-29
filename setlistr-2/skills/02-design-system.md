[02-design-system.md](https://github.com/user-attachments/files/26331821/02-design-system.md)
# Setlistr Design System

## Trigger
Apply this skill when writing any UI component, page, or style for Setlistr.

---

## Core Philosophy
- Mobile-first, always. The product is used on stage in dark environments.
- No Tailwind. All styles are inline (`style={{}}`).
- No external UI component libraries.
- Every screen should feel like a premium artist tool — not a generic SaaS dashboard.

## Color Palette
| Role | Value |
|---|---|
| Background (primary) | `#0a0908` |
| Gold accent | `#c9a84c` |
| Gold hover | `#b8973b` |
| Surface / card | `#111110` |
| Border | `#2a2926` |
| Text primary | `#f5f0e8` |
| Text secondary | `#8a8580` |
| Danger / destructive | `#c0392b` |
| Success | `#27ae60` |

## Typography
| Role | Font |
|---|---|
| UI text, body | DM Sans |
| Monospace / data | DM Mono |

Load via Google Fonts. Always specify fallbacks: `'DM Sans', sans-serif` and `'DM Mono', monospace`.

## Spacing & Sizing
- Base unit: 8px
- Touch targets minimum: 44px height (on-stage use, dark environments)
- Generous padding on interactive elements — musicians use these with sweaty hands

## Component Patterns

### Buttons
- Primary: gold background (`#c9a84c`), near-black text, bold
- Secondary: transparent background, gold border, gold text
- Destructive: dark red background
- All buttons: `borderRadius: 8px`, no box shadows on dark backgrounds

### Cards / Surfaces
- Background: `#111110`
- Border: `1px solid #2a2926`
- Border radius: `12px`
- Padding: `16px` minimum

### Inputs
- Background: `#1a1916`
- Border: `1px solid #2a2926`
- Focus border: `#c9a84c`
- Text: `#f5f0e8`
- Placeholder: `#8a8580`

### Animations
- Pulse button: radial gradient, ping rings on active listen state
- Catch flash: brief highlight on new song detection
- Keep animations subtle — the UI should feel alive but not distracting during a performance

## What to Avoid
- White or light backgrounds
- Blue primary colors (generic SaaS feel)
- Heavy drop shadows
- Cluttered layouts — musicians need to read this at a glance on stage
- Tailwind class names
