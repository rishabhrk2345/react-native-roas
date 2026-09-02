# react-native-roas

A thin React Native bridge to the native **roas-android-sdk**
(`com.roassensor.sdk.Roas`) and **RoasSensor iOS SDK** (`RoasSensor.Roas`,
from `sdk-ios`). Both platforms register a native module named
`RoasReactNative`, so `index.js` needs no platform branching — calling any
method before either native side is linked throws a clear "isn't linked"
error rather than silently doing nothing.

This package does not reimplement any tracking logic. Every call is a direct
pass-through to the native SDK for that platform — the same install-referrer
reading (Android) / ATT+IDFA+ASA+SKAdNetwork handling (iOS), on-device
hashing, and persisted retry queue a pure-Kotlin or pure-Swift app gets. See
`Roas.kt` in `sdk-android` and `Roas.swift` in `sdk-ios` for the actual
implementations.

## ✅ Verified end to end (Android)

This was built into a real RN 0.86 app (`example/`, the app in this repo),
proven on both an **emulator** and a **physical device** (Realme RMX1941,
Android 9, over the same LAN as the backend) — not just compiled:

- `initialize()`, `identify()`, `track()`, and `visitorId()` all confirmed
  reaching the native module and returning correctly from JS.
- The resulting beacons confirmed landing in the Django backend's database
  (`TouchPoint`/`Event` rows with matching visitor ids), exactly as with the
  native sample app and the Flutter bridge — on both the emulator run and
  the physical-device run.

**Deep links are verified too**, on bridge 0.1.5 against native 0.1.6 (emulator,
Android 17, local backend). The example app previously had no `Linking` wiring at
all, so `handleDeepLink()` was the one bridge method nothing ever called; it now
has a `roasrn://open` intent-filter and both cold- and warm-start wiring,
mirroring the Flutter example's `roassample://open`. A real click was minted
through `/api/tracking/c/<slug>` and replayed as a deep link:

- **Warm start** (app running, link arrives via `onNewIntent` →
  `Linking.addEventListener('url')`) → `app_open` touchpoint with
  `click_id=<rsclid>`, `click_id_type=rsclid`, `session_number=1`.
- **Cold start** (app force-stopped, link is the launch intent →
  `Linking.getInitialURL()`) → same, and the same `vid` as before the kill.
- **All four `utm_*` fields arrived on both.** That is the 0.1.5 fix landing:
  0.1.4 dropped every query parameter except `rsclid`, so on the old pin these
  columns would have been blank and the open would have attributed to a click
  with no campaign context.

One field does *not* arrive: `referrer_source` is empty on a deep-link touch,
where iOS sets `"deeplink"`. This is **not** a bridge defect and Flutter behaves
identically — the `.put("referrer_source", "deeplink")` line is part of the
unpublished native 0.1.7 (same commit as `version = "0.1.7"`). Until that ships,
any report grouping by source splits one user behaviour across two buckets
between iOS and Android. It costs no attribution: the click id extracts
correctly on both.

What's *not* yet verified on Android: a real Play Store install (the
referrer only works on a genuine Play-mediated install, never
`run-android`'s USB/emulator deploy — see
`docs/play-console-testing-react-native.md` in the main repo), and a real
RevenueCat purchase (see "RevenueCat wiring" below — the example is wired
and builds cleanly, but no RevenueCat account has posted a webhook to this
backend yet).

**That run was against `com.roassensor:roas` 0.1.4.** Bridge 0.1.5 moves the pin
to **0.1.6** — two native releases of referrer, timestamp and identity fixes, all
of them silent from JS (see the changelog in `android/build.gradle`; the one to
care about most is `ts` on every beacon, without which an install that happened
offline is recorded on the day the queue flushed rather than the day it
happened). The bump is a straight dependency change with no API break, but
nothing above has been re-run on it, so treat the Android verification as
*carried over* rather than re-proven until someone repeats the emulator +
device pass.

