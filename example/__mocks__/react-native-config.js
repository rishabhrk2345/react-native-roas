// react-native-config ships untranspiled ESM and reads BuildConfig through a
// native module, neither of which exists under jest. What App.tsx needs from
// it is three strings; an empty object exercises every `??` / `||` fallback.
module.exports = { Config: {}, default: {} };
