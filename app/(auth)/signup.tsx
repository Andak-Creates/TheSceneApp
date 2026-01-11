import { FontAwesome } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuthStore();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async () => {
    // Validation
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (confirmPassword !== password) {
      setError("Your pass words do not match");
      return;
    }

    setLoading(true);
    setError("");

    const { error: signUpError } = await signUp(email, password, username);

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message || "Failed to sign up");
    } else {
      // Navigate to onboarding
      router.replace("/(auth)/onboarding");
    }
  };

  return (
    <ImageBackground
      source={require("../../assets/images/partyBg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Gradient Overlays */}
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

          {/* Content Area */}
          <View className="flex-1 justify-end px-6 pb-8 pt-24">
            {/* Title Section */}
            <View className="mb-8">
              <Text className="text-white text-left tracking-tight text-[40px] font-extrabold leading-tight mb-3">
                Create Your{"\n"}
                <Text className="text-purple-500">Account</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Join the party and never miss a vibe!
              </Text>
            </View>

            {/* Error Message */}
            {error ? (
              <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                <Text className="text-red-300 text-sm font-medium">
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Input Fields */}
            <View className="gap-4 mb-6">
              {/* Username Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">
                  Username
                </Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 text-white text-base"
                  placeholder="Choose a username"
                  placeholderTextColor="#888"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Email Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">
                  Email
                </Text>
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
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">
                  Password
                </Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 text-white text-base"
                  placeholder="Create a password"
                  placeholderTextColor="#888"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Confirm Password Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">
                  Confirm Password
                </Text>
                <TextInput
                  className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 text-white text-base"
                  placeholder="Confirm your password"
                  placeholderTextColor="#888"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity
              className="items-center justify-center rounded-xl h-14 px-5 bg-purple-600 mb-6"
              style={styles.primaryButton}
              activeOpacity={0.9}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white text-lg font-bold">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            {/* Log In Link */}
            <View className="items-center mb-4">
              <Text className="text-gray-400 text-sm">
                Already have an account?{" "}
                <Text
                  className="text-white font-semibold underline"
                  onPress={() => router.push("/(auth)/login")}
                >
                  Log In
                </Text>
              </Text>
            </View>

            {/* Divider */}
            <View className="flex-row items-center w-full py-6">
              <View className="flex-1 h-[1px] bg-white/10" />
              <Text className="mx-4 text-gray-500 text-sm font-medium">
                Or sign up with
              </Text>
              <View className="flex-1 h-[1px] bg-white/10" />
            </View>

            {/* Social Login Buttons */}
            <View className="w-full gap-3 mb-6">
              {/* Google Button */}
              <TouchableOpacity
                className="py-4 flex flex-row justify-center items-start rounded-xl bg-white/10 border border-white/10 px-5"
                activeOpacity={0.8}
              >
                <FontAwesome name="google" size={24} color="white" />
                <Text className="text-white text-base font-bold ml-2">
                  Continue with Google
                </Text>
              </TouchableOpacity>

              {/* Apple Button */}
              <TouchableOpacity
                className="flex-row items-center justify-center rounded-xl bg-white py-4 px-5"
                activeOpacity={0.8}
              >
                <FontAwesome name="apple" size={24} color="#aaa" />
                <Text className="text-black text-base font-bold ml-2">
                  Continue with Apple
                </Text>
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <View className="items-center">
              <Text className="text-gray-500 text-xs text-center px-4">
                By signing up, you agree to our{" "}
                <Text className="text-gray-300 underline">
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text className="text-gray-300 underline">Privacy Policy</Text>.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: "100%",
  },
  primaryButton: {
    shadowColor: "#8c25f4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
});
