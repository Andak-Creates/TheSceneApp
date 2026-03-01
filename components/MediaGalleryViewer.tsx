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

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
}

export default function MediaGalleryViewer({
  media,
  initialIndex = 0,
  onPress,
  aspectRatio = 4 / 5,
  showDelete = false,
  onDelete,
}: MediaGalleryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [fullscreen, setFullscreen] = useState(false);
  const [containerWidth, setContainerWidth] = useState(SCREEN_WIDTH);
  const flatListRef = useRef<FlatList>(null);

   const filteredMedia = (media || []).filter(item => 
    item.media_url && (
      item.media_url.startsWith("http") || 
      item.media_url.startsWith("https") || 
      item.media_url.startsWith("file://") ||
      item.media_url.startsWith("/")
    )
  );

  if (filteredMedia.length === 0) return null;

  const handleScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / containerWidth);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  const renderItem = ({ item }: { item: MediaItem }) => (
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
            muted={true} // Fixed muted state handled inside VideoPlayer via store
            loop={true}
          />
          <MuteToggleOverlay />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {/* Main Gallery */}
      <View className="mb-4">
        {/* Swippable Media Display */}
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

          {/* Fullscreen Button */}
          {!onPress && (
            <TouchableOpacity
              onPress={() => setFullscreen(true)}
              className="absolute top-4 right-4 bg-black/50 rounded-full p-2"
            >
              <Ionicons name="expand-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Media Counter Indicator dots */}
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
            <View className="absolute bottom-4 right-4 bg-black/50 px-3 py-1 rounded-full">
              <Text className="text-white text-[10px] font-bold">
                {currentIndex + 1} / {filteredMedia.length}
              </Text>
            </View>
          )}

          {/* Delete Button */}
          {showDelete && onDelete && (
             <TouchableOpacity
               onPress={() => onDelete(filteredMedia[currentIndex].id)}
               className="absolute top-4 left-4 bg-red-500/80 p-2 rounded-full"
               style={{ zIndex: 100 }}
             >
               <Ionicons name="trash-outline" size={20} color="#fff" />
             </TouchableOpacity>
          )}
        </View>

        {/* Thumbnail Strip (Only show on details page, not home feed) */}
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
                <RNImage
                  source={{
                    uri:
                      item.media_type === "video"
                        ? item.thumbnail_url || item.media_url
                        : item.media_url,
                  }}
                  className="w-16 h-16 bg-gray-900"
                  resizeMode="cover"
                />
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

      {/* Fullscreen Modal */}
      <Modal
        visible={fullscreen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setFullscreen(false)}
      >
        <View className="flex-1 bg-black">
          {/* Close Button */}
          <TouchableOpacity
            onPress={() => setFullscreen(false)}
            className="absolute top-12 right-4 z-10 bg-white/20 rounded-full p-2"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>

          {/* Fullscreen Media */}
          <View className="flex-1 items-center justify-center">
            {filteredMedia[currentIndex].media_type === "image" ? (
              <RNImage
                source={{ uri: filteredMedia[currentIndex].media_url }}
                style={{ width: containerWidth, height: "100%", backgroundColor: '#111' }}
                resizeMode="contain"
              />
            ) : (
              <VideoPlayer
                videoUrl={filteredMedia[currentIndex].media_url}
                autoPlay={true}
                muted={false}
                loop={false}
                showControls={true}
                fullscreen={true}
              />
            )}
          </View>

          {/* Navigation in Fullscreen */}
          {filteredMedia.length > 1 && (
            <View className="absolute bottom-8 left-0 right-0 flex-row justify-center gap-4">
              <TouchableOpacity
                onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                disabled={currentIndex === 0}
                className={`bg-white/20 rounded-full p-3 ${
                  currentIndex === 0 ? "opacity-50" : ""
                }`}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>

              <View className="bg-white/20 px-4 py-3 rounded-full">
                <Text className="text-white font-semibold">
                  {currentIndex + 1} / {filteredMedia.length}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                    setCurrentIndex(Math.min(filteredMedia.length - 1, currentIndex + 1))
                }
                disabled={currentIndex === filteredMedia.length - 1}
                className={`bg-white/20 rounded-full p-3 ${
                  currentIndex === filteredMedia.length - 1 ? "opacity-50" : ""
                }`}
              >
                <Ionicons name="chevron-forward" size={24} color="#fff" />
              </TouchableOpacity>
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
      className="absolute bottom-4 left-4 bg-black/60 w-9 h-9 rounded-full items-center justify-center border border-white/20"
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

// ✅ Separate Video Player Component using expo-video
interface VideoPlayerProps {
  videoUrl: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  showControls?: boolean;
  fullscreen?: boolean;
}

function VideoPlayer({
  videoUrl,
  autoPlay = false,
  muted = false,
  loop = true,
  showControls = false,
  fullscreen = false,
}: VideoPlayerProps) {
  const { isMuted } = useAudioStore();

  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = loop;
    player.muted = isMuted;
    if (autoPlay) {
      player.play();
    }
  });

  // Effect to sync store mute state to player
  React.useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  return (
    <VideoView
      player={player}
      style={{ width: "100%", height: "100%" }}
      contentFit={fullscreen ? "contain" : "cover"}
      nativeControls={showControls}
      fullscreenOptions={{
        enable: true,
      }}
      allowsPictureInPicture={false}
    />
  );
}
