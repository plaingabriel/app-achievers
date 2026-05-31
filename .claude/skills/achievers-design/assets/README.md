# Assets

- `logo.svg` — full wordmark (use for headers, login, emails)
- `mark.svg` — square mark (use for favicons, app icons, slide corners)
- `icons/` — see below

## Icons

This project uses **Lucide** icons via CDN. To embed:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<script>lucide.createIcons();</script>

<i data-lucide="search" class="icon"></i>
```

Stroke weight is set globally with the `--icon-stroke` (default 1.5px). Color inherits from `currentColor`. Default icon size is 16px.

If you'd like to swap to a custom set, replace this directory and update `colors_and_type.css` accordingly.
