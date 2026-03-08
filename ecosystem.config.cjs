module.exports = {
  apps: [
    {
      name: 'gromko',
      script: 'index.js',
      cwd: '.',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: 'server/.env',
        SPOTIFLAC_DIR: './SpotiFLAC-main',
      },
    },
  ],
};
