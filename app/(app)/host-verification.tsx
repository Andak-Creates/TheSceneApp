import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { notifyAdmins } from "../../lib/adminNotifications";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../stores/authStore";
import { useUserStore } from "../../stores/userStore";

type VerificationStatus =
  | "idle"
  | "pending"
  | "approved"
  | "rejected"
  | "not_submitted";

export default function HostVerificationScreen() {
  const { user } = useAuthStore();
  const { profile } = useUserStore();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState("");
  const [idImageUri, setIdImageUri] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchVerificationStatus();
  }, [user?.id]);

  const fetchVerificationStatus = async () => {
    if (!user) return;
    try {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("host_verified_at, host_verification_status")
        .eq("id", user.id)
        .single();

      const { data: verificationData } = await supabase
        .from("host_verifications")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        profileData?.host_verified_at ||
        profileData?.host_verification_status === "approved"
      ) {
        setStatus("approved");

        // Check if they have a brand profile yet
        const { data: profiles } = await supabase
          .from("host_profiles")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1);

        if (!profiles || profiles.length === 0) {
          router.replace("/(app)/host-profile-setup");
        } else {
          router.replace("/(app)/createParty");
        }
        return;
      }

      if (verificationData) {
        setStatus(verificationData.status as VerificationStatus);
        setFullName(verificationData.full_name || profile?.full_name || "");
        setIdType(verificationData.id_type || "");
        setIdImageUri(verificationData.id_image_url || null);
        setAddress(verificationData.address || "");
        setPhone(verificationData.phone || "");
        setRejectionReason(verificationData.rejection_reason || null);
      } else {
        setStatus("not_submitted");
      }
    } catch (e) {
      setStatus("not_submitted");
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (setter: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  const uploadVerificationImage = async (uri: string, prefix: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");

    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
    const contentType = fileExt === "png" ? "image/png" : "image/jpeg";

    const fileName = `verification/${user.id}/${prefix}_${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("flyers")
      .upload(fileName, arrayBuffer, {
        contentType: contentType,
        upsert: true,
      });

    if (error) {
      console.error("Storage upload error:", error);
      throw error;
    }

    return data.path;
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (
      !fullName.trim() ||
      !idType.trim() ||
      !idImageUri ||
      !address.trim() ||
      !phone.trim()
    ) {
      setError("Please fill in all fields and upload your ID photo");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      // 1. Upload ID Image
      const idImageUrl = idImageUri.startsWith("http")
        ? idImageUri
        : await uploadVerificationImage(idImageUri, "id");

      const { error: upsertError } = await supabase
        .from("host_verifications")
        .upsert(
          {
            user_id: user.id,
            full_name: fullName.trim(),
            id_type: idType.trim(),
            id_image_url: idImageUrl,
            address: address.trim(),
            phone: phone.trim(),
            status: "pending",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      if (upsertError) {
        console.error("Verification upsert error:", upsertError);
        if (
          upsertError.code === "42501" ||
          upsertError.message?.includes("row level security")
        ) {
          throw new Error(
            "Database permission error. Please contact support to fix your account's verification permissions.",
          );
        }
        throw upsertError;
      }

      setStatus("pending");

      // Notify Admins (Push)
      notifyAdmins(
        "🛡️ New Host Verification",
        `A new host verification has been submitted by ${fullName.trim()}.`,
        { type: "verification", user_id: user.id }
      );

      Alert.alert(
        "Submitted ✓",
        "Your verification has been submitted. We'll review it shortly and notify you. You can host events once approved.",
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e: any) {
      console.error("Submission failed:", e);
      setError(e.message || "Failed to submit verification");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#09030e] items-center justify-center">
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#09030e]"
    >
      {/* Header */}
      <View className="pt-16 px-6 pb-5 border-b border-white/5">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 mb-4 rounded-full bg-white/5 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Host Verification</Text>
        <Text className="text-gray-400 text-sm mt-1">
          All hosts must complete verification before creating or hosting any events.
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
      >
        {/* Mandatory notice */}
        {status === "not_submitted" && (
          <View className="bg-purple-500/10 border border-purple-500/25 rounded-2xl p-4 mb-6 flex-row items-start gap-3">
            <Ionicons name="shield-checkmark" size={20} color="#a855f7" />
            <View className="flex-1">
              <Text className="text-purple-300 font-semibold text-sm">Verification Required</Text>
              <Text className="text-gray-400 text-xs mt-1 leading-relaxed">
                This is mandatory for all hosts. Your full name here must match the name on your withdrawal bank account.
              </Text>
            </View>
          </View>
        )}

        {status === "pending" && (
          <View className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="time" size={18} color="#f59e0b" />
              <Text className="text-amber-400 font-semibold">
                Verification Under Review
              </Text>
            </View>
            <Text className="text-gray-300 text-sm mt-1">
              Your verification is being reviewed. You'll be notified once approved and can start hosting events.
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              className="mt-4 py-2"
            >
              <Text className="text-purple-400 font-semibold">← Go Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "rejected" && (
          <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6">
            <View className="flex-row items-center gap-2 mb-1">
              <Ionicons name="close-circle" size={18} color="#ef4444" />
              <Text className="text-red-400 font-semibold">
                Verification Rejected
              </Text>
            </View>
            {rejectionReason && (
              <Text className="text-gray-300 text-sm mt-1">
                Reason: {rejectionReason}
              </Text>
            )}
            <Text className="text-gray-400 text-sm mt-2">
              Please resubmit with the correct information below.
            </Text>
          </View>
        )}

        {(status === "not_submitted" || status === "rejected") && (
          <>
            {error ? (
              <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <Text className="text-red-400 text-sm">{error}</Text>
              </View>
            ) : null}

            {/* Full Name */}
            <View className="mb-5">
              <Text className="text-white font-semibold mb-1">Full Legal Name *</Text>
              <Text className="text-gray-500 text-xs mb-2">
                Must match the name on your withdrawal bank account exactly.
              </Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your full legal name"
                placeholderTextColor="#666"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* ID Type */}
            <View className="mb-5">
              <Text className="text-white font-semibold mb-2">ID Type *</Text>
              <View className="flex-row flex-wrap gap-2">
                {[
                  "National ID",
                  "Passport",
                  "Driver's License",
                  "Voter's Card",
                  "NIN",
                ].map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setIdType(type)}
                    className={`px-4 py-2.5 rounded-full border ${
                      idType === type
                        ? "bg-purple-600 border-purple-600"
                        : "bg-white/10 border-white/20"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        idType === type ? "text-white" : "text-gray-300"
                      }`}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ID Photo */}
            <View className="mb-5">
              <Text className="text-white font-semibold mb-1">ID Photo *</Text>
              <Text className="text-gray-500 text-xs mb-2">
                A clear photo of your selected government-issued ID.
              </Text>
              <TouchableOpacity
                onPress={() => pickImage(setIdImageUri)}
                className="bg-white/10 border border-white/20 rounded-xl p-4 items-center justify-center min-h-[110]"
              >
                {idImageUri ? (
                  <View className="w-full">
                    <Image
                      source={{ uri: idImageUri.startsWith("http") ? supabase.storage.from("flyers").getPublicUrl(idImageUri).data.publicUrl : idImageUri }}
                      className="w-full h-32 rounded-lg"
                      resizeMode="cover"
                    />
                    <View className="flex-row items-center justify-center mt-2 gap-1">
                      <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                      <Text className="text-green-400 text-xs font-semibold">ID uploaded — tap to change</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Ionicons name="card-outline" size={36} color="#666" />
                    <Text className="text-gray-400 mt-2 text-sm">Tap to upload ID photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Address */}
            <View className="mb-5">
              <Text className="text-white font-semibold mb-2">Home Address *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your residential address"
                placeholderTextColor="#666"
                value={address}
                onChangeText={setAddress}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Phone */}
            <View className="mb-6">
              <Text className="text-white font-semibold mb-2">Phone Number *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your phone number"
                placeholderTextColor="#666"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Progress indicator */}
            <View className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <Text className="text-gray-400 text-xs font-semibold mb-3 uppercase">Checklist</Text>
              {[
                { label: "Full legal name", done: fullName.trim().length > 2 },
                { label: "ID type selected", done: !!idType },
                { label: "ID photo uploaded", done: !!idImageUri },
                { label: "Home address", done: address.trim().length > 5 },
                { label: "Phone number", done: phone.trim().length === 11, error: phone.trim().length > 11 },
              ].map((item) => (
                <View key={item.label} className="flex-row items-center gap-2 mb-1.5">
                  <Ionicons
                    name={item.error ? "close-circle" : item.done ? "checkmark-circle" : "ellipse-outline"}
                    size={14}
                    color={item.error ? "#ef4444" : item.done ? "#22c55e" : "#555"}
                  />
                  <Text className={`text-xs ${item.error ? "text-red-400" : item.done ? "text-green-400" : "text-gray-500"}`}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className="bg-purple-600 py-4 rounded-2xl items-center mb-10"
              style={{
                shadowColor: "#a855f7",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View className="flex-row items-center gap-2">
                  <Ionicons name="shield-checkmark" size={18} color="#fff" />
                  <Text className="text-white font-bold text-base">
                    Submit for Verification
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
