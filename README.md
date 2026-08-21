# Mobile Diagnostics Kit

Mobile Diagnostics Kit is a small, privacy-oriented DoKit extension for React
Native and Expo applications. DoKit remains the tool panel: this package
registers `Local State` and `Expo Update` as custom tools inside DoKit, opens a
polished React Native screen for the selected tool, and replaces the legacy iOS
network list with an on-device inspector.

## What it provides

- DoKit 3.7.11 setup for Expo Android, including React Native OkHttp capture
  and two custom kits under `Application Tools`;
- DoKit 3.1.7 ownership for iOS, including two custom plugins and a modern
  Network inspector registered in DoKit's own home panel;
- a compact React Native diagnostics panel with accessible touch targets;
- read-only discovery of every MMKV key, plus field editing for explicitly
  configured entries and explicitly permitted entry reset;
- support for nested Zustand persist envelopes through `valuePath`;
- Expo update check, download, and optional reload through a host adapter;
- deny-by-default build and storage mutation controls.

The library does not run a server, accept arbitrary OTA URLs, or upload local
state. DoKit analytics are disabled on both native platforms.

## Install from GitHub

This repository is not published to npm or CocoaPods. Pin a release tag or
commit from GitHub:

```sh
npm install github:Lightspeed-Intelligence/mobile-diagnostics-kit#<reviewed-commit>
```

## Where the DoKit dependency lives

DoKit is a native dependency, not a JavaScript runtime package, so it is
intentionally absent from `package.json.dependencies`:

- iOS declares `DoraemonKit/Core ~> 3.1.7` in
  `ios/MobileDiagnosticsKit.podspec`;
- Android's Expo config plugin injects `dokitx:3.7.11` and
  `dokitx-okhttp-v4:3.7.11` into the generated Gradle project.

## React Native companion

Mount the companion once near the application root. It renders no button or
floating entry; it only listens for selections made from DoKit's native custom
kits. The build owns whether the package is present; the host owns its MMKV
instance, editable keys, copy, and Expo adapter.

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
      sourceBranch={process.env.EXPO_PUBLIC_SOURCE_BRANCH}
      storage={storage}
      updates={Updates}
    />
  )
}
```

`enabled` defaults to `false`; `entries` defaults to an empty array. The
component does not fall back to `__DEV__`, because an internal-flavoured bundle
can still be embedded in a release configuration. It does not create a second
launcher by default: DoKit's native floating icon is the entry point.

Android implements React Native `Modal` as a separate dialog window above the
activity, which can cover DoKit's normal floating icon. A host that needs an
entry inside such a modal can render the bounded proxy below. It opens the same
native DoKit panel, renders only on Android, and defaults to disabled.

```tsx
import { MobileDiagnosticsModalLauncher } from 'mobile-diagnostics-kit'

<MobileDiagnosticsModalLauncher
  enabled={diagnosticsEnabled}
  testID="diagnostics.modalLauncherButton"
  topInset={safeAreaInsets.top}
/>
```

`storage` is structural and works with an MMKV instance that implements the
small `MMKVStorageLike` interface. `sourceBranch` is optional host-owned build
metadata; pass the exact source branch instead of reconstructing it from a
normalized update channel. A non-Expo React Native app may omit `updates`; the
Expo Update page will report that updates are unsupported.

For a native shell that mounts named React Native surfaces, use
`createMobileDiagnosticsSurface(options)`. The returned component is always
enabled because calling the factory is the build-time opt-in. Its close action
defaults to the package-owned native presenter, while a host can still provide
an explicit `onClose` callback.

### Storage policy

Every key returned by the supplied MMKV instance is listed automatically.
Automatically discovered entries are read-only. An `entries` item uses an
exact key to opt that entry into field editing and to provide labels, field
filters, or a nested `valuePath`; prefer `allowedFields` for those entries.
Key or field names that look like credentials, cookies, passwords, private
keys, API keys, or crash reporting credentials are redacted and cannot be
changed through the inspector. Whole-entry deletion still requires
`allowReset: true`.

The host can replace any user-facing string through the `labels` prop without
forking the UI.

## Expo Android + DoKit

Include the config plugin in the build configuration that contains the package:

```js
module.exports = {
  expo: {
    plugins: ['mobile-diagnostics-kit'],
  },
}
```

The plugin adds DoKit, the OkHttp v4 adapter, a compatible Volley version,
React Native's shared OkHttp interceptor, the required release keep rule, and
the `Local State` / `Expo Update` custom kits. Selecting either custom kit emits
a host-neutral React Native destination event. Its initialization calls
`disableUpload()` before DoKit starts.

Config plugins change native projects, so a new Android binary is required
when adding or removing DoKit. The React Native panel can then evolve through
the normal JS delivery path permitted by the host application.

## Native iOS + DoKit

For a local npm dependency in a brownfield shell, point CocoaPods at the
package's `ios` directory only in builds that opt into diagnostics:

```ruby
pod 'MobileDiagnosticsKit',
  :path => 'path/to/node_modules/mobile-diagnostics-kit/ios'
```

Install the entry after the active `UIWindowScene` is connected and visible.
The package owns the diagnostics view controller and guarded close behavior;
the host supplies only its existing React Native surface view:

```swift
import MobileDiagnosticsKit

// SceneDelegate.scene(_:willConnectTo:options:), after makeKeyAndVisible()
MobileDiagnostics.install(in: navigationController) { initialDestination in
  surfaceHost.surfaceView(
    moduleName: "DiagnosticsSurface",
    initialProperties: ["initialDestination": initialDestination]
  )
}
```

The wrapper disables DoKit 3.1.7's internal telemetry collector, registers
`Local State` and `Expo Update` in DoKit, replaces DoKit's legacy `Network`
page, and then installs DoKit's own floating entry. The replacement reads
DoKit's in-memory request models and provides search, error filtering,
capture control, transfer metrics, and request/response details. It neither
persists nor uploads captured contents, does not add another floating button,
and does not modify files inside `Pods`.

## Expo OTA semantics

“Apply update” means check the installed runtime and channel, fetch a compatible
update, and reload if requested. It deliberately cannot switch channels,
bypass `runtimeVersion`, or use a caller-provided URL. If `expo-updates` is
disabled in the binary, the result is `unsupported`.

The page also shows the currently running RN bundle's source branch, update ID,
publish time, channel, runtime version, and whether it came from the embedded
binary or an OTA download. The values are read from the host-provided branch
and the public `expo-updates` constants; raw manifests and update URLs remain
hidden.

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
