import { supabase } from "./supabase";

export const sendPush = (
  userIdOrIds: string | string[],
  title: string,
  body: string,
  data: Record<string, any> = {}
) => {
  const payload =
    typeof userIdOrIds === "string"
      ? { user_id: userIdOrIds, title, body, data }
      : { user_ids: userIdOrIds, title, body, data };

  supabase.functions
    .invoke("send-push-notification", { body: payload })
    .catch((err) => console.log("Push (non-fatal):", err));
};