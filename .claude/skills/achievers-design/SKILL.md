---
name: achievers-design
description: Use this skill whenever building or styling any UI for the App Achievers — pages, components, forms, tables, dashboards, login/auth screens, empty states, error states, modals. It defines the brand's tokens (colors, type, spacing, motion), voice and copy rules, and provides reference components. Read it before writing any JSX/CSS so the output matches the design system instead of generic AI styling.
---

# Achievers design system

A monospace-first, terminal-inspired system for the App Achievers admin dashboard. Dark mode only, JetBrains Mono everywhere, sharp corners, 1px hairline borders, a single amber accent, a subtle dotted-grid background. The vibe is dev-tooling (PlanetScale / Linear / Vercel): technical, precise, quiet.

## Use it like this

1. **Tokens are the law.** Every color, size, space, radius, and duration is a CSS variable in `colors_and_type.css` (already copied into the app at `src/styles/tokens.css` and loaded in `__root.tsx`). Never hardcode a hex, px font-size, or font-family — use the variables. If you need a value that doesn't exist, that's a signal to reconsider, not to invent one.
2. **Read `brand-guide.md`** for the full visual + voice spec (surfaces, foreground ramp, borders, buttons, hover/press/focus, layout rules, iconography).
3. **Crib from `ui_kits/admin/`** — working reference components (`Login.jsx`, `Sidebar.jsx`, `Topbar.jsx`, `Table.jsx`, `Dashboard.jsx`, `Icon.jsx`) plus `kit.css` and a full `index.html` assembly. These are the canonical patterns; adapt them into the app's TanStack Start + React 19 components.
4. **Browse `preview/`** for one-concept-per-card HTML showing colors, type scale, spacing, and each component variant rendered.
5. **Assets** (`assets/logo.svg`, `assets/mark.svg`) for the wordmark and mark.

## Non-negotiables

- **JetBrains Mono only.** No sans-serif anywhere. `--font-sans` is aliased to the mono stack on purpose.
- **Dark mode only.** No light theme, no toggle.
- **0px corners** except avatars (circle), true pills, and the occasional 2px focus edge.
- **1px borders** as the primary depth cue. No drop shadows on cards (only modals/popovers lift).
- **Amber sparingly.** Primary CTA, focus ring, links, active-nav, key chart series. If three amber things are visible at once, it's too much.
- **No opacity-based hovers** — step the background/border up a level instead.

## Voice & copy (applies to every string you write)

- Sentence case for UI labels and buttons ("Save changes", not "Save Changes").
- `[UPPERCASE]` bracketed labels for section eyebrows and status pills (`[STATUS]`, `[ACTIVE]`, `[FAILED]`).
- Second person ("You have 3 unread alerts"). Never "let's".
- Numbers as digits, units inline (`12ms`, `99.97%`).
- Errors state what broke + what to do. Never "successfully", never apologize, never emoji.
  - Good: `Connection refused. Check that the host is reachable.`
  - Bad: `Oops! Something went wrong. Please try again.`
- Empty states are one line: `No records. Add one to get started.`
- Symbols allowed inline: → ← ↑ ↓ ✓ ✕ • · — never emoji.
- Icons: Lucide, 1.5px stroke, never filled, sized to match adjacent text.

## Files

| File | What |
|---|---|
| `colors_and_type.css` | All tokens (canonical; mirrored at `src/styles/tokens.css`) |
| `brand-guide.md` | Full visual + content spec |
| `ui_kits/admin/` | Reference components + `kit.css` + `index.html` |
| `preview/` | Per-concept rendered cards |
| `assets/` | Logo + mark |

The original full design-system package (including a slide template) was provided as a zip during planning; this skill carries the parts relevant to building the app's UI.
