// Metro config for NIVA Partner
// Adds the shared package (../shared) to Metro's watched folders so
// the @niva/shared alias (resolved by babel-plugin-module-resolver) works.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

// Fixed port so restaurant and partner Metro servers can run in parallel.
// Restaurant = 8081, Partner = 8082
config.server = { port: 8082 };

config.watchFolders = [sharedRoot];

// IMPORTANT: partner/node_modules MUST be first so that packages like
// @supabase/realtime-js, react-native, etc. always resolve from the
// partner app's installed versions — never from shared/node_modules.
// If shared/node_modules existed with a different version of realtime-js,
// Metro would resolve from there and produce a broken bundle
// (missing ./phoenix/presenceAdapter).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),   // 1st — always wins
  path.resolve(sharedRoot, 'node_modules'),    // 2nd — fallback only
];

config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (target, name) => path.resolve(projectRoot, 'node_modules', name),
  }
);

module.exports = config;
