const path = require('path');

module.exports = {
  apps: [
    {
      name: 'badminton-server',
      script: 'index.js',
      cwd: path.join(__dirname, 'server'),
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'dev',
        JWT_SECRET: 'your_jwt_secret_key_here',
      },
    },
    {
      name: 'badminton-frontend',
      script: path.join(__dirname, 'frontend/node_modules/vite/bin/vite.js'),
      args: '--host 0.0.0.0 --port 3000',
      cwd: path.join(__dirname, 'frontend'),
      max_memory_restart: '1G',
    },
  ],
};
