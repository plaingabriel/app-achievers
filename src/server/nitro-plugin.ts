import { startCron } from './cron';

// Nitro server plugin: runs once when the Node server process boots (registered
// via nitroV2Plugin({ plugins: [...] }) in vite.config.ts). This is where the
// in-process cron is started so it lives with the app (plan §4.6, phase 09) —
// not during build/prerender, only at runtime. A plain default function is a
// valid Nitro plugin (called with the nitro app); no defineNitroPlugin needed.
export default () => {
  startCron();
  console.info('[nitro] cron started (error_log retention)');
};
