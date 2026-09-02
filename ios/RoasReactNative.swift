import Foundation
// Needed for RCTEventEmitter, which is used as a SUPERCLASS below and so must
// be a visible type — the promise block typealiases this file already used came
// in without an explicit import. `React-Core` defines the `React` module, but if
// a host app's Pods setup surfaces it under a different name this import is the
// first line to adjust.
import React
import RoasSensor

/// The iOS half of the `react-native-roas` bridge. Every method here is a
/// thin pass-through to `Roas` (`RoasSensor`'s public entry point, from
/// sdk-ios) — no retry/queueing/hashing logic is duplicated here; that all
/// still lives in the native SDK, exactly as it does for a pure-Swift app.
/// Mirrors `RoasReactModule.kt`'s Android half method-for-method, and the
/// module name (`RoasReactNative`) matches what `index.js` looks up on
/// `NativeModules` — the JS side needs no platform branching.
///
/// Subclasses `RCTEventEmitter` rather than `NSObject` because beacon delivery
/// results are pushed, not requested: a beacon queued on a previous offline
/// launch is flushed during `configure`, with nothing in JS awaiting it. The
/// base class supplies `addListener`/`removeListeners` (so, unlike the Android
/// module, they are not declared here) and the `startObserving`/`stopObserving`
/// pair used below to refcount the native callback. Keep the base class in
/// `RoasReactNative.m` in step — `RCT_EXTERN_MODULE` names it separately, and a
/// mismatch there compiles cleanly and fails at runtime.
@objc(RoasReactNative)
class RoasReactNative: RCTEventEmitter {

    // NOT `override`: RCTEventEmitter does not implement this — it is an
    // optional class method on the RCTBridgeModule protocol, which
    // RCTEventEmitter merely conforms to (see React/Modules/RCTEventEmitter.h).
    // Marking it `override` fails to compile with "does not override any method
    // from its superclass".
    @objc static func requiresMainQueueSetup() -> Bool { false }

    /// Must match the name `index.js` subscribes to and Android's
    /// `RoasReactModule.DELIVERY_EVENT`.
    private static let deliveryEvent = "RoasDeliveryResult"

    /// `Roas.setOnDeliveryResult` is a process-wide singleton, but RN can hold
    /// more than one instance of this module alive at once across a reload — the
    /// new bridge's module starts observing before the old one is deallocated.
    /// Routing the callback through this rather than capturing `self` means the
    /// event always reaches whichever module is currently observing, and the
    /// identity check in `stopObserving`/`deinit` stops a dying instance from
    /// tearing down the live one's callback.
    private static weak var observing: RoasReactNative?

    private var hasListeners = false

    override func supportedEvents() -> [String]! { [RoasReactNative.deliveryEvent] }

    override func startObserving() {
        hasListeners = true
        RoasReactNative.observing = self
        Roas.setOnDeliveryResult { path, success, error in
            // Transport delivers off the main queue. `sendEvent` is safe from any
            // thread, but the observing/hasListeners state read below is not, so
            // both are touched on one queue.
            DispatchQueue.main.async {
                guard let observer = RoasReactNative.observing, observer.hasListeners else { return }
                observer.sendEvent(
                    withName: RoasReactNative.deliveryEvent,
                    body: [
                        "path": path,
                        "success": success,
                        // NSNull, not `error as Any` — the latter boxes a nil
                        // Optional, which the bridge cannot serialize. NSNull
                        // crosses cleanly and arrives in JS as null.
                        "error": error ?? NSNull(),
                    ]
                )
            }
        }
    }

    override func stopObserving() {
        hasListeners = false
        releaseDeliveryCallback()
    }

    /// Bridge teardown (a reload, or the host going away). RN calls this without
    /// JS necessarily having unsubscribed first, so it is a second place the
    /// callback must be released. `NS_REQUIRES_SUPER` on the base declaration —
    /// hence the `super` call.
    override func invalidate() {
        hasListeners = false
        releaseDeliveryCallback()
        super.invalidate()
    }

    deinit {
        releaseDeliveryCallback()
    }

    /// Clear the SDK callback only if this instance is the one that installed
    /// it. On a reload the new bridge's module starts observing before the old
    /// one is invalidated, so an unconditional clear would tear down the
    /// callback the live module just installed and deliveries would go silent
    /// until the next subscribe.
    private func releaseDeliveryCallback() {
        guard RoasReactNative.observing === self else { return }
        Roas.setOnDeliveryResult(nil)
        RoasReactNative.observing = nil
    }

