import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// TanStack Start (pinned @tanstack/react-start@1.168.18, react-router 1.170.10).
// Plugin order matters: tailwindcss() runs first so it owns CSS transformation
// before the framework plugins; tanstackStart() must still come before viteReact().
// Vite does not read tsconfig `paths` natively, so the `@/*` -> `./src/*`
// alias is wired explicitly here.
export default defineConfig({
  server: { port: 3000 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Keep Better Auth out of the server bundle: Node resolves it from
  // node_modules at runtime. Bundling it makes Rollup follow Better Auth's
  // optional adapters (e.g. @better-auth/kysely-adapter) which we never use —
  // and the kysely one fails to build against our pinned kysely. We only use
  // the Drizzle adapter, so externalizing sidesteps the dead optional deps.
  ssr: {
    external: ['better-auth', '@better-auth/kysely-adapter', 'kysely'],
  },
  // nitroV2Plugin (preset 'node-server') wraps the Start build into a
  // self-listening Node server at .output/server/index.mjs — the entry pm2 and
  // `pnpm start` expect. Must come after tanstackStart(), before viteReact().
  // `plugins` registers a Nitro server plugin that runs at boot (starts the
  // error_log retention cron — see src/server/nitro-plugin.ts).
  //
  // `alias`: the Nitro plugin graph (cron → @/db, @/lib/audit, …) is bundled by
  // Nitro, NOT Vite, so Nitro must be told the `@ -> ./src` alias too — otherwise
  // `@/db` is left unresolved and the server throws ERR_MODULE_NOT_FOUND at boot.
  plugins: [
    tailwindcss(),
    tanstackStart(),
    nitroV2Plugin({
      preset: 'node-server',
      plugins: ['./src/server/nitro-plugin.ts'],
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    }),
    viteReact(),
  ],
});
