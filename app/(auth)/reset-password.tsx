import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
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
import { getFriendlyErrorMessage } from "../../lib/error-utils";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Parse the deep link to attempt setting the session if needed.
  // Sometimes Supabase handles it if PKCE, but as fallback we capture from hash.
  useEffect(() => {
    const handleUrl = async () => {
      if (url) {
        let access_token = null;
        let refresh_token = null;

        // 1. Check for Supabase error redirects first
        const parsed = Linking.parse(url);
        if (parsed.queryParams?.error_description) {
          setError(
            (parsed.queryParams.error_description as string).replace(/\+/g, ' ')
          );
          return;
        }

        // 2. Check hash for implicit flow tokens
        const hashPart = url.split('#')[1];
        if (hashPart) {
          const params = new URLSearchParams(hashPart);
          access_token = params.get('access_token');
          refresh_token = params.get('refresh_token');
        }

        // 3. Try query params if PKCE
        if (!access_token || !refresh_token) {
          if (parsed.queryParams?.access_token && parsed.queryParams?.refresh_token) {
             access_token = parsed.queryParams.access_token as string;
             refresh_token = parsed.queryParams.refresh_token as string;
          } else if (parsed.queryParams?.code) {
             const { error: pkceError } = await supabase.auth.exchangeCodeForSession(parsed.queryParams.code as string);
             if (pkceError) {
               setError(getFriendlyErrorMessage(pkceError) || "Invalid or expired reset link. Please request a new one.");
             }
             return; // handled by PKCE
          }
        }
        
        if (access_token && refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token
          });
          if (sessionError) {
            setError(getFriendlyErrorMessage(sessionError) || "Session expired or invalid link. Please try again.");
          }
        }
      }
    };
    handleUrl();
  }, [url]);

  const handleReset = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      setError("Please fill out both fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
          throw new Error("Your session has expired. Please request a new password reset link.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setSuccess(true);
      
      // Delay slightly so they see the success message
      setTimeout(() => {
        router.replace("/(app)/feed");
      }, 2000);
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err) || "Failed to update password. Please try again.");
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
          <TouchableOpacity className="absolute top-12 left-6 z-10" onPress={() => router.replace("/(auth)/login")}>
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center border border-white/20">
              <Text className="text-white text-xl">←</Text>
            </View>
          </TouchableOpacity>

          <View className="flex-1 justify-end px-6 pb-8 pt-24">
            <View className="my-8">
              <Text className="text-white text-left tracking-tight text-[35px] font-extrabold leading-tight mb-3">
                Create New{"\n"}
                <Text className="text-purple-500">Password</Text>
              </Text>
              <Text className="text-gray-300 text-left text-base font-medium leading-relaxed">
                Enter your new password below
              </Text>
            </View>

            {success ? (
              <View className="bg-green-500/20 border border-green-500/40 rounded-xl p-5 mb-6">
                <Text className="text-green-300 font-bold text-base mb-1">Password Updated ✓</Text>
                <Text className="text-green-100/80 text-sm leading-relaxed">
                  Your password has been successfully reset. Redirecting you to the app...
                </Text>
              </View>
            ) : (
              <>
                {error ? (
                  <View className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-4">
                    <Text className="text-red-300 text-sm font-medium">{error}</Text>
                  </View>
                ) : null}

                <View className="mb-4">
                  <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">New Password</Text>
                  <View className="relative">
                    <TextInput
                      className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 pr-14 text-white text-base"
                      placeholder="Enter new password"
                      placeholderTextColor="#888"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
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

                <View className="mb-6">
                  <Text className="text-gray-400 text-sm font-medium mb-2 ml-1">Confirm Password</Text>
                  <View className="relative">
                    <TextInput
                      className="bg-white/10 border border-white/20 rounded-xl h-14 px-5 pr-14 text-white text-base"
                      placeholder="Confirm new password"
                      placeholderTextColor="#888"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-4 top-0 bottom-0 justify-center"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color="#888"
                      />
                    </TouchableOpacity>
                  </View>
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
                    <Text className="text-white text-lg font-bold">Update Password</Text>
                  )}
                </TouchableOpacity>
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
