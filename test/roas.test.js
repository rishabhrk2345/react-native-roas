/**
 * Bridge-contract tests for the JS half of react-native-roas.
 *
 * The Kotlin twin of these lives in roas_flutter's test/roas_flutter_test.dart,
 * and the reason is the same. `Roas.kt`'s own comments record a real production
 * bug from exactly this boundary: a parameter added anywhere but the end of an
 * argument list silently rebinds every positional call one slot along, and it
 * still compiles because the types line up — beacons signed with a customer id,
 * posted to the wrong host. This bridge sends everything as a NAMED object for
 * that reason, and until now nothing verified it.
 *
 * So these pin the exact payload each method hands the native module. A future
 * edit that drops, renames or misplaces a key fails here rather than reaching a
 * device as an unsigned beacon or a swallowed deep link.
 *
 * One structural difference from the Flutter suite: roas_flutter guards
 * iOS-only methods in Dart with Platform.isIOS, so its tests need a platform
 * override. This bridge deliberately does not branch in JS — Android answers
 * requestTracking/updateConversionValue/appAccountToken with an explicit null
 * natively (see RoasReactModule.kt), so index.js always calls through. The
 * tests assert that pass-through rather than a JS-side no-op.
 */
const { NativeModules, __emitters, __reset } = require('react-native');
const { Roas, RoasEvent, RoasLogLevel, RoasProps } = require('../index.js');

const native = NativeModules.RoasReactNative;

beforeEach(() => {
  __reset();
});

describe('initialize', () => {
  test('sends every argument as a named object entry, nothing positional', async () => {
    await Roas.initialize({
      publicKey: 'site-key',
      customerUserId: 'user-42',
      baseUrl: 'https://collector.example.com',
      appSecret: 'shh',
      requestTrackingAuthorization: false,
    });

    expect(native.initialize).toHaveBeenCalledTimes(1);
    expect(native.initialize).toHaveBeenCalledWith({
      publicKey: 'site-key',
      customerUserId: 'user-42',
      baseUrl: 'https://collector.example.com',
      appSecret: 'shh',
      requestTrackingAuthorization: false,
    });
  });

  test('optional arguments default without shifting keys', async () => {
    await Roas.initialize({ publicKey: 'site-key' });

    // requestTrackingAuthorization defaults TRUE, matching Roas.configure on
    // iOS — an app that never passes the flag must behave as it did before the
    // option existed. The other three stay undefined rather than being omitted,
    // so the native side always reads the same key set.
    expect(native.initialize).toHaveBeenCalledWith({
      publicKey: 'site-key',
      customerUserId: undefined,
      baseUrl: undefined,
      appSecret: undefined,
      requestTrackingAuthorization: true,
    });
  });
});

test('identify sends email/phone/customerUserId verbatim', async () => {
  await Roas.identify({ email: 'buyer@example.com', customerUserId: 'user-42' });

  expect(native.identify).toHaveBeenCalledWith({
    email: 'buyer@example.com',
    phone: undefined,
    customerUserId: 'user-42',
  });
});

describe('track', () => {
  test('a known RoasEvent key is forwarded with its properties', async () => {
    await Roas.track(RoasEvent.ADD_TO_CART, { sku: 'DEMO-1', qty: 1 });

    expect(native.track).toHaveBeenCalledWith('add_to_cart', {
      sku: 'DEMO-1',
      qty: 1,
    });
  });

  test('an unrecognised event name is still forwarded, not dropped', async () => {
    // The native side falls back to a custom event for anything outside
    // RoasEvent's taxonomy — the bridge must not filter it out first.
    await Roas.track('my_custom_event');

    expect(native.track).toHaveBeenCalledWith('my_custom_event', undefined);
  });
});

