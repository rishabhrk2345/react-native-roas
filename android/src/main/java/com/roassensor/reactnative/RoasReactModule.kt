package com.roassensor.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.roassensor.sdk.Roas
import com.roassensor.sdk.RoasEvent
import com.roassensor.sdk.RoasLogLevel
import java.util.concurrent.atomic.AtomicInteger

/**
 * The Android half of the `react-native-roas` bridge. Every method here is a
 * thin pass-through to [Roas] (`roas-android-sdk`'s public entry point) — no
 * retry/queueing/hashing logic is duplicated here; that all still lives in
 * the native SDK, exactly as it does for a pure-Kotlin app.
 *
 * Named-argument maps (`ReadableMap`) are used instead of positional
 * parameters for `initialize`/`identify` so the JS-visible shape can grow
 * without breaking the native method's arity.
 */
class RoasReactModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "RoasReactNative"

    /**
     * How many JS listeners `NativeEventEmitter` currently has on
     * [DELIVERY_EVENT]. The native callback is a process-wide singleton, so it
     * is installed on the first listener and cleared on the last — leaving it
     * installed would keep emitting into a torn-down ReactContext after a
     * reload, which is a crash rather than a leak.
     */
    private val deliveryListeners = AtomicInteger(0)

    /**
     * Required by `NativeEventEmitter` on Android (RN 0.65+ warns loudly
     * without them) and used here for real, to refcount the native callback.
     * `NativeEventEmitter` calls these once per `addListener` / per removal.
     */
    @ReactMethod
    fun addListener(eventName: String) {
        if (eventName != DELIVERY_EVENT) return
        if (deliveryListeners.getAndIncrement() == 0) {
            observing = this
            Roas.setOnDeliveryResult { path, success, error ->
                // Routed through `observing` rather than capturing `this`, so a
                // reload's new module receives deliveries even before the old
                // one is collected — see the field's own note.
                //
                // Transport delivers on its own executor. Unlike a Flutter
                // EventChannel — which must be touched from the main thread or
                // it crashes — RCTDeviceEventEmitter.emit() enqueues onto the JS
                // call queue and is safe from any thread, so no hop is needed.
                observing?.emitDelivery(path, success, error)
            }
        }
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        if (deliveryListeners.addAndGet(-count) <= 0) {
            deliveryListeners.set(0)
            releaseDeliveryCallback()
        }
    }

    /**
     * Bridge teardown (reload, or the host activity going away). Clearing here
     * as well as in [removeListeners] matters because a reload destroys the
     * ReactContext without JS getting to unsubscribe first.
     */
    override fun invalidate() {
        deliveryListeners.set(0)
        releaseDeliveryCallback()
        super.invalidate()
    }

    /**
     * Clear the SDK callback only if this instance is the one that installed it.
     * On a reload the new bridge's module starts observing before the old one is
     * invalidated, so an unconditional clear here would tear down the callback
     * the live module just installed and deliveries would go silent until the
     * next subscribe.
     */
    private fun releaseDeliveryCallback() {
        if (observing !== this) return
        Roas.setOnDeliveryResult(null)
        observing = null
    }

    private fun emitDelivery(path: String, success: Boolean, error: String?) {
        val context = reactApplicationContext
        // The context can be mid-teardown between the SDK's callback firing and
        // this running; emitting then throws rather than no-ops.
        if (!context.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply {
            putString("path", path)
            putBoolean("success", success)
            if (error == null) putNull("error") else putString("error", error)
        }
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(DELIVERY_EVENT, payload)
    }

    @ReactMethod
    fun initialize(options: ReadableMap, promise: Promise) {
        val publicKey = options.getStringOrNull("publicKey")
        if (publicKey == null) {
            promise.reject("MISSING_ARG", "publicKey is required")
            return
        }
        val customerUserId = options.getStringOrNull("customerUserId")
        val baseUrl = options.getStringOrNull("baseUrl")
        val appSecret = options.getStringOrNull("appSecret")
        // options may also carry `requestTrackingAuthorization`, which is read
        // only by the iOS half — ATT does not exist here. Deliberately ignored
        // rather than rejected, so one JS call site works on both platforms.

        // NAMED arguments, not positional. These used to be positional, which
        // meant a new parameter added anywhere but the end of Roas.initialize()
        // silently rebound every one of them by a slot — and still compiled,
        // because the types line up. `appSecret` is exactly that parameter, and
        // it landed while this bridge was pinned to 0.1.1, so the break was
        // waiting on the version bump above. Named arguments make that class of
        // break a compile error instead of beacons signed with a user id.
        if (baseUrl != null) {
            Roas.initialize(
                context = reactApplicationContext,
                publicKey = publicKey,
                customerUserId = customerUserId,
                baseUrl = baseUrl,
                appSecret = appSecret,
            )
        } else {
            Roas.initialize(
                context = reactApplicationContext,
                publicKey = publicKey,
                customerUserId = customerUserId,
                appSecret = appSecret,
            )
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun visitorId(promise: Promise) {
        promise.resolve(Roas.visitorId())
    }

    /**
     * iOS-only concept: StoreKit's `appAccountToken` must be a UUID, so the iOS
     * SDK derives one from the vid. Play Billing has no such constraint — its
     * `obfuscatedAccountId` takes the visitor id verbatim — so Android answers
     * null and callers use `visitorId()` here.
     *
     * Implemented as an explicit null rather than simply not existing, so
     * `index.js` needs no platform branching: an absent @ReactMethod surfaces as
     * "is not a function" on a perfectly valid call. Same reason the two below
     * resolve rather than reject.
     */
    @ReactMethod
    fun appAccountToken(promise: Promise) {
        promise.resolve(null)
    }

    /**
     * Both iOS-only. ATT and SKAdNetwork have no Android equivalent — Android's
     * consent story is the `AD_ID` permission, which is a manifest concern
     * rather than a runtime one.
     */
    @ReactMethod
    fun requestTracking(promise: Promise) {
        promise.resolve(null)
    }

    // `options` is unread on purpose — the arity has to match what index.js
    // sends so the same JS call compiles and runs on both platforms.
    @Suppress("UNUSED_PARAMETER")
    @ReactMethod
    fun updateConversionValue(options: ReadableMap, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun identify(options: ReadableMap, promise: Promise) {
        Roas.identify(
            email = options.getStringOrNull("email"),
            phone = options.getStringOrNull("phone"),
            customerUserId = options.getStringOrNull("customerUserId"),
        )
        promise.resolve(null)
    }

    @ReactMethod
    fun track(event: String, properties: ReadableMap?, promise: Promise) {
        // Anything not in the RoasEvent taxonomy is still tracked — as a custom
        // event named exactly what the caller passed, mirroring
        // Roas.track(RoasEvent.CUSTOM, name = "...") in the native sample.
        val known = RoasEvent.values().find { it.key == event }
        // ReadableMap.toHashMap() is Java-typed HashMap<String, Object>, which
        // Kotlin sees as a platform type with unknown value-nullability — it
        // won't satisfy Roas.track's `Map<String, Any>?` on its own. In
        // practice a JS properties object never carries JS `null` values that
        // survive the bridge as Kotlin null here (RN drops them), so the
        // unchecked cast is safe.
        @Suppress("UNCHECKED_CAST")
        val props = properties?.toHashMap() as Map<String, Any>?
        if (known != null) {
            Roas.track(known, properties = props)
        } else {
            Roas.track(RoasEvent.CUSTOM, name = event, properties = props)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun handleDeepLink(url: String, promise: Promise) {
        Roas.handleDeepLink(url)
        promise.resolve(null)
    }

    @ReactMethod
    fun setLogLevel(level: String, promise: Promise) {
        Roas.setLogLevel(runCatching { RoasLogLevel.valueOf(level) }.getOrDefault(RoasLogLevel.ERROR))
        promise.resolve(null)
    }

    private fun ReadableMap.getStringOrNull(key: String): String? =
        if (hasKey(key) && !isNull(key)) getString(key) else null

    companion object {
        /**
         * Must match the name `index.js` subscribes to. Deliveries are pushed,
         * not requested — a beacon queued on a previous offline launch is
         * flushed during initialize(), with nothing in JS awaiting it — so they
         * need an event, not a promise.
         */
        const val DELIVERY_EVENT = "RoasDeliveryResult"

        /**
         * Which module instance currently owns `Roas.setOnDeliveryResult`.
         *
         * The SDK callback is a process-wide singleton, but RN can hold more
         * than one instance of this module alive at once across a reload — the
         * new bridge's module starts observing before the old one is
         * invalidated. Volatile because it is written from the JS thread and
         * read from the transport's executor.
         */
        @Volatile
        private var observing: RoasReactModule? = null
    }
}
