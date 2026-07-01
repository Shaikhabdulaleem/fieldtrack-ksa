/**
 * PM2 Ecosystem Config — FieldTrack KSA Backend
 *
 * Usage:
 *   npm run build          # compile TypeScript → dist/
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save               # persist across reboots
 *   pm2 startup            # install startup script
 *
 * Install PM2 globally if needed:  npm install -g pm2
 */
module.exports = {
  apps: [
    {
      name: "fieldtrack-api",
      script: "./dist/index.js",
      instances: "max",          // one worker per CPU core
      exec_mode: "cluster",       // share the port across workers
      watch: false,
      max_memory_restart: "500M",

      env: {
        NODE_ENV: "development",
        PORT: 4000,
      },

      env_production: {
        NODE_ENV: "production",
        PORT: 4000,
        // All other secrets (DATABASE_URL, JWT_SECRET, etc.) must be set
        // in the server's environment or a .env file — never hard-code them here.
      },

      // Graceful shutdown: wait up to 5s for in-flight requests to finish
      kill_timeout: 5000,
      listen_timeout: 10000,

      // Log rotation
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      merge_logs: true,
    },
  ],
};
