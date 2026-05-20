const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js pulls in @opentelemetry packages that use
// dynamic import() expressions which Hermes cannot compile.
// Stub them out with empty modules for React Native builds.
const OTEL_STUB = path.resolve(__dirname, 'plugins/otelStub.js');

config.resolver = config.resolver || {};
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@opentelemetry/')) {
    return { type: 'sourceFile', filePath: OTEL_STUB };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
