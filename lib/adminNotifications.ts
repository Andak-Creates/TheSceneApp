import { supabase } from "./supabase";
import { sendPush } from "./sendPush";

/**
 * Notifies all admins about a high-priority event.
 * Targets users with is_admin = true in the profiles table.
 */
export const notifyAdmins = async (
  title: string,
  body: string,
  data: Record<string, any> = {}
) => {
  try {
    // 1. Get all admin IDs
    const { data: admins, error: adminError } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_admin", true);

    if (adminError || !admins || admins.length === 0) {
      console.log("No admins found to notify.");
      return;
    }

    const adminIds = admins.map((a) => a.id);

    // 2. Trigger push notifications for all admins
    sendPush(adminIds, title, body, {
       ...data,
       admin_alert: true,
       type: "admin_notification"
    });

    console.log(`Sent push notification to ${adminIds.length} admins.`);

    // Note: The database trigger we added will handle creating the 
    // in-app notification records (bell icon) automatically.
  } catch (err) {
    console.error("Failed to notify admins:", err);
  }
};
