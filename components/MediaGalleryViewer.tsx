import { Ionicons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Image as RNImage,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAudioStore } from "../stores/audioStore";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface MediaItem {
  id: string;
  media_type: "image" | "video";
  media_url: string;
  thumbnail_url?: string;
  is_primary: boolean;
  display_order: number;
}

interface MediaGalleryViewerProps {
  media: MediaItem[];
  initialIndex?: number;
  onPress?: () => void;
  aspectRatio?: number;
  showDelete?: boolean;
  onDelete?: (id: string) => void;
  isActive?: boolean;
  instanceId?: string;
}

export default function MediaGalleryViewer({
  media,
  initialIndex = 0,
  onPress,
  aspectRatio = 4 / 5,
  showDelete = false,
  onDelete,
  isActive = true,
  instanceId,
}: MediaGalleryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(initialIndex);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH);
  const flatListRef = useRef<FlatList>(null);
  const fullscreenFlatListRef = useRef<FlatList>(null);

  const filteredMedia = (media || []).filter(
    (item) =>
      item.media_url &&
      (item.media_url.startsWith("http") ||
        item.media_url.startsWith("https") ||
        item.media_url.startsWith("file://") ||
        item.media_url.startsWith("/")),
  );

  if (filteredMedia.length === 0) return null;

  const handleScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const handleFullscreenScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / SCREEN_WIDTH);
    if (index !== fullscreenIndex) {
      setFullscreenIndex(index);
    }
  };

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setFullscreen(true);
  };

  // Inline gallery item (feed / detail page)
  const renderItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress || (() => {})}
      style={{ width: containerWidth, aspectRatio }}
    >
      {item.media_type === "image" ? (
        <RNImage
          source={{ uri: item.media_url }}
          className="w-full h-full bg-gray-900"
          resizeMode="cover"
        />
      ) : (
        <View className="flex-1">
          <VideoPlayer
            videoUrl={item.media_url}
            autoPlay={true}
            loop={true}
            // Only play if this gallery is active AND this slide is current AND fullscreen is closed
            isActive={isActive && index === currentIndex && !fullscreen}
          />
          <MuteToggleOverlay />
        </View>
      )}
    </TouchableOpacity>
  );

  // Fullscreen gallery item
  const renderFullscreenItem = ({
    item,
    index,
  }: {
    item: MediaItem;
    index: number;
  }) => (
    <View
      style={{
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        backgroundColor: "#000",
      }}
    >
      {item.media_type === "image" ? (
        <RNImage
          source={{ uri: item.media_url }}
          style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ flex: 1 }}>
          <VideoPlayer
            videoUrl={item.media_url}
            autoPlay={true}
            loop={false}
            showControls={true}
            fullscreen={true}
            // Only play the current fullscreen slide
            isActive={fullscreen && index === fullscreenIndex}
          />
          <MuteToggleOverlay />
        </View>
      )}
    </View>
  );

  return (
    <>
      {/* Main Gallery */}
      <View className="mb-4">
        <View className="relative w-full" style={{ aspectRatio }}>
          <FlatList
            ref={flatListRef}
            data={filteredMedia}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            snapToInterval={containerWidth}
            snapToAlignment="center"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            keyExtractor={(item) => item.id}
            initialScrollIndex={initialIndex}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
            getItemLayout={(_, index) => ({
              length: containerWidth,
              offset: containerWidth * index,
              index,
            })}
          />

          {/* Fullscreen Button — bottom right, away from header */}
          {!onPress && (
            <TouchableOpacity
              onPress={() => openFullscreen(currentIndex)}
              className="absolute bottom-2 right-4 bg-black/50 rounded-full p-2"
            >
              <Ionicons name="expand-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Dot Indicators */}
          {filteredMedia.length > 1 && (
            <View className="absolute bottom-4 left-0 right-0 flex-row justify-center gap-1.5">
              {filteredMedia.map((_, index) => (
                <View
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full ${
                    index === currentIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </View>
          )}

          {/* Index Counter */}
          {filteredMedia.length > 1 && (
            <View className="absolute bottom-4 right-16 bg-black/50 px-3 py-1 rounded-full">
              <Text className="text-white text-[10px] font-bold">
                {currentIndex + 1} / {filteredMedia.length}
              </Text>
            </View>
          )}

          {/* Delete Button */}
          {showDelete && onDelete && (
            <TouchableOpacity
              onPress={() => onDelete(filteredMedia[currentIndex].id)}
              className="absolute bottom-5 left-4 bg-red-500/90 p-3 rounded-full shadow-md"
              style={{ zIndex: 100 }}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Thumbnail Strip */}
        {!onPress && filteredMedia.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3 px-4"
          >
            {filteredMedia.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  flatListRef.current?.scrollToIndex({ index, animated: true });
                  setCurrentIndex(index);
                }}
                className={`mr-2 rounded-lg overflow-hidden ${
                  index === currentIndex ? "border-2 border-purple-500" : ""
                }`}
              >
                {item.media_type === "video" && !item.thumbnail_url ? (
                  // No thumbnail yet — show a dark placeholder with play icon
                  <View className="w-16 h-16 bg-gray-800 items-center justify-center">
                    <Ionicons name="videocam" size={20} color="#666" />
                  </View>
                ) : (
                  <RNImage
                    source={{
                      uri:
                        item.media_type === "video"
                          ? item.thumbnail_url!
                          : item.media_url,
                    }}
                    className="w-16 h-16 bg-gray-900"
                    resizeMode="cover"
                  />
                )}
                {item.media_type === "video" && (
                  <View className="absolute inset-0 items-center justify-center">
                    <View className="bg-black/50 rounded-full p-1">
                      <Ionicons name="play" size={12} color="#fff" />
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Fullscreen Modal — swipe navigation */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setFullscreen(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* Close Button */}
          <TouchableOpacity
            onPress={() => setFullscreen(false)}
            className="absolute top-12 right-4 z-20 bg-white/20 rounded-full p-2"
            style={{ zIndex: 20 }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Counter */}
          {filteredMedia.length > 1 && (
            <View
              className="absolute top-12 left-4 z-20 bg-black/50 px-3 py-1 rounded-full"
              style={{ zIndex: 20 }}
            >
              <Text className="text-white text-sm font-bold">
                {fullscreenIndex + 1} / {filteredMedia.length}
              </Text>
            </View>
          )}

          {/* Swipeable Fullscreen Media */}
          <FlatList
            ref={fullscreenFlatListRef}
            data={filteredMedia}
            renderItem={renderFullscreenItem}
            horizontal
            pagingEnabled
            snapToInterval={SCREEN_WIDTH}
            snapToAlignment="center"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={handleFullscreenScroll}
            scrollEventThrottle={16}
            keyExtractor={(item) => `fullscreen-${item.id}`}
            initialScrollIndex={fullscreenIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
          />

          {/* Swipe hint dots */}
          {filteredMedia.length > 1 && (
            <View className="absolute bottom-12 left-0 right-0 flex-row justify-center gap-1.5">
              {filteredMedia.map((_, index) => (
                <View
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full ${
                    index === fullscreenIndex ? "bg-white" : "bg-white/40"
                  }`}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function MuteToggleOverlay() {
  const { isMuted, toggleMute } = useAudioStore();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggleMute}
      className="absolute bottom-2 left-4 bg-black/60 w-9 h-9 rounded-full items-center justify-center border border-white/20"
      style={{ zIndex: 100 }}
    >
      <Ionicons
        name={isMuted ? "volume-mute" : "volume-high"}
        size={18}
        color="#fff"
      />
    </TouchableOpacity>
  );
}

interface VideoPlayerProps {
  videoUrl: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  showControls?: boolean;
  fullscreen?: boolean;
  isActive?: boolean;
}

function VideoPlayer({
  videoUrl,
  autoPlay = false,
  loop = true,
  showControls = false,
  fullscreen = false,
  isActive = true,
}: VideoPlayerProps) {
  const { isMuted } = useAudioStore();

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = loop;
    player.muted = isMuted;
  });

  React.useEffect(() => {
    if (isActive && autoPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive]);

  React.useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit={fullscreen ? "contain" : "cover"}
      nativeControls={showControls}
      allowsPictureInPicture={false}
    />
  );
}