test('handleDeepLink forwards the raw url unmodified', async () => {
  // Kept whole on purpose: native 0.1.5 fixed a bug where every query parameter
  // except rsclid was dropped, so utm_* never reached the backend. Any trimming
  // or re-encoding here would reintroduce it above the SDK.
  const url = 'https://example.com/open?rsclid=AbC123&utm_source=meta&utm_medium=cpc';
  await Roas.handleDeepLink(url);

  expect(native.handleDeepLink).toHaveBeenCalledWith(url);
});

test('setLogLevel forwards the constant the native enum expects', async () => {
  await Roas.setLogLevel(RoasLogLevel.DEBUG);

  // Already uppercase here, unlike Flutter which uppercases an enum name —
  // RoasLogLevel.valueOf() on the Kotlin side is case-sensitive.
  expect(native.setLogLevel).toHaveBeenCalledWith('DEBUG');
});

describe('iOS-only methods call through on every platform', () => {
  // Android resolves each of these with an explicit null rather than not
  // defining them, so one JS call site works on both platforms. A JS-side
  // platform guard would be the wrong fix: an absent @ReactMethod surfaces as
  // "is not a function" on a perfectly valid call.
  test('requestTracking reaches the native module', async () => {
    await Roas.requestTracking();
    expect(native.requestTracking).toHaveBeenCalledTimes(1);
  });

  test('updateConversionValue packs value/coarse/lockWindow', async () => {
    await Roas.updateConversionValue(42, { coarse: 'high', lockWindow: true });

    expect(native.updateConversionValue).toHaveBeenCalledWith({
      value: 42,
      coarse: 'high',
      lockWindow: true,
    });
  });

  test('updateConversionValue defaults lockWindow to false', async () => {
    // lockWindow posts immediately and discards every later conversion, so
    // defaulting it true would silently cap everyone's SKAN window at the first
    // value they ever sent.
    await Roas.updateConversionValue(7);

    expect(native.updateConversionValue).toHaveBeenCalledWith({
      value: 7,
      coarse: undefined,
      lockWindow: false,
    });
  });

  test('appAccountToken returns the native value', async () => {
    await expect(Roas.appAccountToken()).resolves.toBeNull();
    expect(native.appAccountToken).toHaveBeenCalledTimes(1);
  });
});

test('visitorId returns the native value', async () => {
  await expect(Roas.visitorId()).resolves.toBe('rs-test-vid');
});

describe('onDeliveryResult', () => {
  // index.js caches its NativeEventEmitter in a module-level variable, on
  // purpose — see the "share ONE emitter" test below for what that protects.
  // That cache outlives any per-test reset of the mock, so these tests reset
  // the whole module registry instead and re-require both sides. Clearing the
  // mock's emitter list alone would leave index.js holding an emitter the
  // assertions could no longer see.
  let Fresh;
  let rn;

  beforeEach(() => {
    jest.resetModules();
    rn = require('react-native');
    Fresh = require('../index.js').Roas;
  });

  test('subscribes to the event name both native halves emit', async () => {
    const seen = [];
    Fresh.onDeliveryResult(r => seen.push(r));

    expect(rn.__emitters).toHaveLength(1);
    const emitter = rn.__emitters[0];
    // The emitter must be built OVER the native module — that is what makes RN
    // call addListener/removeListeners on it, which is how RoasReactModule.kt
    // refcounts the process-wide SDK callback.
    expect(emitter.module).toBe(rn.NativeModules.RoasReactNative);
    expect(emitter.subscriptions[0].eventType).toBe('RoasDeliveryResult');

    emitter.__emit('RoasDeliveryResult', {
      path: '/api/tracking/mobile/first-open',
      success: true,
      error: null,
    });

    expect(seen).toEqual([
      { path: '/api/tracking/mobile/first-open', success: true, error: null },
    ]);
  });

  test('remove() stops delivery', async () => {
    const seen = [];
    const sub = Fresh.onDeliveryResult(r => seen.push(r));
    sub.remove();

    rn.__emitters[0].__emit('RoasDeliveryResult', {
      path: '/x',
      success: false,
      error: 'boom',
    });

    expect(seen).toEqual([]);
  });

  test('all listeners share ONE emitter', async () => {
    // A second NativeEventEmitter over the same module would refcount
    // separately on the native side, so the last unsubscribe from one could
    // clear the SDK callback the other is still listening on — deliveries would
    // go silent with nothing saying so.
    Fresh.onDeliveryResult(() => {});
    Fresh.onDeliveryResult(() => {});

    expect(rn.__emitters).toHaveLength(1);
    expect(rn.__emitters[0].subscriptions).toHaveLength(2);
  });
});

