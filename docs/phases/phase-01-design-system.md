# Phase 01 — Design system integration

## Goal
Wire the Achievers brand — dark mode, JetBrains Mono, amber accent, dotted grid,
assets — on **TailwindCSS v4 + shadcn/ui**, with the design tokens as the source of
truth. See `docs/adr/0013-tailwindcss-shadcn.md`.

## Batch (small, do in order)
1. Add `tailwindcss` + `@tailwindcss/vite` (as the **first** Vite plugin) plus the
   shadcn deps (`clsx`, `tailwind-merge`, `class-variance-authority`,
   `lucide-react`, `@radix-ui/react-slot`, `@radix-ui/react-label`).
2. Make `src/styles/app.css` the Tailwind entry: `@import "tailwindcss"`, import
   `tokens.css` into `layer(base)`, then a `@theme` block mapping the tokens to
   utilities (`bg-bg-1`, `text-fg-2`, `border-hair-2`, `bg-brand`, …) and aliasing
   shadcn's semantic vars (`--primary` → amber, `--radius` → 0). Keep the
   `app.css?url` `<link>` in `__root.tsx`; `<html>` on `.bg-grid` (from tokens).
3. Add `cn()` (`src/lib/utils.ts`), `components.json`, and shadcn primitives tuned
   to the spec — Button, Input, Label, Badge. Add more primitives only as later
   phases need them (Table/Card/Tabs with their owning phase).
4. Serve brand assets from `public/assets` (logo/mark/webp).
5. Render the Sidebar + Topbar shell and the login card with Tailwind utilities +
   the primitives, using Spanish labels.

## Files
`vite.config.ts`, `src/styles/app.css`, `src/styles/tokens.css` (source of truth —
do not edit), `components.json`, `src/lib/utils.ts`, `src/components/ui/*`,
`src/components/Sidebar.tsx`, `src/components/Topbar.tsx`,
`src/routes/{__root,index,login}.tsx`, `public/assets/*`

## How to validate
- Page renders pure-black background, mono font, amber accent on hover/selection;
  sharp corners and 1px hairline borders everywhere.
- Logo mark shows in the sidebar; no light-mode flash; no theme toggle exists.
- Visual matches `.claude/skills/achievers-design/preview/` and `ui_kits/admin/index.html`.
- `pnpm typecheck` and `pnpm build` pass; the built CSS contains the token-mapped
  utilities (`bg-bg-1`, `text-fg-2`, `border-hair-2`, `bg-brand`).
