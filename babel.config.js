// index.js ships ESM (import/export) because that is what a React Native app's
// bundler expects. Jest runs on Node's CommonJS require, so the test run needs
// this transform; nothing in the published package does.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
