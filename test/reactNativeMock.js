/**
 * Stands in for `react-native` in the test environment.
 *
 * react-native is a peerDependency and is deliberately NOT installed here — a
 * bridge package should not carry a copy of the framework it plugs into, and
 * pulling one in just to run unit tests would mean the tests exercise whichever
 * RN version this package happened to install rather than the contract itself.
 * jest.config.js maps `react-native` to this file instead.
 *
 * Everything `index.js` imports is reproduced with the same shape: a
 * NativeModules registry and a NativeEventEmitter class. The emitter records
 * which native module it was constructed over and lets a test fire an event by
 * hand, which is the only way to exercise the delivery-stream path without a
 * device.
 */

function nativeModule() {
  return {
    initialize: jest.fn(() => Promise.resolve(null)),
    visitorId: jest.fn(() => Promise.resolve('rs-test-vid')),
    // Null is the honest default: this resolves null on Android always, and on
    // iOS until initialize() has run.
    appAccountToken: jest.fn(() => Promise.resolve(null)),
    identify: jest.fn(() => Promise.resolve(null)),
    track: jest.fn(() => Promise.resolve(null)),
    handleDeepLink: jest.fn(() => Promise.resolve(null)),
    setLogLevel: jest.fn(() => Promise.resolve(null)),
    requestTracking: jest.fn(() => Promise.resolve(null)),
    updateConversionValue: jest.fn(() => Promise.resolve(null)),
    // NativeEventEmitter calls these on the module; the real ones refcount the
    // native callback in RoasReactModule.kt.
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
}

const NativeModules = { RoasReactNative: nativeModule() };

/** Every emitter constructed this run, so a test can assert only one exists. */
const emitters = [];

class NativeEventEmitter {
  constructor(module) {
    this.module = module;
    this.subscriptions = [];
    emitters.push(this);
  }

  addListener(eventType, listener) {
    const entry = { eventType, listener, removed: false };
    this.subscriptions.push(entry);
    return {
      remove: () => {
        entry.removed = true;
      },
    };
  }

  /** Test-only: fire an event as the native side would. */
  __emit(eventType, payload) {
    this.subscriptions
      .filter(s => s.eventType === eventType && !s.removed)
      .forEach(s => s.listener(payload));
  }
}

/**
 * Test-only: forget every emitter constructed so far.
 *
 * Deliberately does NOT replace NativeModules.RoasReactNative. `index.js`
 * destructures it once at import time, so swapping the object here would leave
 * the module under test holding the previous one — every assertion would then
 * inspect a mock nothing had called, and pass or fail for the wrong reason.
 * Call records are cleared by jest's `clearMocks`, which keeps object identity.
 */
function __reset() {
  emitters.length = 0;
}

module.exports = {
  NativeModules,
  NativeEventEmitter,
  __emitters: emitters,
  __reset,
};
