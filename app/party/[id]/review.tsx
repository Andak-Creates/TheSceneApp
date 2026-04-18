import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "../../../stores/authStore";

export default function ReviewScreen() {
  const router = useRouter();
  const { id: partyId } = useLocalSearchParams();
  const { user } = useAuthStore();
  
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [party, setParty] = useState<any>(null);
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    if (user && partyId) {
      checkReviewStatus();
    }
  }, [user, partyId]);

  const checkReviewStatus = async () => {
    try {
      // Get party details
      const { data: partyData } = await supabase
        .from("parties")
        .select("title, host_id")
        .eq("id", partyId)
        .single();
      
      setParty(partyData);

      // Check if user already reviewed
      const { data: existing } = await supabase
        .from("reviews")
        .select("id")
        .eq("party_id", partyId)
        .eq("reviewer_id", user?.id)
        .maybeSingle();

      if (existing) {
        setHasReviewed(true);
      }
    } catch (error) {
      console.error("Error checking review status:", error);
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert("Error", "Please select a star rating");
      return;
    }

    if (!user || !party) return;

    setLoading(true);
    try {
      // 1. Insert review
      const { error: reviewError } = await supabase.from("reviews").insert({
        party_id: partyId,
        host_id: party.host_id,
        reviewer_id: user.id,
        rating,
        comment: comment.trim() || null,
      });

      if (reviewError) throw reviewError;

      // 2. Create notification for host
      await supabase.from("notifications").insert({
        user_id: party.host_id,
        title: "New Review Received!",
        body: `A guest just rated your party "${party.title}" - ${rating} Stars.`,
        type: "review",
        data: { party_id: partyId, rating }
      });

      Alert.alert("Success", "Thank you for your feedback!", [
        { text: "OK", onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error("Error submitting review:", error);
      Alert.alert("Error", error.message || "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  if (hasReviewed) {
    return (
      <View className="flex-1 bg-[#191022] items-center justify-center p-6">
        <View className="bg-white/5 rounded-3xl p-8 items-center border border-white/10">
          <Ionicons name="checkmark-circle" size={64} color="#8B5CF6" />
          <Text className="text-white text-xl font-bold mt-4 text-center">
            Review Submitted
          </Text>
          <Text className="text-gray-400 text-center mt-2">
            You have already reviewed this party. Thank you for your feedback!
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-purple-600 px-8 py-3 rounded-xl mt-6 w-full items-center"
          >
            <Text className="text-white font-bold text-base">Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-[#191022]"
    >
      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity 
          onPress={() => router.back()}
          className="mb-8"
        >
          <Ionicons name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>

        <Text className="text-white text-3xl font-extrabold mb-2">
          Rate the Party
        </Text>
        <Text className="text-gray-400 text-lg mb-8">
          How was "{party?.title}"? Your feedback helps the host improve.
        </Text>

        <View className="items-center mb-10">
          <View className="flex-row gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={star <= rating ? "star" : "star-outline"}
                  size={48}
                  color={star <= rating ? "#FFD700" : "#333"}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text className="text-purple-400 font-bold mt-4 text-lg">
            {rating === 0 ? "Select stars" : 
             rating === 1 ? "Disappointing" :
             rating === 2 ? "Could be better" :
             rating === 3 ? "It was okay" :
             rating === 4 ? "Great Experience" :
             "Totally Lit! 🔥"}
          </Text>
        </View>

        <View className="bg-white/5 rounded-2xl p-4 border border-white/10 mb-8">
          <Text className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">
            Optional Comment
          </Text>
          <TextInput
            multiline
            numberOfLines={4}
            maxLength={300}
            placeholder="Tell us what you liked (or didn't like)..."
            placeholderTextColor="#666"
            className="text-white text-base min-h-[100]"
            value={comment}
            onChangeText={setComment}
            style={{ textAlignVertical: "top" }}
          />
          <Text className="text-gray-500 text-right text-xs mt-2">
            {comment.length}/300
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading || rating === 0}
          className={`py-4 rounded-2xl items-center shadow-lg ${
            rating === 0 ? "bg-gray-700" : "bg-purple-600"
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-lg">Submit Review</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
