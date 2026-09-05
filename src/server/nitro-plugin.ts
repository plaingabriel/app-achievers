import { startCron } from './cron';

// Nitro server plugin: runs once when the Node server process boots (registered
// via nitroV2Plugin({ plugins: [...] }) in vite.config.ts). This is where the
// in-process cron is started so it lives with the app (plan §4.6, phase 09) —
// not during build/prerender, only at runtime. A plain default function is a
// valid Nitro plugin (called with the nitro app); no defineNitroPlugin needed.
export default () => {
  // Defensive: a failure to start the cron must never crash the server at boot
  // (the app must still come up and serve requests / pass the health check).
  try {
    startCron();
    console.info('[nitro] cron started (acs-ventas ingest, error_log retention)');
  } catch (err) {
    console.error('[nitro] cron failed to start (continuing without it)', err);
  }
};
