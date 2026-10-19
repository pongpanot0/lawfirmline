// google-services.json stays out of this public repo: EAS builds get it from
// the GOOGLE_SERVICES_JSON file env var; a local build reads a copy beside this file.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
