/**
 * Helper to transform Supabase developer-side errors into user-friendly messages.
 * Specifically handles quota exceeded or restricted project errors.
 */
export const getFriendlyErrorMessage = (error: any): string => {
  if (!error) return "";
  
  // Supabase errors can be in .message or .error_description or just a string
  let message = "";
  if (typeof error === 'string') {
    message = error;
  } else {
    message = error.message || error.error_description || (typeof error === 'object' ? JSON.stringify(error) : String(error));
  }
  
  const lowMessage = message.toLowerCase();
  
  // Aggressively catch any system-level errors related to quotas or restrictions
  if (
    lowMessage.includes("quota") ||
    lowMessage.includes("limit") ||
    lowMessage.includes("restricted") ||
    lowMessage.includes("read-only") ||
    lowMessage.includes("database") ||
    lowMessage.includes("violation") ||
    lowMessage.includes("egress") ||
    lowMessage.includes("supabase.help") ||
    lowMessage.includes("unauthorized")
  ) {
    return "Platform currently under maintenance, please try again later";
  }
  
  return message;
};
