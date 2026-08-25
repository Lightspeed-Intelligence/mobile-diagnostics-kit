# Mobile Diagnostics Kit

Mobile Diagnostics Kit adds an on-device DoKit panel to React Native and Expo
apps. It provides native Network, Local State, and Expo Update pages without
requiring a diagnostics component in the app's React tree.

## Install

Pin a reviewed commit:

```sh
npm install github:Lightspeed-Intelligence/mobile-diagnostics-kit#<commit>
```

No host source patching is required. The dependency is the opt-in: React Native
autolinking merges the Android library manifest and links the iOS pod. Removing
the dependency removes DoKit from the next native binary.

This makes the package suitable for an isolated internal-build pipeline:

- the diagnostics pipeline adds one exact dependency and mechanically updates
  the package lock;
- ordinary pipelines do not add the dependency and therefore cannot link or
  start DoKit;
- adding or removing the dependency changes the native fingerprint and requires
  one full build;
- later builds with the same dependency still use the host's existing
  fingerprint/OTA decision logic.

## Native ownership

Android publishes a standard React Native AAR. A private manifest provider
installs DoKit and its single application-window launcher after process startup.
The launcher remains above React Native dialog windows, including login screens,
without requesting system-overlay permission or adding a second floating state.

iOS publishes `MobileDiagnosticsKit.podspec`. The pod waits for a connected
window scene, installs DoKit, and presents its own full-screen native diagnostics
controller. No `Podfile`, `SceneDelegate`, or host navigation changes are needed.

Both platforms disable DoKit telemetry before installation. Unsupported built-in
platform tools are removed, and custom titles follow DoKit's English/Chinese
locale behavior.

## Tools

- **Network** reads DoKit's in-memory captures and does not upload them.
- **Local State** enumerates the default MMKV instance. Automatically discovered
  values are read-only; credential-like keys and nested fields are redacted.
- **Expo Update** shows update ID, publish time, channel, runtime version,
  embedded/OTA source, and a branch when the update manifest provides one. It
  can check, fetch, and relaunch only through the installed Expo Updates
  controller; it cannot change update URLs or bypass runtime compatibility.

## Compatibility API

The existing React Native component, storage inspector, OTA controller, and
Expo config plugin remain exported for older hosts. New dependency-only hosts do
not need to import or mount them.

## Development

```sh
npm install --include=dev
npm run verify
```

MIT licensed. Never include real credentials, endpoints, account data, or
proprietary storage values in examples or tests.
