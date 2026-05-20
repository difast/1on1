module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
    overrides: [
      {
        // @supabase dist files contain import(/* webpackIgnore */ '...') for lazy
        // OpenTelemetry loading. hermesc cannot compile dynamic import() at all,
        // so replace every import() call with Promise.resolve({}) here.
        test: /node_modules[\\/]@supabase[\\/]/,
        plugins: [
          function removeDynamicImports() {
            return {
              visitor: {
                CallExpression(nodePath) {
                  if (nodePath.node.callee.type === 'Import') {
                    nodePath.replaceWithSourceString('Promise.resolve({})');
                  }
                },
              },
            };
          },
        ],
      },
    ],
  };
};
