import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";
import CommentItem from "./CommentItem";

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  reply_count: number;
  parent_comment_id: string | null;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

interface CommentsBottomSheetProps {
  partyId: string;
  isVisible: boolean;
  onClose: () => void;
  autoFocus?: boolean;
}

export default function CommentsBottomSheet({
  partyId,
  isVisible,
  onClose,
  autoFocus = false,
}: CommentsBottomSheetProps) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(
    new Set()
  );
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (isVisible) {
      fetchComments();
      if (autoFocus) {
          // Small delay to allow modal animation to start
          setTimeout(() => {
              inputRef.current?.focus();
          }, 500);
      }
    }
  }, [isVisible, partyId]);

  const fetchComments = async () => {
    try {
      setLoading(true);

      // Fetch top-level comments (no parent)
      const { data, error } = await supabase
        .from("party_comments")
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `
        )
        .eq("party_id", partyId)
        .is("parent_comment_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (commentId: string) => {
    try {
      const { data, error } = await supabase
        .from("party_comments")
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `
        )
        .eq("parent_comment_id", commentId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching replies:", error);
      return [];
    }
  };

  const handleSubmitComment = async () => {
    if (!user || !newComment.trim()) return;

    setSubmitting(true);

    try {
      const { error } = await supabase.from("party_comments").insert({
        party_id: partyId,
        user_id: user.id,
        comment_text: newComment.trim(),
        parent_comment_id: replyingTo?.id || null,
      });

      if (error) throw error;

      setNewComment("");
      setReplyingTo(null);
      Keyboard.dismiss();
      await fetchComments();
    } catch (error) {
      console.error("Error posting comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = (commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    inputRef.current?.focus();
  };

  const handleViewReplies = async (commentId: string) => {
    if (expandedComments.has(commentId)) {
      // Collapse
      setExpandedComments((prev) => {
        const newSet = new Set(prev);
        newSet.delete(commentId);
        return newSet;
      });
    } else {
      // Expand and fetch replies
      const replies = await fetchReplies(commentId);

      // Insert replies after the parent comment
      setComments((prev) => {
        const index = prev.findIndex((c) => c.id === commentId);
        if (index === -1) return prev;

        const newComments = [...prev];
        // Remove old replies if any
        const nextIndex = newComments.findIndex(
          (c, i) => i > index && c.parent_comment_id === null
        );
        const endIndex = nextIndex === -1 ? newComments.length : nextIndex;

        newComments.splice(index + 1, endIndex - index - 1, ...replies);
        return newComments;
      });

      setExpandedComments((prev) => new Set(prev).add(commentId));
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const isReply = item.parent_comment_id !== null;

    return (
      <View className={isReply ? "ml-12" : ""}>
        <CommentItem
          comment={item}
          onReply={handleReply}
          onViewReplies={handleViewReplies}
          currentUserId={user?.id}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50">
        {/* Tap outside to close */}
        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={onClose}
        />

        {/* Bottom Sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="bg-[#191022] rounded-t-3xl"
          style={{ maxHeight: "90%" }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-6 pt-4 pb-8 border-b border-white/10">
            <Text className="text-white text-lg font-bold">Comments</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Comments List */}
          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#8B5CF6" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={comments}
              renderItem={renderComment}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={() => Keyboard.dismiss()}
              ListEmptyComponent={
                <View className="py-20 items-center">
                  <Ionicons name="chatbubble-outline" size={48} color="#666" />
                  <Text className="text-gray-400 mt-3">No comments yet</Text>
                  <Text className="text-gray-600 text-sm mt-1">
                    Be the first to comment!
                  </Text>
                </View>
              }
            />
          )}

          {/* Input Section */}
          <View className="border-t border-white/10 px-6 py-3 bg-[#191022]">
            {replyingTo && (
              <View className="flex-row items-center justify-between mb-2 bg-white/5 px-3 py-2 rounded-lg">
                <Text className="text-gray-400 text-sm">
                  Replying to{" "}
                  <Text className="text-purple-400 font-semibold">
                    @{replyingTo.username}
                  </Text>
                </Text>
                <TouchableOpacity onPress={() => setReplyingTo(null)}>
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              </View>
            )}

            <View className="flex-row items-center">
              <TextInput
                ref={inputRef}
                className="flex-1 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-white mr-2"
                placeholder="Add a comment..."
                placeholderTextColor="#666"
                value={newComment}
                onChangeText={setNewComment}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={handleSubmitComment}
                disabled={!newComment.trim() || submitting}
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  newComment.trim() ? "bg-purple-600" : "bg-white/10"
                }`}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
