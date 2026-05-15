import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { supabase } from "./supabase";

import { uploadToCloudinary } from "./cloudinary";

export interface MediaUploadResult {
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

/**
 * Upload party media (image or video) to Cloudinary
 */
export async function uploadPartyMedia(
  partyId: string,
  uri: string,
  type: "image" | "video",
): Promise<MediaUploadResult> {
  try {
    const folder = `party-media/${partyId}`;
    const result = await uploadToCloudinary(uri, type, folder);

    return {
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
    };
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
    // Note: Cloudinary assets remain unless deleted via signed API request.
    // For now, we just remove the database record. 
    // In production, an edge function should handle physical deletion from Cloudinary.
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
