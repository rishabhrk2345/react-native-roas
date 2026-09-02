import { NativeEventEmitter, NativeModules } from 'react-native';

const { RoasReactNative } = NativeModules;

/** Must match RoasReactModule.DELIVERY_EVENT and RoasReactNative.deliveryEvent. */
const DELIVERY_EVENT = 'RoasDeliveryResult';

// Lazily created, and shared: a second NativeEventEmitter over the same module
// would refcount separately on the native side, so the last unsubscribe from
// one could clear the SDK callback the other is still listening on.
let deliveryEmitter = null;
function emitter() {
  if (!deliveryEmitter) deliveryEmitter = new NativeEventEmitter(RoasReactNative);
  return deliveryEmitter;
}

function assertLinked() {
  if (!RoasReactNative) {
    throw new Error(
      "react-native-roas: native module 'RoasReactNative' isn't linked. " +
        'Did you rebuild the app after adding this package? (Android: ' +
        're-run the Gradle build. iOS: run `pod install` and rebuild — ' +
        'and make sure your Podfile has an explicit source for RoasSensor, ' +
        'see the README\'s "iOS-specific setup" section.)'
    );
  }
}

/**
 * The known event keys RoasEvent.kt defines natively — mirrored here as
 * plain strings so callers get autocomplete without a generated enum
 * bridge. Anything not in this list is still valid: track() sends it as a
 * custom event with that exact name.
 */
export const RoasEvent = {
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
};

/** Mirrors `RoasLogLevel` in `Roas.kt` / `RoasLogLevel.swift`. */
export const RoasLogLevel = {
  NONE: 'NONE',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG',
};

/**
 * The property keys ROASSensor understands in track() — mirroring native
 * RoasProps.kt, and kept identical to it on purpose: an app that spells the
 * key differently on Android than on iOS reports one product as two, and the
 * mistake only surfaces months of data later.
 *
 * The properties object stays free-form — record whatever you find useful
 * alongside these. But reporting can only group by a key it can predict, so a
 * product funnel can be built ONLY from PRODUCT_ID.
 *
 * PRODUCT_ID must be the same identifier the purchase will arrive with — for
 * RevenueCat the store product id, for Stripe the price/product id. That is
 * what lines an add_to_cart up against the purchase that did or did not
 * follow it. PRODUCT_NAME is for display only and must never be the join key:
 * names get edited, translated and reused.
 *
 * PRICE is reporting colour only. Anything a device claims about money is
 * unverifiable, so no ROAS numerator reads it — revenue enters solely through
 * the signed webhook.
 *
 *   Roas.track(RoasEvent.ADD_TO_CART, {
 *     [RoasProps.PRODUCT_ID]: 'piano_course_annual',
 *     [RoasProps.PRICE]: 4999,      // minor units, so an integer stays exact
 *     [RoasProps.CURRENCY]: 'INR',
 *   });
 */
export const RoasProps = {
  PRODUCT_ID: 'product_id',
  PRODUCT_NAME: 'product_name',
  CATEGORY: 'category',
  QUANTITY: 'quantity',
  PRICE: 'price',
  CURRENCY: 'currency',
  QUERY: 'query',
  SOURCE: 'source',
};

