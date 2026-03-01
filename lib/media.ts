import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

/**
 * Media upload and processing utilities
 */

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
  type: "image" | "video"
): Promise<MediaUploadResult> {
  try {
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64",
    });

    // Generate unique filename
    const fileExt = uri.split(".").pop();
    const fileName = `${partyId}/${type}_${Date.now()}.${fileExt}`;
    const filePath = `party-media/${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("flyers")
      .upload(filePath, decode(base64), {
        contentType: type === "image" ? "image/jpeg" : "video/mp4",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("flyers").getPublicUrl(filePath);

    const result: MediaUploadResult = {
      url: publicUrl,
    };

    // For videos, generate thumbnail
    if (type === "video") {
      // Note: Thumbnail generation would require additional processing
      // For now, we'll use a placeholder or the first frame
      result.thumbnailUrl = publicUrl; // Placeholder
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
  maxImages: number = 10
): Promise<ImagePicker.ImagePickerAsset[]> {
  try {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      throw new Error("Permission to access media library was denied");
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: maxImages,
    });

    if (result.canceled) {
      return [];
    }

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
  maxDuration: number = 120
): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      throw new Error("Permission to access media library was denied");
    }

    // Launch video picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: false,
      quality: 0.8,
      videoMaxDuration: maxDuration,
    });

    if (result.canceled) {
      return null;
    }

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
  }
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

    if (error) {
      throw error;
    }
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

    if (error) {
      throw error;
    }

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
    // First get the media URL to delete from storage
    const { data: media, error: fetchError } = await supabase
      .from("party_media")
      .select("media_url")
      .eq("id", mediaId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Extract file path from URL
    const url = new URL(media.media_url);
    const filePath = url.pathname.split("/flyers/")[1];

    // Delete from storage
    if (filePath) {
      await supabase.storage.from("flyers").remove([filePath]);
    }

    // Delete from database
    const { error } = await supabase
      .from("party_media")
      .delete()
      .eq("id", mediaId);

    if (error) {
      throw error;
    }
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
  newOrder: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from("party_media")
      .update({ display_order: newOrder })
      .eq("id", mediaId);

    if (error) {
      throw error;
    }
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
  mediaId: string
): Promise<void> {
  try {
    // First, unset all primary flags for this party
    await supabase
      .from("party_media")
      .update({ is_primary: false })
      .eq("party_id", partyId);

    // Then set the new primary
    const { error } = await supabase
      .from("party_media")
      .update({ is_primary: true })
      .eq("id", mediaId);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Error setting primary media:", error);
    throw error;
  }
}
