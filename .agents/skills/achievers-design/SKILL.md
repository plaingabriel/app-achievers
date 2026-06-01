---
name: achievers-design
description: Use this skill to generate well-branded interfaces and assets for Achievers App, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

---

## Using this skill in `app-achievers`

This bundle is installed as a repo skill at `.claude/skills/achievers-design/`.
Integration points already wired into the app:

- **Tokens** (`colors_and_type.css`) are mirrored to `src/styles/tokens.css` and
  loaded first via `src/styles/app.css`. Treat this skill's CSS as the source of
  truth; never hard-code colors. The app consumes them through **TailwindCSS v4**:
  `app.css` maps the tokens onto Tailwind's `@theme`, so you style with utilities
  (`bg-bg-1`, `text-fg-2`, `border-hair-2`, `bg-brand`, `font-mono`, …) that
  resolve to the tokens.
- **Components:** production UI is built from **shadcn/ui** primitives in
  `src/components/ui/` (Button, Input, Label, Badge so far), hand-tuned to this
  spec — sharp corners, JetBrains Mono, amber primary, 1px hairline borders. Add
  more primitives only as a screen needs them. See `docs/adr/0013-tailwindcss-shadcn.md`.
- **Rendered code reference:** `preview/*.html` (one concept per card) and
  `ui_kits/admin/*` (login, dashboard, table, sidebar, topbar). Mirror these
  patterns when building real routes/components — but write them in **Spanish**
  (`src/i18n/es.ts`), since the UI language is Spanish while the bundle's samples
  are English.
- **Assets:** the brand logo/mark are served by the app from `public/assets/`.
