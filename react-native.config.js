module.exports = {
  dependency: {
    // Native code is opt-in: the Expo config plugin generates Android bridge
    // sources for diagnostics builds, while iOS hosts add the pod only to
    // their internal build configurations.
    platforms: {
      android: null,
      ios: null,
    },
  },
}
