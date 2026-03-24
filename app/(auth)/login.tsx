import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuthStore } from "../../stores/authStore";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setError("");

    const { error: signInError } = await signIn(email.trim(), password);

    setLoading(false);

    if (signInError) {
      setError(signInError.message || "Invalid email or password");
    } else {
      setEmail("");
      setPassword("");
    }
  };

  const handleSocialComingSoon = () => {
    Alert.alert("Coming Soon", "Social login will be available in a future update.");
  };

  return (
    <ImageBackground
      source={require("../../assets/images/partyBg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={[
          "rgba(25, 16, 34, 0.3)",
          "rgba(25, 16, 34, 0.6)",
          "rgba(25, 16, 34, 1)",
        ]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={["transparent", "rgba(25, 16, 34, 0.9)", "rgba(25, 16, 34, 1)"]}
        style={[StyleSheet.absoluteFillObject, { top: "25%" }]}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          <TouchableOpacity
            className="absolute top-12 left-6 z-10"
            onPress={() => router.back()}
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/20">
              <Text className="text-white text-xl">←</Text>
            </View>
          </TouchableOpacity>

          <View className="flex-1 justify-end px-6 pb-8 pt-24">
            {/* Title Section */}
            <View className="my-8">
              <Text className="text-white text-left tracking-tight text-[35px] font-extrabold leading-tight mb-3">
                Welcome Back To{"\n"}
                <Text className="text-purple-500">TheScene</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Log in to discover tonight's parties
              </Text>
            </View>

            {/* Error Message */}
            {error ? (
              <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                <Text className="text-red-300 text-sm font-medium">{error}</Text>
              </View>
            ) : null}

            {/* Input Fields */}
            <View className="gap-4 mb-4">
              {/* Email Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">Email</Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 text-white text-base"
                  placeholder="your@email.com"
                  placeholderTextColor="#888"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">Password</Text>
                <View className="relative">
                  <TextInput
                    className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 pr-14 text-white text-base"
                    placeholder="Enter your password"
                    placeholderTextColor="#888"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-0 bottom-0 justify-center"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color="#888"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity
              className="items-end mb-6"
              onPress={() => router.push("/(auth)/forgot-password")}
            >
              <Text className="text-purple-400 text-sm font-medium">Forgot Password?</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              className="items-center justify-center rounded-xl h-14 px-5 bg-purple-600 mb-6"
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-lg font-bold">Log In</Text>
              )}
            </TouchableOpacity>

            {/* Sign Up Link */}
            <View className="items-center mb-4">
              <Text className="text-gray-400 text-sm">
                Don't have an account?{" "}
                <Text
                  className="text-white font-semibold underline"
                  onPress={() => router.push("/(auth)/signup")}
                >
                  Sign Up
                </Text>
              </Text>
            </View>

            {/* Divider */}
            <View className="flex-row items-center w-full py-6">
              <View className="flex-1 h-[1px] bg-white/10" />
              <Text className="mx-4 text-gray-500 text-sm font-medium">Or continue with</Text>
              <View className="flex-1 h-[1px] bg-white/10" />
            </View>

            {/* Social Login Buttons — Coming Soon */}
            <View className="w-full gap-3 mb-6">
              <TouchableOpacity
                className="py-4 flex flex-row justify-center items-center rounded-xl bg-white/5 border border-white/10 px-5 opacity-60"
                activeOpacity={0.6}
                onPress={handleSocialComingSoon}
              >
                <FontAwesome name="google" size={24} color="white" />
                <Text className="text-white text-base font-bold ml-2">Continue with Google</Text>
                <View className="ml-auto bg-white/10 px-2 py-0.5 rounded-full">
                  <Text className="text-gray-500 text-xs font-medium">Soon</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center justify-center rounded-xl bg-white/5 border border-white/10 py-4 px-5 opacity-60"
                activeOpacity={0.6}
                onPress={handleSocialComingSoon}
              >
                <FontAwesome name="apple" size={24} color="#aaa" />
                <Text className="text-white text-base font-bold ml-2">Continue with Apple</Text>
                <View className="ml-auto bg-white/10 px-2 py-0.5 rounded-full">
                  <Text className="text-gray-500 text-xs font-medium">Soon</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View className="items-center">
              <Text className="text-gray-500 text-xs text-center px-4">
                By continuing, you agree to our{" "}
                <Text
                  className="text-gray-300 underline"
                  onPress={() =>
                    Alert.alert("Terms of Service", "Please visit thescene.app/terms to read our Terms of Service.")
                  }
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  className="text-gray-300 underline"
                  onPress={() =>
                    Alert.alert("Privacy Policy", "Please visit thescene.app/privacy to read our Privacy Policy.")
                  }
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  scrollContent: { flexGrow: 1, minHeight: "100%" },
  primaryButton: {
    shadowColor: "#8c25f4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
});
