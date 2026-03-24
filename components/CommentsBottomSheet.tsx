import { sendPush } from "@/lib/sendPush";
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
  host_profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
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
    userId: string;
  } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [partyHostId, setPartyHostId] = useState<string | null>(null);
  const [hostProfileMap, setHostProfileMap] = useState<Record<string, any>>({});
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (isVisible) {
      fetchPartyHost();
      fetchComments();
      if (autoFocus) {
        setTimeout(() => inputRef.current?.focus(), 500);
      }
    }
  }, [isVisible, partyId]);

  const fetchPartyHost = async () => {
    try {
      const { data } = await supabase
        .from("parties")
        .select("host_id, host_profile_id, host_profile:host_profiles!host_profile_id(id, name, avatar_url, is_verified)")
        .eq("id", partyId)
        .single();

      if (data) {
        setPartyHostId(data.host_id);
        if (data.host_id && data.host_profile) {
          setHostProfileMap({ [data.host_id]: data.host_profile });
        }
      }
    } catch (error) {
      console.error("Error fetching party host:", error);
    }
  };

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("party_comments")
        .select(`
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq("party_id", partyId)
        .is("parent_comment_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setComments(data || []);
      setExpandedComments(new Set());
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
        .select(`
          *,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq("parent_comment_id", commentId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Error fetching replies:", error);
      return [];
    }
  };

  const getDisplayName = async (): Promise<string> => {
    if (!user) return "Someone";
    if (partyHostId && user.id === partyHostId && hostProfileMap[user.id]) {
      return hostProfileMap[user.id].name;
    }
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    return data?.username || "Someone";
  };

const handleSubmitComment = async () => {
  if (!user || !newComment.trim()) return;
  setSubmitting(true);

  try {
    const { data: inserted, error } = await supabase
      .from("party_comments")
      .insert({
        party_id: partyId,
        user_id: user.id,
        comment_text: newComment.trim(),
        parent_comment_id: replyingTo?.id || null,
      })
      .select(`
        *,
        user:profiles!user_id (
          id,
          username,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    const displayName = await getDisplayName();

    if (replyingTo) {
      // Append reply directly under its parent without wiping the list
      setComments((prev) => {
        const parentIndex = prev.findIndex((c) => c.id === replyingTo.id);
        if (parentIndex === -1) return [...prev, inserted];

        const nextTopLevelIndex = prev.findIndex(
          (c, i) => i > parentIndex && c.parent_comment_id === null
        );
        const insertAt =
          nextTopLevelIndex === -1 ? prev.length : nextTopLevelIndex;

        const newList = [...prev];
        newList.splice(insertAt, 0, inserted);
        return newList;
      });

      // Mark parent as expanded so replies stay visible
      // DB trigger handles reply_count increment automatically
      setExpandedComments((prev) => new Set(prev).add(replyingTo.id));

      // Notify the person being replied to
      if (replyingTo.userId !== user.id) {
        await supabase.from("notifications").insert({
          user_id: replyingTo.userId,
          title: "💬 New reply",
          body: `${displayName} replied to your comment`,
          type: "comment_reply",
          data: { party_id: partyId, comment_id: replyingTo.id },
          is_read: false,
        });
        sendPush(
          replyingTo.userId,
          "💬 New reply",
          `${displayName} replied to your comment`,
          { type: "comment_reply", party_id: partyId, comment_id: replyingTo.id }
        );
      }
    } else {
      // Prepend new top-level comment to the top of the list
      setComments((prev) => [inserted, ...prev]);

      // Notify host
      if (partyHostId && partyHostId !== user.id) {
        await supabase.from("notifications").insert({
          user_id: partyHostId,
          title: "💬 New comment",
          body: `${displayName} commented on your party`,
          type: "party_comment",
          data: { party_id: partyId },
          is_read: false,
        });
        sendPush(
          partyHostId,
          "💬 New comment",
          `${displayName} commented on your party`,
          { type: "party_comment", party_id: partyId }
        );
      }
    }

    setNewComment("");
    setReplyingTo(null);
    Keyboard.dismiss();
  } catch (error) {
    console.error("Error posting comment:", error);
  } finally {
    setSubmitting(false);
  }
};

  const handleReply = (commentId: string, username: string, userId: string) => {
    setReplyingTo({ id: commentId, username, userId });
    inputRef.current?.focus();
  };

  const handleViewReplies = async (commentId: string) => {
    if (expandedComments.has(commentId)) {
      // Collapse — remove replies from list
      setComments((prev) =>
        prev.filter((c) => c.parent_comment_id !== commentId)
      );
      setExpandedComments((prev) => {
        const newSet = new Set(prev);
        newSet.delete(commentId);
        return newSet;
      });
    } else {
      // Expand — fetch fresh replies and splice into list
      const replies = await fetchReplies(commentId);
      setComments((prev) => {
        const index = prev.findIndex((c) => c.id === commentId);
        if (index === -1) return prev;
        const newComments = [...prev];
        const nextTopLevelIndex = newComments.findIndex(
          (c, i) => i > index && c.parent_comment_id === null
        );
        const endIndex =
          nextTopLevelIndex === -1 ? newComments.length : nextTopLevelIndex;
        newComments.splice(index + 1, endIndex - index - 1, ...replies);
        return newComments;
      });
      setExpandedComments((prev) => new Set(prev).add(commentId));
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const isReply = item.parent_comment_id !== null;
    const hostProfile = hostProfileMap[item.user.id] || null;

    return (
      <View className={isReply ? "ml-12" : ""}>
        <CommentItem
          comment={{ ...item, host_profile: hostProfile }}
          onReply={(commentId, username) =>
            handleReply(commentId, username, item.user.id)
          }
          onViewReplies={handleViewReplies}
          currentUserId={user?.id}
          partyHostId={partyHostId || undefined}
          isExpanded={expandedComments.has(item.id)}
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
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />

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