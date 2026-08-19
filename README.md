# Mobile Diagnostics Kit

Mobile Diagnostics Kit is a small, privacy-oriented developer toolbox for
React Native and Expo applications. It keeps DoKit's native network inspector
and adds a polished on-device panel for allow-listed MMKV state and compatible
Expo OTA updates.

## What it provides

- DoKit 3.7.11 setup for Expo Android, including React Native OkHttp capture;
- DoKit 3.1.7 ownership and installation wrapper for iOS;
- a compact React Native diagnostics panel with accessible touch targets;
- MMKV field add, update, delete, and explicitly permitted entry reset;
- support for nested Zustand persist envelopes through `valuePath`;
- Expo update check, download, and optional reload through a host adapter;
- deny-by-default build and storage access controls.

The library does not run a server, accept arbitrary OTA URLs, or upload local
state. DoKit analytics are disabled on both native platforms.

## Install from GitHub

This repository is not published to npm or CocoaPods. Pin a release tag or
commit from GitHub:

```sh
npm install github:Lightspeed-Intelligence/mobile-diagnostics-kit#v0.1.0
```

## React Native panel

Mount the panel once near the application root. The host owns the build gate,
MMKV instance, allowed keys, copy, and Expo adapter.

```tsx
import * as Updates from 'expo-updates'
import {
  MobileDiagnostics,
  parseDiagnosticsFlag,
  type StorageEntryConfig,
} from 'mobile-diagnostics-kit'
import { storage } from './storage'

const entries = [
  {
    key: 'onboarding-storage',
    label: 'Onboarding flags',
    valuePath: ['state'],
    allowedFields: ['hasSeenWelcome', 'hasSeenFeatureTour'],
    allowReset: true,
  },
] satisfies readonly StorageEntryConfig[]

export function AppDiagnostics() {
  return (
    <MobileDiagnostics
      enabled={parseDiagnosticsFlag(
        process.env.EXPO_PUBLIC_MOBILE_DIAGNOSTICS
      )}
      entries={entries}
      storage={storage}
      updates={Updates}
    />
  )
}
```

`enabled` defaults to `false`; `entries` defaults to an empty array. The
component does not fall back to `__DEV__`, because an internal-flavoured bundle
can still be embedded in a release configuration.

`storage` is structural and works with an MMKV instance that implements the
small `MMKVStorageLike` interface. A non-Expo React Native app may omit
`updates`; the OTA tab will report that updates are unsupported.

### Storage policy

Each entry must use an exact key. Wildcards and automatic MMKV enumeration are
not supported. Prefer `allowedFields` even for an allowed key. Field names that
look like credentials, cookies, passwords, private keys, API keys, or crash
reporting credentials are recursively redacted and cannot be changed through
the inspector. Whole-entry deletion requires `allowReset: true`.

The host can replace any user-facing string through the `labels` prop without
forking the UI.

## Expo Android + DoKit

Include the config plugin only in the internal build configuration:

```js
const enableDiagnostics = process.env.MOBILE_DIAGNOSTICS === '1'

module.exports = {
  expo: {
    plugins: [
      ...(enableDiagnostics ? ['mobile-diagnostics-kit'] : []),
    ],
  },
}
```

The plugin adds DoKit, the OkHttp v4 adapter, a compatible Volley version,
React Native's shared OkHttp interceptor, and the required release keep rule.
Its initialization calls `disableUpload()` before DoKit starts.

Config plugins change native projects, so a new Android binary is required
when adding or removing DoKit. The React Native panel can then evolve through
the normal JS delivery path permitted by the host application.

## Native iOS + DoKit

Keep the pod out of App Store configurations. For a local npm dependency in a
brownfield shell, point CocoaPods at the package's `ios` directory:

```ruby
pod 'MobileDiagnosticsKit',
  :path => 'path/to/node_modules/mobile-diagnostics-kit/ios',
  :configurations => ['Debug', 'QA']
```

Install the entry after the active `UIWindowScene` is connected and visible:

```swift
#if DEBUG || INTERNAL_QA
import MobileDiagnosticsKit
#endif

// SceneDelegate.scene(_:willConnectTo:options:), after makeKeyAndVisible()
#if DEBUG || INTERNAL_QA
MobileDiagnostics.install()
#endif
```

The wrapper disables DoKit 3.1.7's internal telemetry collector before the
floating entry is installed. It does not modify files inside `Pods`.

## Expo OTA semantics

“Apply update” means check the installed runtime and channel, fetch a compatible
update, and reload if requested. It deliberately cannot switch channels,
bypass `runtimeVersion`, or use a caller-provided URL. If `expo-updates` is
disabled in the binary, the result is `unsupported`.

## Public API stability

The package exports the panel, storage inspector, OTA controller, build-flag
parser, labels, and their TypeScript contracts. Error results use stable codes;
provider error text, manifests, and native exceptions are not part of the
public API.

## Development

```sh
npm install --include=dev
npm run verify
```

MIT licensed. Contributions should keep examples generic and must not include
real credentials, endpoints, account data, or proprietary storage keys.