describe('constants are a wire contract, not conveniences', () => {
  test('RoasEvent keys match the native taxonomy', () => {
    // These strings are compared against RoasEvent.kt / RoasEvent.swift by
    // value. A typo here does not fail loudly — it silently becomes a custom
    // event, splitting one funnel step into two in every report.
    expect(RoasEvent).toEqual({
      VIEW_CONTENT: 'view_content',
      ADD_TO_CART: 'add_to_cart',
      ADD_TO_WISHLIST: 'add_to_wishlist',
      BEGIN_CHECKOUT: 'begin_checkout',
      SEARCH: 'search',
      LEAD: 'lead',
      SIGN_UP: 'sign_up',
      LOGIN: 'login',
      START_TRIAL: 'start_trial',
      SUBSCRIBE: 'subscribe',
      LEVEL_START: 'level_start',
      LEVEL_COMPLETE: 'level_complete',
      TUTORIAL_COMPLETE: 'tutorial_complete',
      SHARE: 'share',
    });
  });

  test('RoasProps keys match RoasProps.kt', () => {
    // Reporting can only group by a key it can predict. An app spelling these
    // differently on Android than iOS reports one product as two, and the
    // mistake only surfaces months of data later.
    expect(RoasProps).toEqual({
      PRODUCT_ID: 'product_id',
      PRODUCT_NAME: 'product_name',
      CATEGORY: 'category',
      QUANTITY: 'quantity',
      PRICE: 'price',
      CURRENCY: 'currency',
      QUERY: 'query',
      SOURCE: 'source',
    });
  });

  test('RoasLogLevel matches the native enum case names', () => {
    expect(RoasLogLevel).toEqual({ NONE: 'NONE', ERROR: 'ERROR', DEBUG: 'DEBUG' });
  });
});

describe('when the native module is not linked', () => {
  // The single most common integration failure: the package is installed but
  // the app was never rebuilt. Every method must say so rather than resolving
  // quietly, because a bridge that no-ops looks exactly like an app with no
  // traffic — which is indistinguishable from a campaign going cold.
  let Unlinked;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      NativeModules: {}, // autolinking never ran
      NativeEventEmitter: class {},
    }));
    Unlinked = require('../index.js').Roas;
  });

  afterEach(() => {
    jest.dontMock('react-native');
    jest.resetModules();
  });

  test.each([
    ['initialize', () => Unlinked.initialize({ publicKey: 'k' })],
    ['visitorId', () => Unlinked.visitorId()],
    ['appAccountToken', () => Unlinked.appAccountToken()],
    ['identify', () => Unlinked.identify({ email: 'a@b.c' })],
    ['track', () => Unlinked.track('add_to_cart')],
    ['handleDeepLink', () => Unlinked.handleDeepLink('https://x?rsclid=1')],
    ['setLogLevel', () => Unlinked.setLogLevel('DEBUG')],
    ['requestTracking', () => Unlinked.requestTracking()],
    ['updateConversionValue', () => Unlinked.updateConversionValue(1)],
    ['onDeliveryResult', () => Unlinked.onDeliveryResult(() => {})],
  ])('%s throws a clear "not linked" error', (_name, call) => {
    expect(call).toThrow(/isn't linked/);
  });
});