    @objc(initialize:resolver:rejecter:)
    func initialize(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let publicKey = options["publicKey"] as? String else {
            reject("MISSING_ARG", "publicKey is required", nil)
            return
        }
        let customerUserId = options["customerUserId"] as? String
        let appSecret = options["appSecret"] as? String
        // Defaults to true to match `Roas.configure`, so an app that never
        // passes the flag behaves exactly as it did before this option existed.
        let ask = options["requestTrackingAuthorization"] as? Bool ?? true
        if let baseUrl = options["baseUrl"] as? String {
            Roas.configure(
                publicKey: publicKey,
                customerUserId: customerUserId,
                requestTrackingAuthorization: ask,
                appSecret: appSecret,
                baseUrl: baseUrl
            )
        } else {
            Roas.configure(
                publicKey: publicKey,
                customerUserId: customerUserId,
                requestTrackingAuthorization: ask,
                appSecret: appSecret
            )
        }
        resolve(nil)
    }

    /// Show the ATT prompt now and bind the IDFA on a grant. Pair with
    /// `initialize({ requestTrackingAuthorization: false })`.
    ///
    /// Resolves only once ATT has answered, so JS can `await` the prompt and
    /// know the IDFA binding has been attempted before continuing. Safe to call
    /// more than once — once the user has answered, iOS returns the stored
    /// answer without re-prompting.
    @objc(requestTracking:rejecter:)
    func requestTracking(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        Roas.requestTrackingAuthorization { resolve(nil) }
    }

    /// Report a SKAdNetwork conversion value — the only post-install signal
    /// that reaches an ad network for a user who denied ATT, which is most of
    /// them.
    @objc(updateConversionValue:resolver:rejecter:)
    func updateConversionValue(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let value = options["value"] as? Int else {
            reject("MISSING_ARG", "value is required", nil)
            return
        }
        Roas.updateConversionValue(
            value,
            coarse: options["coarse"] as? String,
            lockWindow: options["lockWindow"] as? Bool ?? false
        )
        resolve(nil)
    }

    /// A UUID derived from the visitor id, to hand StoreKit as a purchase's
    /// `appAccountToken`. The App Store Server Notification carries it back and
    /// the backend reconstructs the vid from it — without which an App Store
    /// sale has no path to the ad click that drove it. Not needed on the
    /// RevenueCat path, which uses `visitorId()` as its `appUserID`.
    ///
    /// Null before `initialize`. Android answers null too (Play Billing takes
    /// the visitor id verbatim as `obfuscatedAccountId`), so the method exists
    /// on both platforms and JS needs no branching.
    @objc(appAccountToken:rejecter:)
    func appAccountToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(Roas.appAccountToken()?.uuidString)
    }

    @objc(visitorId:rejecter:)
    func visitorId(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(Roas.visitorId())
    }

    @objc(identify:resolver:rejecter:)
    func identify(
        _ options: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        Roas.identify(
            email: options["email"] as? String,
            phone: options["phone"] as? String,
            customerUserId: options["customerUserId"] as? String
        )
        resolve(nil)
    }

    @objc(track:properties:resolver:rejecter:)
    func track(
        _ event: String,
        properties: NSDictionary?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let props = properties as? [String: Any]
        // Anything not in the RoasEvent taxonomy is still tracked — as a
        // custom event named exactly what the caller passed, mirroring
        // Roas.track(RoasEvent.CUSTOM, name = "...") in the Android module
        // and Roas.track(.custom, name: "...") in the native iOS sample.
        if let known = RoasEvent(rawValue: event), known != .custom {
            Roas.track(known, properties: props)
        } else {
            Roas.track(.custom, name: event, properties: props)
        }
        resolve(nil)
    }

    @objc(handleDeepLink:resolver:rejecter:)
    func handleDeepLink(
        _ urlString: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let url = URL(string: urlString) else {
            reject("INVALID_ARG", "url is not a valid URL", nil)
            return
        }
        Roas.handleDeepLink(url)
        resolve(nil)
    }

    @objc(setLogLevel:resolver:rejecter:)
    func setLogLevel(
        _ levelName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let level: RoasLogLevel
        switch levelName {
        case "NONE": level = .none
        case "DEBUG": level = .debug
        default: level = .error
        }
        Roas.setLogLevel(level)
        resolve(nil)
    }
}
