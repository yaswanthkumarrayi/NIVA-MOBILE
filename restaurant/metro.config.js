// Metro config for NIVA Restaurant
// Adds the shared package (../shared) to Metro's watched folders so
// the @niva/shared alias (resolved by babel-plugin-module-resolver) works.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '..', 'shared');

const config = getDefaultConfig(projectRoot);

// Fixed port so restaurant and partner Metro servers can run in parallel.
// Restaurant = 8081, Partner = 8082
config.server = { port: 8081 };

// Watch the shared folder for changes
config.watchFolders = [sharedRoot];

// Let Metro resolve modules from both the app and shared node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(sharedRoot, 'node_modules'),
];

// Ensure the shared package's own deps resolve to the app's node_modules
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (target, name) => path.resolve(projectRoot, 'node_modules', name),
  }
);

module.exports = config;