export const Roas = {
  /**
   * Start the SDK. Call once, as early as possible — e.g. at the top of
   * your app's entry file, before rendering anything. Idempotent on the
   * native side: a second call there is a no-op.
   *
   * `appSecret` is this property's beacon signing secret (Setup → your app →
   * Beacon signing). Optional: without it beacons go unsigned, which the
   * collector accepts until you turn on "require signed beacons" — but an app
   * that can never sign also never lets the observed signed share reach 100%,
   * and that share is the gate on turning enforcement on at all. It is NOT a
   * revenue credential; that is the server-side api key, which must never ship
   * inside an app. The worst an extracted one allows is forging beacons, which
   * the public key alone already allowed, and rotating it invalidates every
   * build carrying the old one. Keep it out of source control — read it from
   * your build config or env rather than writing a literal here.
   *
   * `requestTrackingAuthorization` is **iOS only** and controls whether the App
   * Tracking Transparency prompt is shown on first launch. Leave it true and the
   * prompt appears ~0.6s after this call — a cold-start system alert, before the
   * user has seen anything worth trusting the app with, which is the classic way
   * to depress opt-in. Every denial costs the IDFA, the strongest identity key an
   * iOS install can carry. Pass false and call `requestTracking()` yourself after
   * a priming screen; the SDK binds the IDFA at that point either way, so
   * deferring costs nothing. Ignored on Android, which has no ATT.
   *
   * @param {{ publicKey: string, customerUserId?: string, baseUrl?: string, appSecret?: string, requestTrackingAuthorization?: boolean }} options
   */
  initialize({
    publicKey,
    customerUserId,
    baseUrl,
    appSecret,
    requestTrackingAuthorization = true,
  } = {}) {
    assertLinked();
    return RoasReactNative.initialize({
      publicKey,
      customerUserId,
      baseUrl,
      appSecret,
      requestTrackingAuthorization,
    });
  },

  /**
   * **iOS only** (a no-op on Android) — show the ATT prompt now, and bind the
   * IDFA if granted. Pair with
   * `initialize({ requestTrackingAuthorization: false })`.
   *
   * Resolves once the user has answered. Calling this long after the install
   * was reported is fine and is the point: the install beacon went out with no
   * advertising id, so on a grant the SDK binds the IDFA through /identify,
   * minting the same identity key the install beacon would have. Safe to call
   * more than once — once answered, iOS returns the stored answer without
   * re-prompting.
   * @returns {Promise<void>}
   */
  requestTracking() {
    assertLinked();
    return RoasReactNative.requestTracking();
  },

  /**
   * **iOS only** (a no-op on Android) — report a SKAdNetwork conversion value.
   *
   * For a user who denied ATT — most of them — SKAN is the *only* channel that
   * tells the ad network the install converted, so leaving this uncalled means
   * the network has nothing to optimise against and your own SKAN lane records
   * installs with no events.
   *
   * @param {number} value the fine value, 0–63. Its meaning is the site's SKAN
   *   schema, which lives server-side so it can be retuned without an app release.
   * @param {{ coarse?: 'low'|'medium'|'high', lockWindow?: boolean }} [options]
   *   **Send `coarse`**: below Apple's install-volume privacy threshold the fine
   *   value is withheld entirely and coarse is all that survives the postback, so
   *   fine-only reporting goes dark on exactly the small campaigns that most need
   *   measuring. `lockWindow` posts immediately and discards every later
   *   conversion — only when the value is final.
   * @returns {Promise<void>}
   */
  updateConversionValue(value, { coarse, lockWindow = false } = {}) {
    assertLinked();
    return RoasReactNative.updateConversionValue({ value, coarse, lockWindow });
  },

  /**
   * **iOS only** — a UUID derived from the visitor id, to hand StoreKit as a
   * purchase's `appAccountToken`. Resolves null on Android and before
   * initialize().
   *
   * This is what ties a native App Store purchase back to the install that drove
   * it: the App Store Server Notification carries the token, and the backend
   * reconstructs the vid from it. Without it, an app buying through StoreKit has
   * no path at all from an iOS sale to its ad click, so the revenue lands
   * UNATTRIBUTED while the spend still counts and iOS ROAS reads low enough to
   * kill a working campaign.
   *
   * Not needed with RevenueCat — that path uses visitorId() as the `appUserID`.
   * **Android's analogue is visitorId() itself**: pass it to Play Billing as
   * `obfuscatedAccountId` and the Play webhook resolves it the same way.
   * @returns {Promise<string|null>}
   */
  appAccountToken() {
    assertLinked();
    return RoasReactNative.appAccountToken();
  },

  /**
   * Every beacon delivery attempt, success or failure.
   *
   * An event rather than a promise because deliveries happen on the native side
   * long after any JS call returned — a queued beacon from a previous offline
   * launch is flushed during initialize(), and nothing in JS is waiting on it.
   *
   * Most apps do not need this. It exists because without it an app that
   * silently delivers nothing looks exactly like one with no traffic, and lost
   * beacons are lost touchpoints — which means credit assigned to the wrong
   * touch, or to none. Wire it to a debug banner in a QA build, or forward it to
   * your own crash reporting.
   *
   * A beacon that fails here is not necessarily lost — the native queue is
   * persisted and retries on a later launch.
   *
   *   const sub = Roas.onDeliveryResult(({ path, success, error }) => { ... });
   *   // later, e.g. in a useEffect cleanup:
   *   sub.remove();
   *
   * @param {(result: { path: string, success: boolean, error: string|null }) => void} listener
   * @returns {{ remove: () => void }} call remove() to unsubscribe — the native
   *   callback is torn down when the last listener goes away.
   */
  onDeliveryResult(listener) {
    assertLinked();
    return emitter().addListener(DELIVERY_EVENT, listener);
  },

  /**
   * The stable visitor id for this install (null before initialize() has
   * run). Pass this to RevenueCat as the `appUserID` so a purchase
   * attributes back to this install and its ad click.
   * @returns {Promise<string|null>}
   */
  visitorId() {
    assertLinked();
    return RoasReactNative.visitorId();
  },

  /**
   * Bind the user's identity. At least one of email/phone must be set for
   * this to send anything. Hashed on-device by the native SDK.
   * @param {{ email?: string, phone?: string, customerUserId?: string }} options
   */
  identify({ email, phone, customerUserId } = {}) {
    assertLinked();
    return RoasReactNative.identify({ email, phone, customerUserId });
  },

  /**
   * Record a funnel/behaviour event — never revenue (money only ever
   * enters through the signed RevenueCat/Stripe webhook).
   *
   * @param {string} event one of the RoasEvent constants, or any custom name
   * @param {Record<string, unknown>} [properties]
   */
  track(event, properties) {
    assertLinked();
    return RoasReactNative.track(event, properties);
  },

  /**
   * Forward a direct deep link (a link that opened the app while it was
   * already installed — an Android App Link or an iOS universal link) so
   * its `rsclid` attributes this open deterministically. A no-op if `url`
   * carries no `rsclid` query parameter. Not the install-referrer path
   * (that's automatic on first launch) — this is for a later open.
   * @param {string} url
   */
  handleDeepLink(url) {
    assertLinked();
    return RoasReactNative.handleDeepLink(url);
  },

  /**
   * Controls how much the native SDK writes to Logcat (Android) / the
   * console (iOS). Defaults to RoasLogLevel.ERROR on the native side.
   * @param {string} level one of the RoasLogLevel constants
   */
  setLogLevel(level) {
    assertLinked();
    return RoasReactNative.setLogLevel(level);
  },
};

export default Roas;
