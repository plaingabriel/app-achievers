// PM2 process definition. Single program, single process (plan §3).
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'app-achievers',
      script: '.output/server/index.mjs',
      // Run from the app dir so relative paths resolve regardless of where pm2
      // is invoked.
      cwd: __dirname,
      // The nitro node-server build does NOT auto-load .env (unlike drizzle-kit).
      // Load it into the process so env.ts gets DATABASE_URL, BETTER_AUTH_SECRET,
      // BETTER_AUTH_URL, etc. Values already in the process env (NODE_ENV/PORT
      // below) take precedence over the file.
      node_args: `--env-file=${path.join(__dirname, '.env')}`,
      instances: 1,
      exec_mode: 'fork',
      // Port 3001: the existing "server" app owns 3000 on this droplet.
      env: { NODE_ENV: 'production', PORT: '3001' },
      max_memory_restart: '512M',
    },
  ],
};
