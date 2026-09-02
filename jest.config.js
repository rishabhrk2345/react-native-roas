/**
 * react-native is a peerDependency and is not installed here, so the usual
 * `preset: 'react-native'` cannot resolve. Mapping the import to a local mock
 * keeps this package free of a framework copy it does not need, and keeps the
 * tests about THIS bridge's contract rather than about whichever RN version an
 * install happened to pin.
 */
module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^react-native$': '<rootDir>/test/reactNativeMock.js',
  },
  // Clears call records between tests while preserving object identity —
  // index.js destructures the native module once at import, so the object it
  // holds must stay the same one the assertions inspect.
  clearMocks: true,
  testMatch: ['<rootDir>/test/**/*.test.js'],
};
