// Firebase config files stay out of this public repo: EAS builds get them from the
// GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_PLIST file env vars; a local build reads a copy beside this file.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
  },
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    ...config.plugins,
    '@react-native-firebase/app',
    [
      'expo-build-properties',
      { ios: { useFrameworks: 'static', forceStaticLinking: ['RNFBApp', 'RNFBAnalytics'] } },
    ],
  ],
});
