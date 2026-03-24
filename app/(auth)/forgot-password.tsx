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
import { supabase } from "../../lib/supabase";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "thescene://reset-password",
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require("../../assets/images/partyBg.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <LinearGradient
        colors={["rgba(25, 16, 34, 0.3)", "rgba(25, 16, 34, 0.6)", "rgba(25, 16, 34, 1)"]}
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
          <TouchableOpacity className="absolute top-12 left-6 z-10" onPress={() => router.back()}>
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/20">
              <Text className="text-white text-xl">←</Text>
            </View>
          </TouchableOpacity>

          <View className="flex-1 justify-end px-6 pb-8 pt-24">
            <View className="my-8">
              <Text className="text-white text-left tracking-tight text-[35px] font-extrabold leading-tight mb-3">
                Reset Your{"\n"}
                <Text className="text-purple-500">Password</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Enter your email and we'll send you a reset link
              </Text>
            </View>

            {sent ? (
              <View className="bg-green-500/20 border border-green-500/40 rounded-xl p-5 mb-6">
                <Text className="text-green-300 font-bold text-base mb-1">Check your inbox ✓</Text>
                <Text className="text-green-100/80 text-sm leading-relaxed">
                  A password reset link has been sent to{" "}
                  <Text className="font-semibold">{email}</Text>. Check your spam folder if you don't see it.
                </Text>
                <TouchableOpacity
                  className="mt-4 bg-purple-600 rounded-xl py-3 items-center"
                  onPress={() => router.replace("/(auth)/login")}
                >
                  <Text className="text-white font-bold">Back to Log In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {error ? (
                  <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                    <Text className="text-red-300 text-sm font-medium">{error}</Text>
                  </View>
                ) : null}

                <View className="mb-6">
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

                <TouchableOpacity
                  className="items-center justify-center rounded-xl h-14 px-5 bg-purple-600 mb-6"
                  style={styles.primaryButton}
                  activeOpacity={0.9}
                  onPress={handleReset}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white text-lg font-bold">Send Reset Link</Text>
                  )}
                </TouchableOpacity>

                <View className="items-center">
                  <Text className="text-gray-400 text-sm">
                    Remember your password?{" "}
                    <Text
                      className="text-white font-semibold underline"
                      onPress={() => router.push("/(auth)/login")}
                    >
                      Log In
                    </Text>
                  </Text>
                </View>
              </>
            )}
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
