const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Patches gradle-wrapper.properties to use Gradle 8.13.
// Gradle 9.0.0 bundles Kotlin 2.2.0 which is incompatible with
// @react-native/gradle-plugin compiled against Kotlin 2.0.0.
module.exports = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const wrapperPath = path.join(
        cfg.modRequest.platformProjectRoot,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties'
      );
      if (fs.existsSync(wrapperPath)) {
        let content = fs.readFileSync(wrapperPath, 'utf8');
        content = content.replace(
          /distributionUrl=.+/,
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip'
        );
        fs.writeFileSync(wrapperPath, content);
      }
      return cfg;
    },
  ]);
