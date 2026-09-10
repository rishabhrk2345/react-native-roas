/**
 * The React Native twin of sample/MainActivity.kt in the native
 * roas-android-sdk repo and roas-sensor-flutter/example/lib/main.dart — same
 * buttons, same values to fill in, so all three are easy to compare.
 *
 * Nothing to fill in HERE: the backend URL, site key and signing secret come
 * from `example/.env` (copy `.env.example`). See the note on Config below.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Config from 'react-native-config';
import { Roas, RoasEvent, RoasLogLevel } from 'react-native-roas';

// All three come from `example/.env`, baked in at BUILD time by
// react-native-config — the RN twin of the Flutter example's
// `--dart-define=ROAS_APP_SECRET=…`. Editing .env means rebuilding, not just
// refreshing Metro, exactly as with dart-define.
//
// BASE_URL: 10.0.2.2 (the .env.example default) is the emulator's alias for the
// host's localhost and resolves nowhere else. Cleartext http is allowed in
// debug builds via the RN template's usesCleartextTraffic placeholder and NOT
// in release, so a physical phone or a Play-installed build needs an HTTPS
// tunnel (`ngrok http 8000`) in .env before building.
const BASE_URL = Config.ROAS_BASE_URL ?? 'http://10.0.2.2:8000';
const PUBLIC_KEY = Config.ROAS_PUBLIC_KEY ?? '';

// Beacon signing secret — Setup → your app → Beacon signing → "Generate".
//
// Empty → undefined: an empty-string secret would make the SDK sign with a key
// of "", producing a signature the server computes differently and rejects
// outright as INVALID. Absent must mean absent. Unsigned beacons are accepted
// until "reject unsigned beacons" is switched on for the site, so forgetting
// the value degrades to the old behaviour rather than breaking.
const APP_SECRET = Config.ROAS_APP_SECRET || undefined;

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  // Signing state is shown on screen, not just in the log, because the whole
  // failure mode it guards against is invisible: an unsigned build looks
  // identical to a signed one from the device, and the difference only shows up
  // as beacons silently 401ing once the site enforces.
  const [log, setLog] = useState<string[]>([
    'ROASSensor RN sample',
    `baseUrl: ${BASE_URL}`,
    `site: ${PUBLIC_KEY || 'MISSING — set ROAS_PUBLIC_KEY in example/.env'}`,
    APP_SECRET
      ? `signing: ON (secret ${APP_SECRET.length} chars)`
      : 'signing: OFF (set ROAS_APP_SECRET in example/.env to enable)',
    '',
  ]);

  const append = (line: string) => setLog(prev => [...prev, line]);

  // Hoisted out of the effect below so the "Simulate deep link" button can call
  // the exact same path a real link takes — if the button had its own copy, it
  // could keep passing while the real wiring rotted.
  //
  // useCallback with no deps is safe here: `append` only ever calls setLog with
  // the functional updater, so it reads no captured state.
  const handleLink = useCallback((url: string) => {
    Roas.handleDeepLink(url)
      .then(() => {
        const hasClickId = /[?&](rsclid|gclid|fbclid)=/.test(url);
        append(
          `→ handleDeepLink(${url}) sent` +
            (hasClickId ? '' : ' — no click id in it, so a no-op natively'),
        );
      })
      .catch(err => append(`→ handleDeepLink failed: ${err}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Every beacon delivery attempt, surfaced in the on-screen log. Subscribed
    // BEFORE initialize() so the install beacon's own delivery is caught —
    // subscribing after it would miss the first and most important one, and
    // also miss the flush of anything queued from a previous offline launch.
    const delivery = Roas.onDeliveryResult(({ path, success, error }) =>
      append(`   [delivery] ${path} ${success ? 'ok' : `FAILED: ${error}`}`),
    );

    // This reports the install (first launch) and flushes any queued beacons.
    // DEBUG so the native SDK's delivery attempts reach logcat — the default
    // is ERROR, which makes a beacon that never fires look identical to one
    // that succeeded.
    Roas.setLogLevel(RoasLogLevel.DEBUG);
    Roas.initialize({ publicKey: PUBLIC_KEY, baseUrl: BASE_URL, appSecret: APP_SECRET })
      .then(async () => {
        append('→ initialize() resolved');
        const vid = await Roas.visitorId();
        append(`vid = ${vid}`);
      })
      .catch(err => append(`→ initialize() failed: ${err}`));

    // Deep-link wiring — with the button below, the only thing in this sample
    // that exercises Roas.handleDeepLink(). Without it the deep-link → rsclid →
    // backend TouchPoint path (the Android twin of a Play install referrer, but
    // for a LATER open of an app that is already installed) has no way to be
    // verified: the URL never reaches the SDK at all. Mirrors the Flutter
    // example's app_links wiring, using RN's built-in Linking — no extra
    // dependency needed.
    //
    // On iOS this only works because AppDelegate forwards openURL and
    // continueUserActivity into RCTLinkingManager; without those the two
    // subscriptions below are dead code there.

    // Cold start: the OS launched this app FROM a link tap, before anything
    // here was listening.
    Linking.getInitialURL()
      .then(url => {
        if (url) handleLink(url);
      })
      .catch(err => append(`→ initial deep link error: ${err}`));

    // Warm start: the app is already running and a link arrives. Reaches us
    // through onNewIntent, which is why MainActivity is launchMode=singleTask.
    const linkSub = Linking.addEventListener('url', ({ url }) => handleLink(url));

    // Tears down the native callback when the last listener goes away.
    return () => {
      delivery.remove();
      linkSub.remove();
    };
  }, [handleLink]);

  // The value a store purchase must carry so the store's server notification
  // traces back to this install and the ad click behind it. That is the WHOLE
  // purchase wiring — there is no RevenueCat here any more, for the reason the
  // Flutter sample dropped it: the store-native path (Play RTDN / App Store
  // Server Notifications, both signed by the store) is what this product is
  // moving to, and the sample should show the thing being adopted.
  //
  // Two different shapes because the two stores accept different things:
  //   Android — Play Billing's `obfuscatedAccountId` is a free string and takes
  //             the raw visitor id verbatim. react-native-iap 16:
  //             `requestPurchase({ type, request: { google: { skus, obfuscatedAccountId: vid } } })`
  //             (<= 12 took a flat `obfuscatedAccountIdAndroid` on the call).
  //   iOS     — StoreKit's `appAccountToken` must be a UUID, so the iOS SDK
  //             derives one from the vid and the backend reconstructs it.
  //             react-native-iap 16: `request: { apple: { sku, appAccountToken } }`.
  // A purchase without it still records revenue — as UNATTRIBUTED, while the
  // spend still counts, so ROAS reads low enough to kill a working campaign.
  const showPurchaseId = async () => {
    try {
      if (Platform.OS === 'ios') {
        const token = await Roas.appAccountToken();
        append(`→ appAccountToken (StoreKit) = ${token ?? 'null — only after initialize()'}`);
      } else {
        const vid = await Roas.visitorId();
        append(`→ obfuscatedAccountId (Play Billing) = ${vid ?? 'null — only after initialize()'}`);
      }
    } catch (err) {
      append(`→ purchase id failed: ${err}`);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingHorizontal: 12 }]}>
      <Text style={styles.title}>ROAS RN sample</Text>
      <View style={styles.row}>
        <Button
          title="Track: add_to_cart"
          onPress={() =>
            Roas.track(RoasEvent.ADD_TO_CART, { sku: 'DEMO-1', qty: 1 })
              .then(() => append('→ track(add_to_cart) sent'))
              .catch(err => append(`→ track failed: ${err}`))
          }
        />
        <Button
          title="Track: begin_checkout"
          onPress={() =>
            Roas.track(RoasEvent.BEGIN_CHECKOUT)
              .then(() => append('→ track(begin_checkout) sent'))
              .catch(err => append(`→ track failed: ${err}`))
          }
        />
      </View>
      <View style={styles.row}>
        <Button
          title="Identify: buyer@example.com"
          onPress={() =>
            Roas.identify({ email: 'buyer@example.com' })
              .then(() => append('→ identify(email) sent'))
              .catch(err => append(`→ identify failed: ${err}`))
          }
        />
        <Button
          title="Show visitor id"
          onPress={() =>
            Roas.visitorId()
              .then(vid => append(`vid = ${vid}`))
              .catch(err => append(`→ visitorId failed: ${err}`))
          }
        />
      </View>

      {/* The three iOS-only methods. Shown on Android too, where each is an
          explicit native no-op — that is the bridge's design (index.js never
          branches on platform), and seeing them resolve to null on Android is
          itself worth being able to check. Mirrors the ATT and appAccountToken
          buttons in roas-sensor-flutter's example. */}
      <View style={styles.row}>
        <Button
          title="iOS: request ATT"
          onPress={() =>
            Roas.requestTracking()
              .then(() =>
                append(
                  Platform.OS === 'ios'
                    ? '→ requestTracking() resolved — ATT answered, IDFA bound if granted'
                    : '→ requestTracking() resolved (no-op on Android)',
                ),
              )
              .catch(err => append(`→ requestTracking failed: ${err}`))
          }
        />
        <Button
          // Platform-aware, unlike the Flutter sample's iOS-only "Show
          // appAccountToken": Android is the platform this bridge is verified
          // on, so the value it prints there — the raw vid — is the one an
          // Android integrator actually has to hand to Play Billing.
          title="Show purchase id (store)"
          onPress={showPurchaseId}
        />
      </View>
      <View style={styles.row}>
        <Button
          title="Simulate deep link"
          // Calls handleLink directly, exactly as a real tap on
          // roasrn://open?rsclid=... would — both paths end at the same
          // function, so this cannot pass while the real wiring is broken.
          //
          // It bypasses the OS deliberately, which is the point on iOS: it
          // exercises Roas.handleDeepLink() without a Mac, simctl, or the
          // AppDelegate forwarding being correct yet. To trigger it through a
          // REAL link instead:
          //   Android: adb shell am start -a android.intent.action.VIEW \
          //              -d "roasrn://open?rsclid=test123"
          //   iOS:     xcrun simctl openurl booted "roasrn://open?rsclid=test123"
          // Only the real form proves the intent-filter / CFBundleURLTypes and
          // the AppDelegate hooks; this button proves everything above them.
          onPress={() =>
            handleLink(
              'roasrn://open?rsclid=manual-test-123&utm_source=manual&utm_medium=button',
            )
          }
        />
        <Button
          title="iOS: SKAN value 12 (coarse medium)"
          onPress={() =>
            // Fine value 0–63; its meaning is the site's SKAN schema, which
            // lives server-side. coarse is sent because below Apple's
            // install-volume privacy threshold the fine value is withheld
            // entirely and coarse is all that survives the postback.
            // lockWindow left false — true would post immediately and discard
            // every later conversion.
            Roas.updateConversionValue(12, { coarse: 'medium' })
              .then(() =>
                append(
                  Platform.OS === 'ios'
                    ? '→ updateConversionValue(12, medium) sent to SKAdNetwork'
                    : '→ updateConversionValue resolved (no-op on Android)',
                ),
              )
              .catch(err => append(`→ updateConversionValue failed: ${err}`))
          }
        />
      </View>

      <ScrollView style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  log: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#ddd', paddingTop: 8 },
  logLine: { fontSize: 13, marginBottom: 2 },
});

export default App;
