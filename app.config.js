const IS_DEV = process.env.APP_VARIANT === "development";

// Custom config plugin that fixes 'folly/coro/Coroutine.h' file not found
// on Xcode 26 builds. We inject FOLLY_CFG_NO_COROUTINES=1 into the existing
// post_install block (before the final 'end') so CocoaPods doesn't complain
// about multiple post_install hooks.
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
      if (!fs.existsSync(podfilePath)) return modConfig;

      let podfile = fs.readFileSync(podfilePath, "utf8");
      console.log(`[withFollyCoroutinesFix] Read Podfile (length: ${podfile.length})`);

      if (podfile.includes("FOLLY_CFG_NO_COROUTINES")) {
        console.log("[withFollyCoroutinesFix] SKIP: FOLLY_CFG_NO_COROUTINES already present.");
        return modConfig;
      }

      // CocoaPods only allows ONE post_install block.
      // We inject our fix right before the final 'end' that closes the
      // existing post_install block. This is the last 'end' on its own line.
      const follySnippet = [
        "",
        "  # Fix: 'folly/coro/Coroutine.h' file not found on Xcode 26",
        "  installer.pods_project.targets.each do |target|",
        "    target.build_configurations.each do |config|",
        "      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']",
        "      unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FOLLY_CFG_NO_COROUTINES=1')",
        "        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FOLLY_CFG_NO_COROUTINES=1'",
        "      end",
        "    end",
        "  end",
      ].join("\n");

      // Find the last 'end' on its own line (closing post_install block)
      const lastEndIndex = podfile.lastIndexOf("\nend");
      if (lastEndIndex === -1) {
        console.log("[withFollyCoroutinesFix] WARNING: Could not find closing 'end' in Podfile.");
        return modConfig;
      }

      // Insert our snippet right before the final 'end'
      const updated = podfile.slice(0, lastEndIndex) + follySnippet + podfile.slice(lastEndIndex);
      fs.writeFileSync(podfilePath, updated);
      console.log("[withFollyCoroutinesFix] SUCCESS: Injected FOLLY_CFG_NO_COROUTINES fix before final 'end'.");
      return modConfig;
    },
  ]);
};

module.exports = ({ config }) => {
  const appConfig = {
    ...config,
    name: IS_DEV ? "TheScene (Dev)" : "TheScene",
    slug: "TheScene",
    version: "1.0.16",
    orientation: "portrait",
    icon: "./assets/images/thescene-logo.png",
    scheme: "thescene",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? "com.vindi.thescene.dev"
        : "com.vindi.thescene",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription:
          "TheScene needs access to your photo library so you can choose a profile picture or share photos and videos from parties you attend.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/thescene-logo.png",
        backgroundColor: "#000000",
      },
      package: IS_DEV ? "com.vindi.thescene.dev" : "com.vindi.thescene",
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
      ],
    },
    web: {
      favicon: "./assets/images/thescene-logo.png",
      output: "static",
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/images/thescene-logo.png",
          color: "#a855f7",
          sounds: [],
          androidMode: "default",
        },
      ],
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/thescene-logo.png",
          imageWidth: 300,
          resizeMode: "contain",
          backgroundColor: "#000000",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            newArchEnabled: false,
          },
          android: {
            newArchEnabled: false,
          },
        },
      ],
      "@react-native-community/datetimepicker",
      "expo-video",
      "expo-localization",
      "expo-location",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
      newArchEnabled: false,
    },
    extra: {
      router: {},
      eas: {
        projectId: "dfe8d96d-aa66-4f9e-a71d-1460d3ddafa1",
      },
    },
    updates: {
      url: "https://u.expo.dev/dfe8d96d-aa66-4f9e-a71d-1460d3ddafa1",
    },
    runtimeVersion: {
      policy: "fingerprint",
    },
  };

  return withFollyCoroutinesFix({ expo: appConfig });
};
