const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * react-native-roas is a `file:..` dependency (this example lives inside the
 * package it demonstrates, mirroring roas_flutter/example), so
 * node_modules/react-native-roas is a symlink to a sibling folder outside
 * this project root — not an ancestor/descendant of it. Metro's hierarchical
 * node_modules lookup walks UP from the requesting file, so from inside the
 * linked package it can never reach this app's node_modules (siblings
 * aren't on that path). That's why `react-native-roas/index.js`'s own
 * `import {NativeModules} from 'react-native'` failed to resolve even
 * though this app clearly has react-native installed — extraNodeModules
 * pins the shared peer deps explicitly instead of relying on tree walking.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [path.resolve(__dirname, '..')],
  resolver: {
    unstable_enableSymlinks: true,
    extraNodeModules: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-native': path.resolve(__dirname, 'node_modules/react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
