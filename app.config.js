const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    name: IS_DEV ? "TheScene (Dev)" : "TheScene",
    slug: "TheScene",
    version: "1.0.13",
    orientation: "portrait",
    icon: "./assets/images/thescene-logo.png",
    scheme: "thescene",
    userInterfaceStyle: "automatic",
    newArchEnabled: false,
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
        projectId: "1a11e3b7-a90c-4fe3-9a4a-9c73ae26aa22",
      },
    },
    updates: {
      url: "https://u.expo.dev/1a11e3b7-a90c-4fe3-9a4a-9c73ae26aa22",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  },
};
