# Achievers Design System

A monospace-first, terminal-inspired design system for **App Achievers**, an internal admin dashboard. Inspired by the visual language of dev-tooling brands (PlanetScale, Linear, Vercel) — sharp corners, hairline borders, JetBrains Mono everywhere, black surfaces, single amber accent.

> Built fresh for this project. Not affiliated with PlanetScale; we just love the vibe.

---

## Index

| File | What's in it |
|---|---|
| `colors_and_type.css` | All design tokens: colors, type, spacing, radii, elevation, motion, the dotted-grid background |
| `SKILL.md` | Skill manifest — lets this folder run as a portable Agent Skill |
| `assets/` | Logo, favicons, and any static brand assets |
| `preview/` | Static HTML cards that populate the Design System tab (one concept per card) |
| `ui_kits/admin/` | Pixel-fidelity recreation of the admin app — login, dashboard, table view, plus reusable JSX components |
| `slides/` | Slide template (`index.html` + JSX layouts) for internal presentations in the same brand |

---

## Brand at a glance

- **Name:** App Achievers
- **Surface:** internal admin dashboard (tables, charts, lists, forms)
- **Tone:** technical, precise, quiet confidence — talks like an engineer to engineers
- **Type:** JetBrains Mono. Everywhere. No sans-serif fallback — committed to the bit.
- **Color:** dark-mode-only. Black `#000` page, layered cool-grays for depth, single **amber `#f59e0b`** accent
- **Form:** sharp 0px corners, 1px hairline borders, subtle dotted grid background, almost no shadow

---

## Content fundamentals

**Voice.** Engineer-to-engineer. Direct, unembellished, slightly dry. Assumes the reader is technical and impatient. Never marketing-speak.

**Person.** Second person ("You have 3 unread alerts"). Avoid "we" except in error states owned by the system ("We couldn't reach the server"). Never "let's".

**Casing.**
- **UI labels & buttons:** Sentence case ("Save changes", "Add member", not "Save Changes")
- **Decorative labels & section eyebrows:** UPPERCASE with `letter-spacing: 0.08em` — `[STATUS]`, `[01 / OVERVIEW]`
- **Body & paragraphs:** Sentence case
- **Code, IDs, paths:** as-is, mono

**Punctuation.** Terse. Periods on full sentences only. No exclamation marks. Em-dashes are fine. Numbers always digits ("3 alerts", not "three alerts").

**Numbers & units.** Show units inline (`12ms`, `4.2GB`, `99.97%`). Use thin separators in long numbers (`1,247,392`). Never round if the precise number fits.

**Status copy.** Verb-first, present tense. "Connected", "Syncing", "Failed", "Awaiting input". Avoid "successfully" — it's noise.

**Errors.** State what broke + what to do. Never apologize.
- ✅ `Connection refused. Check that the host is reachable.`
- ❌ `Oops! Something went wrong 😔 Please try again.`

**Empty states.** One line. Sometimes just a path or instruction.
- ✅ `No queries yet. Run one above.`
- ❌ `Welcome! Get started by running your first query and explore all the amazing things you can do.`

**Emoji.** No. Not in product, not in slides, not in errors. Use bracketed labels (`[NEW]`, `[BETA]`) or unicode arrows (→, ↑, ✓, ✕) when symbology helps.

**Examples to crib from**

| Surface | Example |
|---|---|
| Empty state | `No records. Add one to get started.` |
| Button | `Run query`, `Add member`, `Revoke key` |
| Section header | `[01 / OVERVIEW]`, `[02 / USAGE]` |
| Status pill | `[ACTIVE]`, `[FAILED]`, `[PENDING]` |
| Error | `Token expired. Sign in again.` |
| Toast | `Saved.` (one word is fine) |
| Confirm dialog | `Delete project "achievers-prod"? This cannot be undone.` |

---

## Visual foundations

### Colors

Dark mode only. There is no light theme — committing to one mode keeps the system tight.

- **Surfaces** layer cool-blacks: `--bg-0` (`#000`, page) → `--bg-1` (`#0a0a0a`, card) → `--bg-2` (`#111`, raised) → `--bg-3` (`#181818`, input) → `--bg-4` (`#222`, pressed). Each step is small — depth is a whisper, not a shout.
- **Foreground** runs from `--fg-1` (`#f5f5f5`, primary text) to `--fg-5` (`#262626`, decorative-only). Use `--fg-2` for labels, `--fg-3` for hints — almost never pure white.
- **Borders** are the primary depth cue. `--border-2` (`#2a2a2a`) is the standard. Always 1px, never wider.
- **Accent** is amber `#f59e0b` — used **sparingly**. Reserved for: the primary CTA, focus rings, links, the active-nav indicator, key data viz series. If three amber things are visible at once, you're using too much.
- **Semantic** colors (success/warning/danger/info) appear only on status pills and validation messaging — never as decoration.

### Typography

- **Family:** JetBrains Mono. Loaded from Google Fonts. Variable across 400/500/600/700 + italic 400.
- **Scale:** modest. `13px` is the workhorse body size — mono runs ~15% wider than sans, so this reads like a typical 15px sans.
- **Tracking:** slight negative (`-0.02em`) on display sizes. `+0.08em` uppercase tracking on labels — the only place we go uppercase.
- **Weights:** 400 body, 500 medium emphasis, 600 buttons/headings, 700 display. Skip 800/900 — JetBrains Mono is too dense at the heaviest weights.
- **Italics:** for *emphasis only*, never for whole paragraphs (mono italic is hard to read in long runs).

