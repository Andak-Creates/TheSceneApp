import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
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

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuthStore();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignUp = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (!eulaAccepted) {
      setError("You must agree to the Terms of Service and Privacy Policy");
      return;
    }

    if (username.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    const { error: signUpError } = await signUp(email.trim(), password, username.trim());

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message || "Failed to sign up");
    } else {
      // Navigate to onboarding — root layout's auth guard will also
      // redirect here, but we push explicitly for immediate UX
      router.replace("/(auth)/onboarding");
      setUsername("");
      setPassword("");
      setEmail("");
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
            <View className="my-8">
              <Text className="text-white text-left tracking-tight text-[35px] font-extrabold leading-tight mb-3">
                Create An Account{"\n"}
                On <Text className="text-purple-500">TheScene</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Join the party and never miss a vibe!
              </Text>
            </View>

            {/* Error Message */}
            {error ? (
              <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                <Text className="text-red-300 text-sm font-medium">{error}</Text>
              </View>
            ) : null}

            {/* Input Fields */}
            <View className="gap-4 mb-6">
              {/* Username Input */}
              <View>
                <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">Username</Text>
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
                    placeholder="Create a password (min 6 chars)"
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
                        {/* EULA */}
            <TouchableOpacity 
              className="flex-row items-center justify-center px-4 mb-4"
              onPress={() => setEulaAccepted(!eulaAccepted)}
              activeOpacity={0.7}
            >
              <View className={`w-5 h-5 rounded border ${eulaAccepted ? 'bg-purple-600 border-purple-600' : 'border-gray-500'} items-center justify-center mr-3`}>
                {eulaAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text className="text-gray-400 text-xs flex-1">
                I agree to the{" "}
                <Text
                  className="text-gray-300 underline font-medium"
                  onPress={() => Linking.openURL("https://thescene.vercel.app/terms-of-service")}
                >
                  Terms of Service
                </Text>{" "}
                and{" "}
                <Text
                  className="text-gray-300 underline font-medium"
                  onPress={() => Linking.openURL("https://thescene.vercel.app/privacy-policy")}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>


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
                <Text className="text-white text-lg font-bold">Create Account</Text>
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
