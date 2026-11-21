/** @type {import('expo/fingerprint').Config} */
module.exports = {
  // Firebase files come from EAS file env vars on the build server and are absent locally,
  // so hashing them makes the local and EAS fingerprints differ (expo-updates build fails).
  ignorePaths: ['google-services.json', 'GoogleService-Info.plist', '**/eas-environment-secrets/**'],
};