### Spacing

Strict 4px baseline. Aliases: `--space-1` (4) through `--space-24` (96). Most layout uses 4 / 8 / 16 / 24 / 48. **Comfortable density** — interior padding on cards is 16-24px, list rows are 12px tall.

### Backgrounds

- Default page is solid `--bg-0` black.
- **Signature texture:** subtle dotted grid (`--grid-bg`, 1px dots on a 24px grid). Use behind hero areas, login, empty states, and slide backgrounds. Apply via `.bg-grid`.
- **No gradients.** No imagery. No illustrations. The dotted grid is the only background pattern.

### Borders & dividers

- Always 1px. Always `--border-1` or `--border-2`. Never thicker.
- Dividers between rows in tables and lists, not boxed cards.
- Cards have a single 1px border, no shadow.

### Corners

**0px everywhere.** The only exceptions:
- Avatars: `--radius-full` (circle)
- Pills/tags: `--radius-pill` (only for true pills like status indicators)
- A couple of focus-ring rounded edges where 0px would clip (`--radius-1` = 2px, used sparingly)

### Elevation & shadow

- Cards have **no drop shadow** — they're delineated by a 1px border against the page.
- Popovers and modals use `--shadow-2` / `--shadow-3` — a soft black drop, used only because they need to lift off the document.
- The inset top highlight (`--shadow-inset-top`) adds a 1px alpha-white sheen on top of buttons & raised surfaces — a subtle "screen glow" cue.

### Buttons

- **Primary:** amber fill, black text, 1px border matching the fill, sentence case, no uppercase.
- **Secondary:** transparent fill, `--border-2` border, `--fg-1` text. Hover lifts the border to `--border-4`.
- **Ghost:** no border, `--fg-2` text. Hover sets `--bg-2` background.
- **Destructive:** `--danger` text on a transparent fill until hovered (then `--danger-bg` fill).
- All buttons: 32px tall (compact), 36px (default), 44px (large). Sharp corners.

### Hover, press, focus

- **Hover (button):** brighter accent (`--accent-hover`) for primary; border lifts to `--border-4` for secondary; `--bg-2` background fill for ghost. **Never** opacity changes — they look cheap on dark.
- **Hover (row/link):** background steps up one level (`--bg-1` → `--bg-2`). Underline appears on links.
- **Press:** background steps up another level (`--bg-3` → `--bg-4`). No transform/scale — terminals don't bounce.
- **Focus:** `--shadow-focus` — 1px black inset + 3px solid amber outset. Visible against any surface.

### Transparency & blur

- Used **only** for modal scrims (`rgba(0,0,0,0.7)`) and command-bar/popover backdrops (`backdrop-filter: blur(8px)` on `rgba(10,10,10,0.8)`).
- Never on cards. Never on text. Never decorative.

### Animation

- Fast (80–220ms), linear-ish curves (`cubic-bezier(0.2, 0, 0.2, 1)`). No bounces, no overshoots.
- Color and border-color transitions only — no transforms, no scales.
- Page transitions: instant. Modals: 140ms fade. Toasts: 220ms slide-in from top-right.

### Layout rules

- Max content width: 1280px (centered) for marketing-style pages; full-width for app shell.
- Sidebar: 240px fixed, `--bg-0` background, `--border-2` right border.
- Top bar: 48px tall, fixed, `--bg-0` background with hairline bottom border.
- Tables: full-width, no zebra striping (just hairline row dividers), 12px row padding.

### Imagery

- Almost none. The brand is text + grid + amber.
- When images are needed (avatars, OG cards): mono treatment — desaturated, cool, slightly grainy. Never bright colors competing with the amber.

---

## Iconography

See **`assets/icons/`** for the icon set.

- **System:** [Lucide](https://lucide.dev/) icons via CDN — clean 1.5px stroke, geometric, matches the hairline-border aesthetic. Substitution: PlanetScale uses a custom set; Lucide is the closest free, comprehensive match. **Flagged for review** if you want to swap.
- **Stroke weight:** 1.5px standard. Never filled icons.
- **Sizes:** 12, 14, 16, 20, 24, 32. Most UI uses 14 or 16. Match icon size to surrounding text.
- **Color:** inherits `currentColor`. Inline icons take their parent's color (usually `--fg-2`); icons in CTAs take `--fg-1` or `--accent-fg`.
- **No emoji.** Ever.
- **Unicode chars** allowed as inline glyphs: `→ ← ↑ ↓ ✓ ✕ • · ─ │`. Useful in inline status copy ("Saved · 2s ago").
- **Logo & wordmark** in `assets/`. Wordmark uses JetBrains Mono Bold with an amber underscore (`Achievers_`).

---

## Sources & substitutions

| Asset | Source | Notes |
|---|---|---|
| JetBrains Mono | Google Fonts (variable) | Free, OFL. Loaded via `@import` in `colors_and_type.css` |
| Lucide icons | https://lucide.dev (CDN) | Substitute for a custom set. Flagged. |
| Grid background | Hand-rolled CSS | Radial-gradient dots, 24px tile |
| Logo | Hand-built wordmark in `assets/logo.svg` | Placeholder — swap with your real mark |

**Not derived from PlanetScale's proprietary assets.** Color palette, type pairing, and components are original to this system; PlanetScale's UI was a vibe reference only.
