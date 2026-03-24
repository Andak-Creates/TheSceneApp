import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { supabase } from "./supabase";

export interface MediaUploadResult {
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

/**
 * Upload party media (image or video) to Supabase storage
 */
export async function uploadPartyMedia(
  partyId: string,
  uri: string,
  type: "image" | "video",
): Promise<MediaUploadResult> {
  try {
    const fileExt =
      uri.split(".").pop()?.toLowerCase() || (type === "video" ? "mov" : "jpg");
    const fileName = `${partyId}/${type}_${Date.now()}.${fileExt}`;
    const filePath = `party-media/${fileName}`;

    let uploadData: ArrayBuffer;
    let contentType: string;

    if (type === "video") {
      // Use fetch+arrayBuffer for videos — base64 is too slow/crashes for large files
      const response = await fetch(uri);
      uploadData = await response.arrayBuffer();
      contentType = fileExt === "mp4" ? "video/mp4" : "video/quicktime";
    } else {
      // Use base64 for images
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64",
      });
      uploadData = decode(base64);
      contentType = "image/jpeg";
    }

    const { data, error } = await supabase.storage
      .from("flyers")
      .upload(filePath, uploadData, { contentType, upsert: false });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("flyers").getPublicUrl(filePath);

    const result: MediaUploadResult = { url: publicUrl };

    // Generate real thumbnail for videos
    if (type === "video") {
      try {
        const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 1000,
          quality: 0.6,
        });

        const thumbBase64 = await FileSystem.readAsStringAsync(thumbUri, {
          encoding: "base64",
        });

        const thumbPath = `party-media/${partyId}/thumb_${Date.now()}.jpg`;

        const { error: thumbError } = await supabase.storage
          .from("flyers")
          .upload(thumbPath, decode(thumbBase64), {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (!thumbError) {
          const {
            data: { publicUrl: thumbPublicUrl },
          } = supabase.storage.from("flyers").getPublicUrl(thumbPath);
          result.thumbnailUrl = thumbPublicUrl;
        }
      } catch (thumbError) {
        console.log("Thumbnail generation failed (non-fatal):", thumbError);
      }
    }

    return result;
  } catch (error) {
    console.error("Media upload error:", error);
    throw error;
  }
}

/**
 * Pick multiple images from device
 */
export async function pickImages(
  maxImages: number = 10,
): Promise<ImagePicker.ImagePickerAsset[]> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permission to access media library was denied");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: maxImages,
    });

    if (result.canceled) return [];
    return result.assets;
  } catch (error) {
    console.error("Image picker error:", error);
    throw error;
  }
}

/**
 * Pick a video from device
 */
export async function pickVideo(
  maxDuration: number = 120,
): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permission to access media library was denied");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: false,
      allowsEditing: false, // must be false for videos on iOS
      quality: 0.8,
      videoMaxDuration: maxDuration,
    });

    if (result.canceled) return null;
    return result.assets[0];
  } catch (error) {
    console.error("Video picker error:", error);
    throw error;
  }
}

/**
 * Save media to party_media table
 */
export async function savePartyMedia(
  partyId: string,
  mediaUrl: string,
  type: "image" | "video",
  options?: {
    thumbnailUrl?: string;
    displayOrder?: number;
    isPrimary?: boolean;
    durationSeconds?: number;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("party_media").insert({
      party_id: partyId,
      media_type: type,
      media_url: mediaUrl,
      thumbnail_url: options?.thumbnailUrl,
      display_order: options?.displayOrder ?? 0,
      is_primary: options?.isPrimary ?? false,
      duration_seconds: options?.durationSeconds,
    });

    if (error) throw error;
  } catch (error) {
    console.error("Error saving party media:", error);
    throw error;
  }
}

/**
 * Fetch all media for a party
 */
export async function getPartyMedia(partyId: string) {
  try {
    const { data, error } = await supabase
      .from("party_media")
      .select("*")
      .eq("party_id", partyId)
      .order("display_order", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching party media:", error);
    return [];
  }
}

/**
 * Delete party media
 */
export async function deletePartyMedia(mediaId: string): Promise<void> {
  try {
    const { data: media, error: fetchError } = await supabase
      .from("party_media")
      .select("media_url")
      .eq("id", mediaId)
      .single();

    if (fetchError) throw fetchError;

    const url = new URL(media.media_url);
    const filePath = url.pathname.split("/flyers/")[1];

    if (filePath) {
      await supabase.storage.from("flyers").remove([filePath]);
    }

    const { error } = await supabase
      .from("party_media")
      .delete()
      .eq("id", mediaId);

    if (error) throw error;
  } catch (error) {
    console.error("Error deleting party media:", error);
    throw error;
  }
}

/**
 * Update media display order
 */
export async function updateMediaOrder(
  mediaId: string,
  newOrder: number,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("party_media")
      .update({ display_order: newOrder })
      .eq("id", mediaId);

    if (error) throw error;
  } catch (error) {
    console.error("Error updating media order:", error);
    throw error;
  }
}

/**
 * Set primary media for a party
 */
export async function setPrimaryMedia(
  partyId: string,
  mediaId: string,
): Promise<void> {
  try {
    await supabase
      .from("party_media")
      .update({ is_primary: false })
      .eq("party_id", partyId);

    const { error } = await supabase
      .from("party_media")
      .update({ is_primary: true })
      .eq("id", mediaId);

    if (error) throw error;
  } catch (error) {
    console.error("Error setting primary media:", error);
    throw error;
  }
}
