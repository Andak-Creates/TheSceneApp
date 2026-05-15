const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const uploadToCloudinary = async (
  uri: string,
  type: "image" | "video" = "image",
  folder: string = ""
): Promise<{ url: string; publicId: string; thumbnailUrl?: string }> => {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error("Cloudinary configuration missing in .env");
  }

  // Use 'auto' or explicit resource type
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${type}/upload`;

  const formData = new FormData();
  
  // React Native FormData allows passing an object with uri, type, and name
  const fileExt = uri.split('.').pop()?.toLowerCase() || (type === "video" ? "mp4" : "jpg");
  const fileName = `upload_${Date.now()}.${fileExt}`;
  
  let mimeType = "application/octet-stream";
  if (type === "video") {
    mimeType = fileExt === 'mp4' ? 'video/mp4' : 'video/quicktime';
  } else {
    mimeType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
  }

  formData.append("file", {
    uri,
    name: fileName,
    type: mimeType,
  } as any);

  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (folder) {
    formData.append("folder", folder);
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Upload failed");
    }

    const result: any = { 
      url: data.secure_url,
      publicId: data.public_id,
    };

    // Auto-generate thumbnail for videos by swapping extension to .jpg
    if (type === "video" || data.resource_type === "video") {
      const urlParts = data.secure_url.split(".");
      urlParts.pop(); // remove extension
      result.thumbnailUrl = `${urlParts.join(".")}.jpg`;
    }

    return result;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

/**
 * Optimizes a Cloudinary URL by adding q_auto, f_auto, and vc_auto transformations.
 */
export const getOptimizedUrl = (url: string, type: "image" | "video" = "image") => {
  if (url && url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    // Only optimize if it doesn't already have these specific transformations
    if (!url.includes("/upload/q_auto") && !url.includes("/upload/f_auto")) {
      if (type === "video") {
        // q_auto for compression, vc_auto for codec optimization (safer for mobile than f_auto)
        return url.replace("/upload/", "/upload/q_auto,vc_auto/");
      }
      // q_auto for compression, f_auto for modern format delivery
      return url.replace("/upload/", "/upload/q_auto,f_auto/");
    }
  }
  return url;
};

