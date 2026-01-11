module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      "babel-preset-expo",
      "nativewind/babel", // NativeWind preset
    ],
    plugins: [
      "react-native-reanimated/plugin", // Must be last
    ],
  };
};
