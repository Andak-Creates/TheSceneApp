import { Platform, Share } from "react-native";

/**
 * Shortens a URL using TinyURL.
 * Falls back to the original URL if it fails or timeouts.
 */
export async function shortenUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);

    if (response.ok) {
      const shortUrl = await response.text();
      if (shortUrl.startsWith("http")) {
        return shortUrl;
      }
    }
  } catch (error) {
    console.warn("URL shortening failed, falling back to full URL:", error);
  }
  return url;
}

/**
 * Opens the native share sheet for a party.
 */
export async function shareParty(partyId: string, partyTitle: string) {
  const fullUrl = `https://thescene.vercel.app/party/${partyId}`;
  
  // Show the share sheet immediately with the full URL as a placeholder
  // or wait for the short URL. Given its a better UX, we'll try to shorten first.
  const shareUrl = await shortenUrl(fullUrl);

  const message = `Check out "${partyTitle}" on TheScene! ${shareUrl}`;

  try {
    await Share.share({
      message,
      // On iOS, providing both message and url can lead to duplication in some apps.
      // We'll only provide the URL property on non-web platforms if we want the 
      // native link preview, but if we include it in the message, it's often enough.
      url: Platform.OS === "ios" ? undefined : shareUrl,
      title: partyTitle,
    });
  } catch (error) {
    // User cancelled or share failed
  }
}
