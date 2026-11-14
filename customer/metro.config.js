// Metro config for NIVA Customer
// Adds the shared package (../shared) to Metro's watched folders so the
// @niva/shared alias (resolved by babel-plugin-module-resolver) works, and
// lets bare imports inside shared resolve against the customer app's
// node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared package so edits there trigger a reload.
config.watchFolders = [sharedRoot];

// Let Metro resolve modules imported from the shared sources (react-native,
// @supabase/supabase-js, expo-secure-store, ...) against the customer app's
// own node_modules. These are *fallback search roots* — unlike an
// `extraNodeModules` Proxy, they do NOT hijack relative/virtual specifiers
// such as expo-router's `./.expo/.virtual-metro-entry`, which the blanket
// Proxy (copied from the partner app on expo-router 5.0) broke under
// expo-router 5.1.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sharedRoot, 'node_modules'),
];

module.exports = config;