0.1.6 rather than 0.1.7 because **0.1.7 is not published**: `sdk-android`'s
`build.gradle.kts` carries `version = "0.1.7"`, but Maven Central's metadata
stops at 0.1.6, and pinning 0.1.7 fails the build with "Could not find
com.roassensor:roas:0.1.7". Once it ships, the pin and the version note at the
top of `android/build.gradle` are the whole change. Note this does **not** hold
the iOS half back — RoasSensor 0.1.7 is tagged and resolvable, and is a hard
floor for this release.

## RevenueCat wiring (`example/`)

`example/App.tsx` now also configures RevenueCat's own React Native SDK
(`react-native-purchases`), threading `Roas.visitorId()` in as `appUserID` so
a purchase attributes back to the install that drove it — mirrors
`sample/MainActivity.kt`'s wiring exactly. Confirmed to type-check (`tsc
--noEmit` clean) and build the Android app cleanly (`gradlew assembleDebug`
succeeds); **not yet run against a real RevenueCat account** — fill in
`REVENUECAT_API_KEY` in `App.tsx` with your project's key once you've signed
up, then use the "RevenueCat: fetch offerings" / "Buy: ..." buttons the same
way as the native sample. The example's `minSdkVersion` (24) already clears
RevenueCat's Android floor (23), so no bump was needed there.

## ⚠️ iOS: bridge written, not yet built or run

The `ios/` bridge (`RoasReactNative.swift` + `RoasReactNative.m` +
`react-native-roas.podspec`) is written and mirrors the Android module
method-for-method, but — unlike Android — **it has not been compiled,
installed, or run on a device or simulator.** It was written on Windows,
where there's no Xcode. `example/` already has its
own `ios/` folder from RN's default template — someone with a Mac needs to
add a `RoasSensor` pod source to its `ios/Podfile` (a commented-out line is
already there, pointing at where to uncomment it), run `pod install`, and
prove it the same way Android already was — see "Testing this yourself"
below — before treating iOS as trustworthy the way Android now is.

Bridge 0.1.5 adds four iOS-facing methods — `requestTracking()`,
`updateConversionValue()`, `appAccountToken()` and `onDeliveryResult()` — so
that gap is now wider, not narrower: the surface most in need of a compiler is
the part that has never seen one. Two changes in particular carry real
first-build risk and are worth checking first on a Mac:

- `RoasReactNative` now subclasses **`RCTEventEmitter`** rather than `NSObject`,
  which means `RoasReactNative.m`'s `RCT_EXTERN_MODULE` base class had to change
  too. Those two are declared independently and a mismatch compiles cleanly,
  then fails at runtime.
- `Roas.configure` is now called with `requestTrackingAuthorization:`, which
  sits **third** in the native signature, before `appSecret:`. Swift named
  arguments make that safe here, but the ordering is deliberate on the SDK side
  and worth not "tidying".

The Flutter bridge's own first iOS run found two device-only bugs (a swallowed
ATT prompt, and `last_update_at` present in the Simulator but absent on real
hardware). Assume this one has its own.

Three real bugs were caught and fixed getting the *Android* side working:

1. **JVM target mismatch.** The module originally targeted Java 8, but RN
   0.86's app build compiles Java at 17 — Gradle refuses to mix
   `compileDebugJavaWithJavac` (17) and `compileDebugKotlin` (1.8) in the same
   module. Fixed by raising `compileOptions`/`kotlinOptions` to 17 here (see
   the comment in `android/build.gradle` if you're on an older RN that still
   expects 1.8 — lower both back down).
2. **`main-SNAPSHOT` JitPack coordinate timed out**, same issue hit by the
   Flutter bridge — a branch snapshot has to be built by JitPack on first
   request. Pinned to the same already-cached commit
   (`5a38d82779`) the Flutter bridge and native sample use.
3. **Metro can't resolve a `file:`-linked package's own dependencies.**
   `node_modules/react-native-roas` is a symlink to a folder *outside* the
   app's project root — the parent, for `example/`'s `file:..`; a sibling, for
   a consuming app that placed this package next to it. Either way it is off
   the app's own path, and that is what breaks: Metro's default hierarchical
   `node_modules` lookup walks *up* from the requesting file, so from outside
   the app root that walk can never reach back down into the app's
   `node_modules`. `react-native-roas/index.js`'s own `import {NativeModules}
   from 'react-native'` therefore failed to resolve even though the app
   clearly has `react-native` installed. Fixed with `watchFolders` +
   `resolver.unstable_enableSymlinks` + `resolver.extraNodeModules` in the
   consuming app's `metro.config.js` — **this is required in any app that
   consumes this package via a local `file:` link** (not needed once this is
   published to npm properly, where it'd resolve as a normal nested
   dependency). `example/metro.config.js` is a working copy to crib from.

## Install (local package, not yet published)

```json
// package.json
"dependencies": {
  "react-native-roas": "file:../react-native-roas"
}
```

```bash
npm install
```

Autolinking (standard in RN 0.60+) discovers `RoasReactPackage` automatically
— confirmed via `npx react-native config`, no manual registration needed.

**If you're linking this locally (not from a published npm package)**, add to
your app's `metro.config.js`:

```js
const path = require('path');

