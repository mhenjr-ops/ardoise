// app.json holds the settings. This adds Firebase's google-services.json (needed for push on
// Android) only once the file is in this folder, so builds keep working before it's set up.
const { existsSync } = require('fs');

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    ...(existsSync('./google-services.json') ? { googleServicesFile: './google-services.json' } : {}),
  },
});
