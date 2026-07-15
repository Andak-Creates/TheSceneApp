import { Ionicons } from "@expo/vector-icons";
import * as VideoThumbnails from "expo-video-thumbnails";
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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { pickImages, pickVideo } from "../lib/media";
import { getOptimizedUrl } from "../lib/cloudinary";

interface MediaItem {
  uri: string;
  type: "image" | "video";
  order: number;
  isPrimary: boolean;
  thumbnailUri?: string;
  uploading?: boolean;
  uploadedUrl?: string;
}

interface MediaGalleryUploaderProps {
  partyId?: string; // Optional during creation
  initialMedia?: MediaItem[];
  onMediaChange: (media: MediaItem[]) => void;
  maxImages?: number;
  maxVideos?: number;
}

export default function MediaGalleryUploader({
  partyId,
  initialMedia = [],
  onMediaChange,
  maxImages = 10,
  maxVideos = 3,
}: MediaGalleryUploaderProps) {
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);

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

      let thumbnailUri: string | undefined;
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(video.uri, {
          time: 1000,
          quality: 0.6,
        });
        thumbnailUri = uri;
      } catch (e) {
        console.log("Local thumbnail generation failed:", e);
      }

      const newMedia: MediaItem = {
        uri: video.uri,
        type: "video",
        order: media.length,
        isPrimary: media.length === 0,
        thumbnailUri,
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

  const handleDragEnd = ({ data }: { data: MediaItem[] }) => {
    const updated = data.map((item, index) => ({
      ...item,
      order: index,
    }));
    setMedia(updated);
    onMediaChange(updated);
  };

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<MediaItem>) => {
    const index = getIndex() || 0;
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          activeOpacity={0.8}
          className="mr-3 relative"
        >
          <Image
            source={{ uri: getOptimizedUrl(item.thumbnailUri || item.uri, item.type) }}
            className={`w-32 h-32 rounded-xl ${isActive ? "border-2 border-purple-500 opacity-80" : ""}`}
          />

          {/* Primary Badge */}
          {item.isPrimary && (
            <View className="absolute top-2 left-2 bg-purple-600 px-2 py-1 rounded-full">
              <Text className="text-white text-xs font-bold">Primary</Text>
            </View>
          )}

          {/* Video Badge */}
          {item.type === "video" && (
            <View className="absolute inset-0 items-center justify-center pointer-events-none">
              <View className="bg-black/50 rounded-full p-2">
                <Ionicons name="play" size={24} color="#fff" />
              </View>
            </View>
          )}

          {/* Actions */}
          <View className="absolute top-2 right-2 flex-row gap-1">
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

          {/* Drag Handle Overlay Instruction */}
          <View className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1">
             <Ionicons name="menu" size={16} color="#fff" />
          </View>

          {/* Uploading Indicator */}
          {item.uploading && (
            <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-xl">
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <View className="mb-6">
      <Text className="text-white font-bold text-lg mb-3">
        Media Gallery {media.length > 0 && `(${media.length})`}
      </Text>

      {/* Media Grid */}
      {media.length > 0 && (
        <GestureHandlerRootView className="mb-4">
          <DraggableFlatList
            horizontal
            data={media}
            onDragEnd={handleDragEnd}
            keyExtractor={(item) => item.uri}
            renderItem={renderItem}
            showsHorizontalScrollIndicator={false}
            containerStyle={{ overflow: 'visible' }}
          />
        </GestureHandlerRootView>
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
