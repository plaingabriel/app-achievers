// PM2 process definition. Deployed to the DigitalOcean droplet.
// Start: pm2 start ecosystem.config.cjs
// Reload (zero-downtime): pm2 reload achievers-app
module.exports = {
  apps: [
    {
      name: 'achievers-app',
      script: '.output/server/index.mjs',
      cwd: '/srv/achievers-app',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      // Env secrets are loaded from /etc/achievers-app/.env by the app itself,
      // not injected here. See docs/runbooks/deploy.md.
    },
  ],
}
