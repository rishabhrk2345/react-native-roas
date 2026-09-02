export declare const RoasEvent: {
  readonly VIEW_CONTENT: 'view_content';
  readonly ADD_TO_CART: 'add_to_cart';
  readonly ADD_TO_WISHLIST: 'add_to_wishlist';
  readonly BEGIN_CHECKOUT: 'begin_checkout';
  readonly SEARCH: 'search';
  readonly LEAD: 'lead';
  readonly SIGN_UP: 'sign_up';
  readonly LOGIN: 'login';
  readonly START_TRIAL: 'start_trial';
  readonly SUBSCRIBE: 'subscribe';
  readonly LEVEL_START: 'level_start';
  readonly LEVEL_COMPLETE: 'level_complete';
  readonly TUTORIAL_COMPLETE: 'tutorial_complete';
  readonly SHARE: 'share';
};

export interface RoasInitializeOptions {
  publicKey: string;
  customerUserId?: string;
  baseUrl?: string;
  /**
   * This property's beacon signing secret (Setup → your app → Beacon signing).
   * Without it beacons go unsigned, which the collector accepts until "require
   * signed beacons" is on — but an app that can never sign also never lets the
   * observed signed share reach 100%, and that share is the gate on enabling
   * enforcement. Not a revenue credential; keep it out of source control.
   */
  appSecret?: string;
  /**
   * **iOS only** — show the App Tracking Transparency prompt on first launch.
   * Ignored on Android, which has no ATT.
   *
   * Defaults to true, and the prompt then appears ~0.6s after initialize() — a
   * cold-start system alert, before the user has seen anything worth trusting
   * the app with, which is the classic way to depress opt-in. Every denial costs
   * the IDFA, the strongest identity key an iOS install can carry. Pass false and
   * call `Roas.requestTracking()` after a priming screen; the SDK binds the IDFA
   * at that point either way, so deferring costs nothing.
   */
  requestTrackingAuthorization?: boolean;
}

export interface RoasIdentifyOptions {
  email?: string;
  phone?: string;
  customerUserId?: string;
}

export interface RoasConversionValueOptions {
  /**
   * `'low'` | `'medium'` | `'high'`. Send it: below Apple's install-volume
   * privacy threshold the fine value is withheld entirely and coarse is all that
   * survives the postback, so fine-only reporting goes dark on exactly the small
   * campaigns that most need measuring.
   */
  coarse?: 'low' | 'medium' | 'high';
  /** Post immediately and discard every later conversion. Only when final. */
  lockWindow?: boolean;
}

/** One beacon delivery attempt, from `Roas.onDeliveryResult`. */
export interface RoasDeliveryResult {
  /** The endpoint, e.g. `/api/tracking/mobile/first-open`. */
  path: string;
  success: boolean;
  /**
   * Null on success. A beacon that fails here is not necessarily lost — the
   * native queue is persisted and retries on a later launch.
   */
  error: string | null;
}

/** What `Roas.onDeliveryResult` returns; call `remove()` to unsubscribe. */
export interface RoasSubscription {
  remove(): void;
}

export declare const RoasLogLevel: {
  readonly NONE: 'NONE';
  readonly ERROR: 'ERROR';
  readonly DEBUG: 'DEBUG';
};

/**
 * The values `setLogLevel` accepts.
 *
 * Named as a union rather than leaving the parameter `string`, so a typo is a
 * compile error instead of a silent downgrade: `RoasLogLevel.valueOf()` on the
 * Kotlin side and the `switch` in `RoasReactNative.swift` both fall back to
 * ERROR on anything they do not recognise, so `setLogLevel('debug')` — wrong
 * case — would quietly leave logging at ERROR while reading as if it had
 * enabled DEBUG. `roas_flutter` gets this for free from a Dart enum; this is
 * the TypeScript equivalent.
 */
export type RoasLogLevelValue = 'NONE' | 'ERROR' | 'DEBUG';

/**
 * Property keys ROASSensor understands in `track()`, mirroring native
 * `RoasProps.kt`. `PRODUCT_ID` must be the same identifier the purchase will
 * arrive with, or the funnel cannot line the two up; `PRODUCT_NAME` is display
 * only and must never be the join key. `PRICE` is minor units and is reporting
 * colour only — revenue enters solely through the signed webhook.
 */
export declare const RoasProps: {
  readonly PRODUCT_ID: 'product_id';
  readonly PRODUCT_NAME: 'product_name';
  readonly CATEGORY: 'category';
  readonly QUANTITY: 'quantity';
  readonly PRICE: 'price';
  readonly CURRENCY: 'currency';
  readonly QUERY: 'query';
  readonly SOURCE: 'source';
};

export declare const Roas: {
  initialize(options: RoasInitializeOptions): Promise<void>;
  visitorId(): Promise<string | null>;
  identify(options: RoasIdentifyOptions): Promise<void>;
  track(event: string, properties?: Record<string, unknown>): Promise<void>;
  handleDeepLink(url: string): Promise<void>;
  setLogLevel(level: RoasLogLevelValue): Promise<void>;
  /** **iOS only** (a no-op on Android). Resolves once the user has answered. */
  requestTracking(): Promise<void>;
  /** **iOS only** (a no-op on Android). `value` is the fine value, 0–63. */
  updateConversionValue(
    value: number,
    options?: RoasConversionValueOptions
  ): Promise<void>;
  /**
   * **iOS only** — StoreKit's `appAccountToken` for a purchase. Resolves null on
   * Android, where the analogue is `visitorId()` passed to Play Billing as
   * `obfuscatedAccountId`.
   */
  appAccountToken(): Promise<string | null>;
  onDeliveryResult(
    listener: (result: RoasDeliveryResult) => void
  ): RoasSubscription;
};

export default Roas;
