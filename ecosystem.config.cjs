// PM2 process definition. Single program, single process (plan §3).
module.exports = {
  apps: [
    {
      name: 'app-achievers',
      script: '.output/server/index.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: '3000' },
      max_memory_restart: '512M',
    },
  ],
};
