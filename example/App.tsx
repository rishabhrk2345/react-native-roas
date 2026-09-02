/**
 * The React Native twin of sample/MainActivity.kt in the native
 * roas-android-sdk repo and roas-flutter/example/lib/main.dart — same
 * buttons, same values to fill in, so all three are easy to compare.
 *
 * FILL IN THE THREE VALUES BELOW before running.
 */
import { useEffect, useState } from 'react';
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
import { Roas, RoasEvent, RoasLogLevel } from 'react-native-roas';
import Purchases, { LOG_LEVEL, PurchasesPackage } from 'react-native-purchases';

// The emulator's alias for the host machine's localhost, for running against a
// local `manage.py runserver`. Cleartext http is allowed in debug builds via the
// RN template's usesCleartextTraffic manifest placeholder, and NOT in release.
//
// Swap to an ngrok HTTPS tunnel for a physical device or a Play-installed build
// — 10.0.2.2 resolves on the emulator only:
//   const BASE_URL = 'https://<your-ngrok>.ngrok-free.dev';
const BASE_URL = 'http://10.0.2.2:8000';
const PUBLIC_KEY = '360bd19f-b945-4c44-a410-8f9f14390cce';

// RevenueCat's public Google API key for this project (Project settings →
// API keys). Not the same as PUBLIC_KEY above — that one is ours, this one
// is RevenueCat's.
const REVENUECAT_API_KEY = 'test_FzaGVLRLGebnvdQzbrWpjQxAKiR';

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
  const [log, setLog] = useState<string[]>([
    'ROASSensor RN sample',
    `baseUrl: ${BASE_URL}`,
    '',
  ]);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  const append = (line: string) => setLog(prev => [...prev, line]);

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
    Roas.initialize({ publicKey: PUBLIC_KEY, baseUrl: BASE_URL })
      .then(async () => {
        append('→ initialize() resolved');
        // appUserID = our vid, so the purchase RevenueCat's webhook reports
        // later carries the exact visitor whose ad click drove the install.
        const vid = await Roas.visitorId();
        await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        // DISABLED for release-build testing. RevenueCat rejects a test-store
        // key in a release build by launching SimulatedStoreErrorDialogActivity,
        // which then THROWS on pause — killing the process the instant the app
        // is backgrounded. That crash masquerades as "the SDK never sent a
        // beacon". Re-enable with a real Play Store key from the RevenueCat
        // dashboard.
        // Purchases.configure({ apiKey: REVENUECAT_API_KEY, appUserID: vid ?? undefined });
        append(`vid = ${vid}`);
      })
      .catch(err => append(`→ initialize() failed: ${err}`));

    // Deep-link wiring — the ONLY thing in this sample that exercises
    // Roas.handleDeepLink(). Without it the deep-link → rsclid → backend
    // TouchPoint path (the Android twin of a Play install referrer, but for a
    // LATER open of an app that is already installed) has no way to be
    // verified: the URL never reaches the SDK at all. Mirrors the Flutter
    // example's app_links wiring, using RN's built-in Linking — no extra
    // dependency needed.
    const handleLink = (url: string) => {
      Roas.handleDeepLink(url)
        .then(() => {
          const hasClickId = /[?&](rsclid|gclid|fbclid)=/.test(url);
          append(
            `→ handleDeepLink(${url}) sent` +
              (hasClickId ? '' : ' — no click id in it, so a no-op natively'),
          );
        })
        .catch(err => append(`→ handleDeepLink failed: ${err}`));
    };

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
  }, []);

  const fetchOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) {
        append('→ offerings: none configured yet (check RevenueCat dashboard)');
        return;
      }
      append(`→ offerings: '${current.identifier}' has ${current.availablePackages.length} package(s)`);
      setPackages(current.availablePackages);
    } catch (err) {
      append(`→ offerings error: ${err}`);
    }
  };

  const buyPackage = async (pkg: PurchasesPackage) => {
    try {
      const vid = await Roas.visitorId();
      await Purchases.purchasePackage(pkg);
      append(`→ purchase completed: ${pkg.product.identifier} (vid=${vid})`);
    } catch (err: any) {
      append(err?.userCancelled ? '→ purchase cancelled' : `→ purchase error: ${err}`);
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
          title="iOS: appAccountToken"
          onPress={() =>
            Roas.appAccountToken()
              .then(token =>
                // Null on Android is CORRECT, not a failure: Play Billing takes
                // the visitor id verbatim as obfuscatedAccountId, so there is
                // nothing to derive. StoreKit needs a UUID, hence this.
                append(
                  `appAccountToken = ${token ?? 'null — iOS only, and only after initialize()'}`,
                ),
              )
              .catch(err => append(`→ appAccountToken failed: ${err}`))
          }
        />
      </View>
      <View style={styles.row}>
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

      <View style={styles.row}>
        <Button title="RevenueCat: fetch offerings" onPress={fetchOfferings} />
      </View>
      {packages.map(pkg => (
        <View style={styles.row} key={pkg.identifier}>
          <Button
            title={`Buy: ${pkg.identifier} (${pkg.product.priceString})`}
            onPress={() => buyPackage(pkg)}
          />
        </View>
      ))}
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
