import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ImageBackground
      source={require("../../assets/images/partyBg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Gradient Overlay */}
      <LinearGradient
        colors={[
          "rgba(0, 0, 0, 0.1)", // top - subtle dark
          "rgba(25, 16, 34, 0.4)", // middle
          "rgba(25, 16, 34, 1)", // bottom - solid dark
        ]}
        locations={[0, 0.6, 0.95]}
        style={StyleSheet.absoluteFillObject}
      />

      <View className="flex-1 items-start justify-end px-6 pb-20 bg-[black]/30">
        <View className="mb-6 flex flex-row flex-wrap gap-3">
          <View className="bg-white/10 flex h-8 shrink-0 w-fit items-center justify-center gap-x-2 rounded-full px-4 border border-white/5">
            <Text className="text-white text-xs font-bold leading-normal tracking-wide uppercase">
              🔥 Trending now
            </Text>
          </View>

          <View className="bg-white/10 flex h-8 shrink-0 w-fit items-center justify-center gap-x-2 rounded-full px-4 border border-white/5">
            <Text className="text-white text-xs font-bold leading-normal tracking-wide uppercase">
              📌 500+ events near you
            </Text>
          </View>
        </View>

        <Text className="text-[40px] font-bold text-white">Where them</Text>
        <Text className="text-purple-500 text-4xl font-bold mb-2">
          PartiesAt?
        </Text>
        <Text className="text-[#aaa] text-sm text-left mb-12">
          Discover the hottest parties, connect with friends, buy tickets
          instantly and never miss a vibe,
        </Text>

        <TouchableOpacity
          className="w-full bg-purple-600 py-4 rounded-full mb-4"
          onPress={() => router.push("/(auth)/signup")}
        >
          <Text className="text-white text-center font-semibold text-lg">
            Get Started
          </Text>
        </TouchableOpacity>

        <View className="flex items-center justify-center w-full">
          <Text className="text-[#aaa] text-center">
            already have an account?{" "}
            <Text
              className="text-white font-semibold underline"
              onPress={() => router.push("/(auth)/login")}
            >
              Log In
            </Text>
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
});
