import * as Location from "expo-location";
import { supabase } from "./supabase";

/**
 * Request location permissions and get current city/country
 */
export async function detectUserLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      console.log("Location permission denied");
      return null;
    }

    const location = await Location.getCurrentPositionAsync({});
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (reverseGeocode.length > 0) {
      const { city, region, country } = reverseGeocode[0];
      return {
        city: city || null,
        state: region || null,
        country: country || null,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }
    return null;
  } catch (error) {
    console.error("Error detecting location:", error);
    return null;
  }
}

/**
 * Detect and save user location to user_preferences
 */
export async function detectAndSaveUserLocation(userId: string) {
  const locationData = await detectUserLocation();
  if (!locationData) return;

  try {
    const { error } = await supabase
      .from("user_preferences")
      .upsert({
        user_id: userId,
        city: locationData.city,
        state: locationData.state,
        country: locationData.country,
        last_noted_lat: locationData.latitude,
        last_noted_lng: locationData.longitude,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) throw error;
    console.log("✅ User location saved:", locationData.city);
  } catch (error) {
    console.error("Error saving user location:", error);
  }
}
