import { sendPush } from "@/lib/sendPush";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Image, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/authStore";

interface CommentItemProps {
  comment: {
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
  };
  onReply: (commentId: string, username: string) => void;
  onViewReplies: (commentId: string) => void;
  isExpanded?: boolean;
  currentUserId?: string;
  partyHostId?: string;
}

export default function CommentItem({
  comment,
  onReply,
  onViewReplies,
  isExpanded = false,
  currentUserId,
  partyHostId,
}: CommentItemProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  // Is this comment from the party host?
  const isHost = !!(partyHostId && comment.user.id === partyHostId);
  const hostProfile = comment.host_profile;

  // Use host profile name/avatar if host, else fall back to user profile
  const displayName = isHost && hostProfile ? hostProfile.name : comment.user.username;
  const displayAvatar =
    isHost && hostProfile?.avatar_url
      ? hostProfile.avatar_url
      : comment.user.avatar_url;
  const isVerified = isHost && !!hostProfile?.is_verified;

  useEffect(() => {
    fetchLikeStatus();
  }, [comment.id, currentUserId]);

  const fetchLikeStatus = async () => {
    try {
      const { count } = await supabase
        .from("comment_likes")
        .select("*", { count: "exact", head: true })
        .eq("comment_id", comment.id);

      setLikeCount(count || 0);

      if (currentUserId) {
        const { data } = await supabase
          .from("comment_likes")
          .select("id")
          .eq("comment_id", comment.id)
          .eq("user_id", currentUserId)
          .single();
        setLiked(!!data);
      }
    } catch {
      // not liked or no rows
    }
  };

  const handleLike = async () => {
    if (!user || likeLoading) return;
    setLikeLoading(true);

    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1));

    try {
      if (wasLiked) {
        await supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", comment.id)
          .eq("user_id", user.id);
      } else {
        await supabase.from("comment_likes").insert({
          comment_id: comment.id,
          user_id: user.id,
        });

        if (comment.user.id !== user.id) {
  const { data: likerProfile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  const likerName = likerProfile?.username || "Someone";
          await supabase.from("notifications").insert({
            user_id: comment.user.id,
            title: "💜 Comment liked",
            body: `${likerName} liked your comment`,
            type: "comment_like",
            data: { comment_id: comment.id },
            is_read: false,
          });

          sendPush(
  comment.user.id,
  "💜 Comment liked",
  `${likerName} liked your comment`,
  { type: "comment_like", comment_id: comment.id }
);
        }
      }
    } catch (error) {
      console.error("Error toggling comment like:", error);
      setLiked(wasLiked);
      setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1));
    } finally {
      setLikeLoading(false);
    }
  };

  const handleCommentOptions = () => {
    if (!user) return;
    const isOwnComment = comment.user.id === user.id;

    if (isOwnComment) {
      Alert.alert("Options", "This is your comment.", [
        { text: "Cancel", style: "cancel" }
      ]);
      return;
    }

    Alert.alert(
      "Comment Options",
      "Please choose an action",
      [
        { text: "Report Comment", style: "destructive", onPress: handleReportComment },
        { text: "Block User", style: "destructive", onPress: handleBlockUser },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleReportComment = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        target_type: "comment",
        target_id: comment.id,
        reason: "Flagged by user for review",
        status: "pending"
      });
      if (error) throw error;
      Alert.alert("Report Submitted", "Thank you. Our team will review this comment.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to submit report.");
    }
  };

  const handleBlockUser = async () => {
    if (!user) return;
    Alert.alert("Block User", `Are you sure you want to block ${displayName}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: async () => {
          try {
            const { error } = await supabase.from("blocked_users").insert({
              blocker_id: user.id,
              blocked_id: comment.user.id
            });
            if (error) throw error;
            Alert.alert("User Blocked", "You have successfully blocked this user.");
          } catch (e: any) {
             console.error(e);
             if (e.code === '23505') {
               Alert.alert("Info", "You have already blocked this user.");
               return;
             }
             Alert.alert("Error", "Could not block user.");
          }
      }}
    ]);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const commentDate = new Date(dateString);
    const seconds = Math.floor((now.getTime() - commentDate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
  };

  const handleProfileTap = () => {
    if (comment.user.id === currentUserId) {
      // Tapping your own comment → your profile tab
      router.push("/(app)/profile");
    } else if (isHost && hostProfile) {
      // Tapping the party host's comment → their host profile page
      router.push({
        pathname: "/host/[id]",
        params: { id: hostProfile.id },
      });
    } else {
      // Tapping any other user's comment → their public user profile
      router.push({
        pathname: "/user/[id]",
        params: { id: comment.user.id },
      });
    }
  };

  return (
    <View
      className={`flex-row py-3 ${
        comment.parent_comment_id ? "pl-2 border-l border-white/5 py-2" : ""
      }`}
    >
      {/* Avatar */}
      <TouchableOpacity onPress={handleProfileTap}>
        {displayAvatar ? (
          <Image
            source={{ uri: displayAvatar }}
            className={`${
              comment.parent_comment_id ? "w-7 h-7" : "w-9 h-9"
            } rounded-full`}
          />
        ) : (
          <View
            className={`${
              comment.parent_comment_id ? "w-7 h-7" : "w-9 h-9"
            } rounded-full bg-purple-600 items-center justify-center`}
          >
            <Text
              className={`text-white font-bold ${
                comment.parent_comment_id ? "text-[10px]" : "text-sm"
              }`}
            >
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Comment Content */}
      <View className="ml-3 flex-1">
        <View className="flex-row items-start">
          <View className="flex-1">
            <View className="leading-5 flex flex-col gap-1">
              <TouchableOpacity onPress={handleProfileTap}>
                <View className="flex-row items-center gap-1">
                  <Text className="font-semibold text-white">{displayName}</Text>
                  {isVerified && (
                    <Ionicons name="checkmark-circle" size={12} color="#a855f7" />
                  )}
                  {isHost && (
                    <View className="bg-purple-600/20 px-1.5 py-0.5 rounded-full">
                      <Text className="text-purple-400 text-[9px] font-bold">
                        HOST
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
              <Text className="text-gray-300">{comment.comment_text}</Text>
            </View>

            {/* Actions Row */}
            <View className="flex-row items-center mt-2 gap-4">
              <Text className="text-gray-500 text-[10px]">
                {formatTimeAgo(comment.created_at)}
              </Text>

              <TouchableOpacity onPress={() => onReply(comment.id, displayName)}>
                <Text className="text-gray-400 text-[10px] font-bold">
                  Reply
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleCommentOptions}>
                <Ionicons name="ellipsis-horizontal" size={14} color="#9ca3af" />
              </TouchableOpacity>

              {comment.reply_count > 0 && (
                <TouchableOpacity onPress={() => onViewReplies(comment.id)}>
                  <Text className="text-purple-400 text-[10px] font-bold">
                    {isExpanded
                      ? "Hide replies"
                      : `View ${comment.reply_count} ${
                          comment.reply_count === 1 ? "reply" : "replies"
                        }`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Like Button */}
          <TouchableOpacity
            onPress={handleLike}
            className="ml-2 mt-1 items-center"
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={14}
              color={liked ? "#ef4444" : "#4b5563"}
            />
            {likeCount > 0 && (
              <Text className="text-gray-500 text-[9px] mt-0.5">{likeCount}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}