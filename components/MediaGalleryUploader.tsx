import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { pickImages, pickVideo } from "../lib/media";

interface MediaItem {
  uri: string;
  type: "image" | "video";
  order: number;
  isPrimary: boolean;
  uploading?: boolean;
  uploadedUrl?: string;
}

interface MediaGalleryUploaderProps {
  partyId?: string; // Optional during creation
  onMediaChange: (media: MediaItem[]) => void;
  maxImages?: number;
  maxVideos?: number;
}

export default function MediaGalleryUploader({
  partyId,
  onMediaChange,
  maxImages = 10,
  maxVideos = 3,
}: MediaGalleryUploaderProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);

  const handleAddImages = async () => {
    try {
      const currentImages = media.filter((m) => m.type === "image").length;
      const remaining = maxImages - currentImages;

      if (remaining <= 0) {
        Alert.alert("Limit Reached", `Maximum ${maxImages} images allowed`);
        return;
      }

      const images = await pickImages(remaining);
      if (images.length === 0) return;

      const newMedia: MediaItem[] = images.map((img, index) => ({
        uri: img.uri,
        type: "image",
        order: media.length + index,
        isPrimary: media.length === 0 && index === 0, // First image is primary
      }));

      const updated = [...media, ...newMedia];
      setMedia(updated);
      onMediaChange(updated);
    } catch (error) {
      console.error("Error picking images:", error);
      Alert.alert("Error", "Failed to pick images");
    }
  };

  const handleAddVideo = async () => {
    try {
      const currentVideos = media.filter((m) => m.type === "video").length;

      if (currentVideos >= maxVideos) {
        Alert.alert("Limit Reached", `Maximum ${maxVideos} videos allowed`);
        return;
      }

      const video = await pickVideo(120); // 2 min max
      if (!video) return;

      const newMedia: MediaItem = {
        uri: video.uri,
        type: "video",
        order: media.length,
        isPrimary: false,
      };

      const updated = [...media, newMedia];
      setMedia(updated);
      onMediaChange(updated);
    } catch (error) {
      console.error("Error picking video:", error);
      Alert.alert("Error", "Failed to pick video");
    }
  };

  const handleRemove = (index: number) => {
    const updated = media.filter((_, i) => i !== index);
    // Reorder
    updated.forEach((item, i) => {
      item.order = i;
    });
    // If removed item was primary, make first item primary
    if (media[index].isPrimary && updated.length > 0) {
      updated[0].isPrimary = true;
    }
    setMedia(updated);
    onMediaChange(updated);
  };

  const handleSetPrimary = (index: number) => {
    const updated = media.map((item, i) => ({
      ...item,
      isPrimary: i === index,
    }));
    setMedia(updated);
    onMediaChange(updated);
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const updated = [...media];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    // Update order
    updated.forEach((item, i) => {
      item.order = i;
    });
    setMedia(updated);
    onMediaChange(updated);
  };

  return (
    <View className="mb-6">
      <Text className="text-white font-bold text-lg mb-3">
        Media Gallery {media.length > 0 && `(${media.length})`}
      </Text>

      {/* Media Grid */}
      {media.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
        >
          {media.map((item, index) => (
            <View key={index} className="mr-3 relative">
              <Image
                source={{ uri: item.uri }}
                className="w-32 h-32 rounded-xl"
              />

              {/* Primary Badge */}
              {item.isPrimary && (
                <View className="absolute top-2 left-2 bg-purple-600 px-2 py-1 rounded-full">
                  <Text className="text-white text-xs font-bold">Primary</Text>
                </View>
              )}

              {/* Video Badge */}
              {item.type === "video" && (
                <View className="absolute inset-0 items-center justify-center">
                  <View className="bg-black/50 rounded-full p-2">
                    <Ionicons name="play" size={24} color="#fff" />
                  </View>
                </View>
              )}

              {/* Actions */}
              <View className="absolute top-2 right-2 flex-row gap-1">
                {index > 0 && (
                  <TouchableOpacity
                    onPress={() => handleReorder(index, index - 1)}
                    className="bg-black/70 rounded-full p-1"
                  >
                    <Ionicons name="chevron-back" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {index < media.length - 1 && (
                  <TouchableOpacity
                    onPress={() => handleReorder(index, index + 1)}
                    className="bg-black/70 rounded-full p-1"
                  >
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                {!item.isPrimary && item.type === "image" && (
                  <TouchableOpacity
                    onPress={() => handleSetPrimary(index)}
                    className="bg-black/70 rounded-full p-1"
                  >
                    <Ionicons name="star-outline" size={16} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleRemove(index)}
                  className="bg-red-600/90 rounded-full p-1"
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Uploading Indicator */}
              {item.uploading && (
                <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-xl">
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Add Buttons */}
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={handleAddImages}
          className="flex-1 bg-white/10 border border-white/20 rounded-xl py-4 items-center"
        >
          <Ionicons name="images-outline" size={24} color="#fff" />
          <Text className="text-white font-semibold mt-2">
            Add Images ({media.filter((m) => m.type === "image").length}/
            {maxImages})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleAddVideo}
          className="flex-1 bg-white/10 border border-white/20 rounded-xl py-4 items-center"
        >
          <Ionicons name="videocam-outline" size={24} color="#fff" />
          <Text className="text-white font-semibold mt-2">
            Add Video ({media.filter((m) => m.type === "video").length}/
            {maxVideos})
          </Text>
        </TouchableOpacity>
      </View>

      {media.length === 0 && (
        <Text className="text-gray-500 text-center mt-4 text-sm">
          Add images and videos to showcase your event
        </Text>
      )}
    </View>
  );
}
