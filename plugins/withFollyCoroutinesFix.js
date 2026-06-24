/**
 * Custom Expo config plugin to fix the 'folly/coro/Coroutine.h' file not found
 * error in the iOS native build. This is caused by certain native modules that
 * pull in C++ coroutine support (folly::coro) which is not compatible with all
 * Xcode/clang configurations. The fix adds -DFOLLY_CFG_NO_COROUTINES=1 to the
 * GCC_PREPROCESSOR_DEFINITIONS for all iOS pods targets.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withFollyCoroutinesFix = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile"
      );

      let podfile = fs.readFileSync(podfilePath, "utf8");

      const follyFix = `
  # Fix: 'folly/coro/Coroutine.h' file not found
  # Some native modules pull in folly::coro which requires C++20 coroutine support
  # that is not always available. This disables it globally.
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
      unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FOLLY_CFG_NO_COROUTINES=1')
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FOLLY_CFG_NO_COROUTINES=1'
      end
    end
  end
`;

      // Only inject if not already present
      if (!podfile.includes("FOLLY_CFG_NO_COROUTINES")) {
        // Find the post_install block and append inside it
        podfile = podfile.replace(
          /^(  react_native_post_install\(installer.*?\))/m,
          `$1${follyFix}`
        );
        fs.writeFileSync(podfilePath, podfile);
        console.log(
          "[withFollyCoroutinesFix] Injected FOLLY_CFG_NO_COROUTINES=1 into Podfile"
        );
      } else {
        console.log(
          "[withFollyCoroutinesFix] FOLLY_CFG_NO_COROUTINES=1 already present in Podfile"
        );
      }

      return modConfig;
    },
  ]);
};

module.exports = withFollyCoroutinesFix;
