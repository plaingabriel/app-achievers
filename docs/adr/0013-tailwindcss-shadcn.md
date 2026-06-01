# ADR 0013 — TailwindCSS v4 + shadcn/ui for styling

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
Phase 01 wired the Achievers design system as hand-written CSS: design tokens in
`src/styles/tokens.css` (a byte-for-byte mirror of the achievers-design skill's
`colors_and_type.css`) plus a bespoke `src/styles/kit.css` of component classes
(`.btn`, `.input`, `.pill`, `.sidebar`, `.topbar`, `.tbl`, …). As the app grows —
CRUD tables, dialogs, and forms land in later phases — hand-maintaining `kit.css`
and its ad-hoc class vocabulary scales poorly, and we want the velocity and
built-in accessibility of a component-primitive library.

## Decision
Adopt **TailwindCSS v4** (CSS-first, via `@tailwindcss/vite`) and **shadcn/ui** as
the styling layer, while keeping the design system **unchanged**:

- `tokens.css` stays the immutable source of truth (still mirrored from the skill).
- `src/styles/app.css` is the Tailwind entry. It maps the tokens onto Tailwind's
  `@theme` so utilities resolve to `var(--…)` (`bg-bg-1`, `text-fg-2`,
  `border-hair-2`, `bg-brand`, …) and aliases shadcn's semantic variables
  (`--primary` → amber, `--background` → `--bg-0`, `--border` → `--border-2`,
  `--radius` → 0) to the same tokens.
- shadcn primitives are **hand-tuned** to the spec (sharp corners, JetBrains Mono,
  amber primary on black, 1px hairline borders) and added **only as the live UI
  needs them** — Button, Input, Label, Badge today; Table/Card/Tabs arrive with
  the phase that first renders them.
- `kit.css` is removed; the existing routes/components render identically with
  Tailwind utilities + the primitives.

We chose Tailwind **v4** (not v3) because the design system is already a
CSS-custom-property token set, which maps 1:1 onto v4's `@theme` with no JS-config
duplication.

## Consequences
- **Easier:** new screens compose utilities + accessible, Radix-backed primitives;
  a token change in `tokens.css` propagates to every utility automatically (the
  `@theme inline` mapping references the tokens, it does not copy them).
- **Constraints stay enforced centrally:** dark-mode-only, sharp corners (radius
  scale pinned to 0), monospace (`font-sans`/`font-mono` both alias JetBrains
  Mono), and the single amber accent.
- **Footgun, documented in `app.css`:** shadcn reserves `--accent` for a subtle
  hover surface, which collides with the Achievers amber `--accent`. Resolution:
  the brand amber is exposed as the `brand` utility namespace (`bg-brand`,
  `text-brand`) and reaches shadcn components through `--primary`; shadcn
  `--accent` maps to `--bg-2`.
- **One ordering subtlety:** `tokens.css` is imported into Tailwind's `base` layer
  (`@import "./tokens.css" layer(base)`) so utilities can override its
  bare-element rules (`a`, `h1`–`h4`, `p`) — e.g. an `<a>` styled as a nav item or
  button stays fg-colored instead of inheriting the amber link color.
- **Tooling:** adds `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, `lucide-react`, and two Radix packages.
- This **supersedes the plain-CSS implementation** described in Phase 01 (which is
  updated to match). Tokens, previews, and the admin UI kit in the achievers-design
  skill remain the visual source of truth; only the implementation changed.
