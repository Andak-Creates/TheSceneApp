import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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
  };
  onReply: (commentId: string, username: string) => void;
  onViewReplies: (commentId: string) => void;
  isExpanded?: boolean;
  currentUserId?: string;
}

export default function CommentItem({
  comment,
  onReply,
  onViewReplies,
  isExpanded = false,
  currentUserId,
}: CommentItemProps) {
  const router = useRouter();
  const [liked, setLiked] = useState(false);

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
      router.push("/(app)/profile");
    } else {
      router.push({
        pathname: "/host/[id]",
        params: { id: comment.user.id },
      });
    }
  };

  return (
    <View className={`flex-row py-3 ${comment.parent_comment_id ? "pl-2 border-l border-white/5 py-2" : ""}`}>
      {/* Avatar */}
      <TouchableOpacity onPress={handleProfileTap}>
        {comment.user.avatar_url ? (
          <Image
            source={{ uri: comment.user.avatar_url }}
            className={`${comment.parent_comment_id ? "w-7 h-7" : "w-9 h-9"} rounded-full`}
          />
        ) : (
          <View className={`${comment.parent_comment_id ? "w-7 h-7" : "w-9 h-9"} rounded-full bg-purple-600 items-center justify-center`}>
            <Text className={`text-white font-bold ${comment.parent_comment_id ? "text-[10px]" : "text-sm"}`}>
              {comment.user.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Comment Content */}
      <View className="ml-3 flex-1">
        <View className="flex-row items-start">
          <View className="flex-1">
            {/* Username and Comment */}
            <View className="text-white leading-5 flex flex-col gap-1">
              <TouchableOpacity onPress={handleProfileTap}>
                <Text className="font-semibold text-white">{comment.user.username} </Text>
              </TouchableOpacity>
              <Text className="text-gray-300">{comment.comment_text}</Text>
            </View>

            {/* Actions Row */}
            <View className="flex-row items-center mt-2 gap-4">
              <Text className="text-gray-500 text-[10px]">
                {formatTimeAgo(comment.created_at)}
              </Text>

              <TouchableOpacity
                onPress={() => onReply(comment.id, comment.user.username)}
              >
                <Text className="text-gray-400 text-[10px] font-bold">
                  Reply
                </Text>
              </TouchableOpacity>

              {comment.reply_count > 0 && (
                <TouchableOpacity onPress={() => onViewReplies(comment.id)}>
                  <Text className="text-purple-400 text-[10px] font-bold">
                    {isExpanded ? "Hide replies" : `View ${comment.reply_count} ${comment.reply_count === 1 ? "reply" : "replies"}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Like Button */}
          <TouchableOpacity
            onPress={() => setLiked(!liked)}
            className="ml-2 mt-1"
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={14}
              color={liked ? "#ef4444" : "#4b5563"}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