const config = {
  watchFolders: [path.resolve(__dirname, '../react-native-roas')], // wherever you placed it
  resolver: {
    unstable_enableSymlinks: true,
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
};
```

Without this, Metro throws `Unable to resolve module react-native` when
`react-native-roas/index.js` tries to import it — see bug #3 above.

### iOS-specific setup

Autolinking discovers `react-native-roas.podspec` the same way it discovers
`RoasReactPackage` on Android — no manual registration needed there. But
`RoasSensor` (sdk-ios) is not on the CocoaPods trunk, and a podspec cannot name
a git source for its own dependency, so `pod install` will fail with "Unable to
find a specification for RoasSensor" until you name the source in your app's
`ios/Podfile`:

```ruby
target 'YourApp' do
  # ...
  pod 'RoasSensor', :git => 'https://github.com/rishabhrk2345/Roas-ios-SDK.git', :tag => '0.1.7'
  # or, for local dev against a checkout:
  # pod 'RoasSensor', :path => '../../sdk-ios'
  use_react_native!(...)
end
```

**0.1.7 is a floor, not a suggestion.** `requestTracking()`,
`updateConversionValue()` and `appAccountToken()` are RoasSensor 0.1.7 API — on
anything older the bridge fails to compile with missing-member errors.

Also add to `Info.plist`, for the App Tracking Transparency prompt
`Roas.initialize()` presents by default on first launch:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>Used to measure which ads brought you here.</string>
```

## Usage

```js
import { Roas, RoasEvent } from 'react-native-roas';

await Roas.initialize({
  publicKey: 'YOUR-SITE-PUBLIC-KEY', // Site with platform=android, from the panel
  appSecret: BEACON_SIGNING_SECRET,  // Setup → your app → Beacon signing
  // baseUrl: 'http://10.0.2.2:8000', // only for local testing against an emulator
});

await Roas.track(RoasEvent.ADD_TO_CART, { sku: 'ABC', qty: 1 });
await Roas.identify({ email: 'buyer@example.com' });
const vid = await Roas.visitorId();
```

`appSecret` is optional — leave it out and beacons go unsigned, which the
collector accepts until the property has "require signed beacons" turned on.
But that switch is gated in the panel on the observed signed share reaching
100%, so an app that can never sign is also an app that keeps the whole
property from ever enforcing. It is **not** a revenue credential (that's the
server-side api key, which must never ship inside an app): the worst an
extracted one allows is forging beacons, which the public key alone already
allowed, and rotating it invalidates every build carrying the old one. Read it
from your build config or env rather than committing a literal.

Any event name not in `RoasEvent` still works — it's sent as a custom event
under that exact name, matching how the native sample app calls
`Roas.track(RoasEvent.CUSTOM, name = "boss_defeated")`:

```js
await Roas.track('boss_defeated');
```

Use the `RoasProps` keys for anything you want to report on. The properties
object stays free-form, but reporting can only group by a key it can predict,
so a product funnel can be built **only** from `PRODUCT_ID` — and that id must
be the same one the purchase will arrive with, or the funnel cannot line the
two up. `PRODUCT_NAME` is display only and must never be the join key: names
get edited, translated and reused. `PRICE` is minor units and is reporting
colour only — anything a device claims about money is unverifiable, so no ROAS
numerator reads it.

```js
import { RoasProps } from 'react-native-roas';

await Roas.track(RoasEvent.ADD_TO_CART, {
  [RoasProps.PRODUCT_ID]: 'piano_course_annual',
  [RoasProps.PRICE]: 4999,      // paise/cents, so an integer stays exact
  [RoasProps.CURRENCY]: 'INR',
});
```

### Binding a purchase to the install (do this, or revenue is orphaned)

The visitor id is what a purchase must carry back so it attributes to the
install and the ad click that produced it. Which field depends on the payment
path:

| Path | Field | Value |
|---|---|---|
| Play Billing (Android) | `obfuscatedAccountId` | `await Roas.visitorId()` |
| StoreKit / `react-native-iap` (iOS) | `appAccountToken` | `await Roas.appAccountToken()` |
| RevenueCat (either) | `appUserID` | `await Roas.visitorId()` |

`appAccountToken()` exists because StoreKit requires a UUID, so the iOS SDK
derives one from the vid and the backend reconstructs the vid from the App
Store Server Notification. It resolves null on Android, where Play Billing
takes the visitor id verbatim — so the method is safe to call on both, but use
the right field for each store. Without it an App Store sale has no path at all
back to its ad click: the revenue lands UNATTRIBUTED while the spend still
counts, and iOS ROAS reads low enough to kill a working campaign.

### iOS: ATT timing

`initialize()` presents the ATT prompt on first launch by default, ~0.6s in.
That is a cold-start system alert, before the user has seen anything worth
trusting the app with — the classic way to depress opt-in, and every denial
costs the IDFA, the strongest identity key an iOS install can carry. To show it
after a priming screen instead:

```js
await Roas.initialize({ publicKey, requestTrackingAuthorization: false });
// ...later, at a moment that makes sense to the user:
await Roas.requestTracking();
```

Deferring costs nothing. The install beacon goes out with no advertising id, and
on a grant the SDK binds the IDFA through `/identify`, minting exactly the same
identity key the install beacon would have. `requestTracking()` resolves once
the user has answered and is safe to call more than once. Both are no-ops on
Android, which has no ATT.

### iOS: SKAdNetwork conversion values

For a user who denied ATT — most of them — SKAN is the *only* channel that tells
the ad network the install converted. Leave this uncalled and the network has
nothing to optimise against, and your own SKAN lane records installs with no
events.

```js
await Roas.updateConversionValue(12, { coarse: 'medium' });
```

`value` is the fine value, 0–63; its meaning is the site's SKAN schema, which
lives server-side so it can be retuned without an app release. **Send `coarse`**:
below Apple's install-volume privacy threshold the fine value is withheld
entirely and coarse is all that survives the postback, so fine-only reporting
goes dark on exactly the small campaigns that most need measuring. Pass
`lockWindow: true` only when the value is final — it posts immediately and
discards every later conversion. A no-op on Android.

### Watching deliveries

Most apps do not need this. It exists because without it an app that silently
delivers nothing looks exactly like one with no traffic, and lost beacons are
lost touchpoints — which means credit assigned to the wrong touch, or to none.

```js
useEffect(() => {
  const sub = Roas.onDeliveryResult(({ path, success, error }) => {
    if (!success) console.warn('roas beacon failed', path, error);
  });
  return () => sub.remove();
}, []);
```

Delivery results are pushed, not requested — a beacon queued on a previous
offline launch is flushed during `initialize()`, with nothing in JS awaiting it.
A beacon that fails here is not necessarily lost: the native queue is persisted
and retries on a later launch. Call `remove()` when you are done; the native
callback is torn down when the last listener goes away.

## Unit tests

```bash
npm install
npm test
```

28 contract tests over the JS half, mirroring `roas_flutter`'s
`test/roas_flutter_test.dart`. They pin the **exact payload** each method hands
the native module, because that boundary has already produced one production
bug: `Roas.kt`'s own comments record a parameter added mid-list silently
rebinding every positional call one slot along — beacons signed with a customer
id, posted to the wrong host, and it still compiled. This bridge sends named
objects to make that impossible, and these tests are what keep it that way.

`react-native` is a peerDependency and is **not** installed to run them.
`jest.config.js` maps the import to `test/reactNativeMock.js` instead, so the
tests stay about this bridge's contract rather than about whichever RN version
an install happened to pin, and the package never carries a copy of the
framework it plugs into.

Beyond the Flutter suite's coverage, these also pin the RN-specific hazards:
the delivery listeners must share **one** `NativeEventEmitter` (a second one
refcounts separately on the native side, so the last unsubscribe from one could
clear the SDK callback the other is still listening on), and every method must
throw a clear "isn't linked" error when autolinking has not run — a bridge that
silently no-ops looks exactly like an app with no traffic.

The suite is mutation-checked: flipping the `requestTrackingAuthorization`
default, dropping the emitter cache, and renaming a key in the `initialize`
payload each fail exactly one test and nothing else.

## Testing this yourself

`example/` is the real, working test app every verification above was done
with — `App.tsx` has the same buttons as the native Kotlin sample and the
Flutter sample, so all three are easy to compare side by side.

It lives **inside this repo**, mirroring `roas-sensor-flutter/example/`, and
depends on its own parent via `"react-native-roas": "file:.."` — the npm
equivalent of that plugin's `roas_flutter: path: ../`. It used to be a separate
`RoasRnTest` folder beside this one, which meant the README, `metro.config.js`
and `package.json` all silently assumed you had cloned two things into one
parent directory, and nothing said so. It also let the sample drift from the
bridge it demonstrates: they have to change together (adding
`onDeliveryResult` required editing both), and across two repos that pairing is
recorded nowhere.

The Android app id stays `com.roasrntest` and the iOS project folder stays
`ios/RoasRnTest` — only the location moved. That id is registered in Play
Console for the install-referrer runbook, and renaming it would orphan the
listing.

```bash
cd example
npm install                     # resolves react-native-roas from file:..
npx react-native start          # Metro, in one terminal
npx react-native run-android    # in another, with an emulator/device selected
```

Watch your Django backend for `POST /api/tracking/mobile/first-open|events|identify`
landing with `200`/`201` — same confirmation as the native and Flutter samples.

One local-testing-only gotcha already handled in the example's manifest: the
app's `android:usesCleartextTraffic` placeholder needs to resolve to `true`
for local `http://10.0.2.2:8000` testing to work at all (Android blocks plain
HTTP by default for apps targeting SDK 28+) — RN's own template already wires
this via a build-time placeholder for debug builds, so this one didn't need a
manual fix the way the Flutter bridge's manifest did.

Same AAB/Play Console internal-testing rules apply for a real install
referrer as with any Android app — `run-android` via USB will never populate
it; that needs an actual Play Store install.

### iOS (unverified — needs a Mac)

1. In `example/ios/Podfile`, uncomment the `pod 'RoasSensor', :path =>
   ...` line and point it at your local `sdk-ios` checkout.
2. `cd example/ios && pod install`
3. Add `NSUserTrackingUsageDescription` to `example/ios/RoasRnTest/Info.plist`
   (see "iOS-specific setup" above).
4. `npx react-native run-ios` (Metro from the Android steps above works for
   either platform — no need to restart it).
5. Tap through the same four buttons, then check the Django backend the same
   way as Android.

Nobody has done this yet. The first person to run it should expect to find
and fix at least one real issue — that's exactly what happened getting
Android working (see the three bugs above) and what happened getting the
Flutter iOS bridge scaffolded too; a bridge that's never been compiled by an
actual toolchain should not be assumed correct.
