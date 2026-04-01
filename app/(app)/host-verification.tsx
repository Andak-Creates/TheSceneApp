import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
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

  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
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
        setIdNumber(verificationData.id_number || "");
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

  const pickIdImage = async () => {
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
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.7,
    });
    if (!result.canceled) {
      setIdImageUri(result.assets[0].uri);
    }
  };

  const uploadIdImage = async (uri: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");

    const response = await fetch(uri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    const fileExt = uri.split(".").pop()?.toLowerCase() || "jpg";
    const contentType = fileExt === "png" ? "image/png" : "image/jpeg";

    const fileName = `verification/${user.id}/id_${Date.now()}.${fileExt}`;

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
      !idNumber.trim() ||
      !idImageUri ||
      !address.trim() ||
      !phone.trim()
    ) {
      setError("Please fill in all fields and upload your ID image.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const idImageUrl = await uploadIdImage(idImageUri);
      const { error: upsertError } = await supabase
        .from("host_verifications")
        .upsert(
          {
            user_id: user.id,
            full_name: fullName.trim(),
            id_type: idType.trim(),
            id_number: idNumber.trim(),
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
        // Specifically look for RLS policy violations
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
      Alert.alert(
        "Submitted",
        "Your verification has been submitted. We'll review it and notify you. You can create parties once approved.",
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
      <View className="pt-16 px-6 pb-6 border-b border-white/5">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 mb-4"
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl font-bold">Host Verification</Text>
        <Text className="text-gray-400 text-sm mt-1">
          Verify your identity to create and host parties on the platform.
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-6 pt-6"
        showsVerticalScrollIndicator={false}
      >
        {status === "pending" && (
          <View className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
            <Text className="text-amber-400 font-semibold">
              Verification pending
            </Text>
            <Text className="text-gray-300 text-sm mt-1">
              Your verification is under review. You'll be able to create
              parties once approved.
            </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              className="mt-4 py-2"
            >
              <Text className="text-purple-400 font-semibold">Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "rejected" && (
          <View className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-6">
            <Text className="text-red-400 font-semibold">
              Verification rejected
            </Text>
            {rejectionReason && (
              <Text className="text-gray-300 text-sm mt-1">
                Reason: {rejectionReason}
              </Text>
            )}
            <Text className="text-gray-400 text-sm mt-2">
              You may resubmit with correct information.
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

            <View className="mb-4">
              <Text className="text-white font-semibold mb-2">Full name *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your full legal name"
                placeholderTextColor="#666"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
            <View className="mb-4">
              <Text className="text-white font-semibold mb-2">ID type *</Text>
              <View className="flex-row flex-wrap gap-2">
                {[
                  "National ID",
                  "Passport",
                  "Driver's License",
                  "Voter's Card",
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
            <View className="mb-4">
              <Text className="text-white font-semibold mb-2">ID number *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="ID document number"
                placeholderTextColor="#666"
                value={idNumber}
                onChangeText={setIdNumber}
              />
            </View>
            <View className="mb-4">
              <Text className="text-white font-semibold mb-2">ID photo *</Text>
              <TouchableOpacity
                onPress={pickIdImage}
                className="bg-white/10 border border-white/20 rounded-xl p-4 items-center justify-center min-h-[120]"
              >
                {idImageUri ? (
                  <Image
                    source={{ uri: idImageUri }}
                    className="w-full h-32 rounded-lg"
                  />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={40} color="#666" />
                    <Text className="text-gray-400 mt-2">
                      Tap to upload ID photo
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <View className="mb-4">
              <Text className="text-white font-semibold mb-2">Address *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your address"
                placeholderTextColor="#666"
                value={address}
                onChangeText={setAddress}
              />
            </View>
            <View className="mb-6">
              <Text className="text-white font-semibold mb-2">Phone *</Text>
              <TextInput
                className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white"
                placeholder="Your phone number"
                placeholderTextColor="#666"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              className="bg-purple-600 py-4 rounded-2xl items-center mb-8"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-base">
                  Submit for Verification
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
