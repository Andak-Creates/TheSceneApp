const IS_DEV = process.env.APP_VARIANT === "development";

// Custom config plugin that fixes 'folly/coro/Coroutine.h' file not found
// on iOS builds by injecting FOLLY_CFG_NO_COROUTINES=1 into the Podfile.
// expo-build-properties does not support this flag directly, so we use withDangerousMod.
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
      console.log(`[withFollyCoroutinesFix] Contains FOLLY_CFG_NO_COROUTINES: ${podfile.includes("FOLLY_CFG_NO_COROUTINES")}`);
      console.log(`[withFollyCoroutinesFix] Contains 'post_install do |installer|': ${podfile.includes("post_install do |installer|")}`);
      console.log(`[withFollyCoroutinesFix] Contains 'react_native_post_install': ${podfile.includes("react_native_post_install")}`);
      
      if (!podfile.includes("FOLLY_CFG_NO_COROUTINES")) {
        const follyFix = `\n  # Fix: 'folly/coro/Coroutine.h' file not found\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |config|\n      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']\n      unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FOLLY_CFG_NO_COROUTINES=1')\n        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FOLLY_CFG_NO_COROUTINES=1'\n      end\n    end\n  end\n`;
        const updated = podfile.replace(
          /(react_native_post_install\s*\([\s\S]*?\))/,
          `$1${follyFix}`
        );
        if (updated === podfile) {
          console.log("[withFollyCoroutinesFix] WARNING: Replace pattern did NOT match!");
        } else {
          console.log("[withFollyCoroutinesFix] SUCCESS: Replaced post_install block.");
        }
        fs.writeFileSync(podfilePath, updated);
      }
      return modConfig;
    },
  ]);
};

module.exports = ({ config }) => {
  const appConfig = {
    ...config,
    name: IS_DEV ? "TheScene (Dev)" : "TheScene",
    slug: "TheScene",
    version: "1.0.12",
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
      "@react-native-community/datetimepicker",
      "expo-video",
      "expo-localization",
      "expo-location",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
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
