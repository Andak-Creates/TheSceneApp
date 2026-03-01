import * as Localization from "expo-localization";
import { supabase } from "./supabase";

// Map region codes to currency codes
const REGION_TO_CURRENCY: Record<string, string> = {
  US: "USD", CA: "USD", AU: "AUD", GB: "GBP",
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR",
  EU: "EUR", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
  NL: "EUR", BE: "EUR", PT: "EUR", AT: "EUR", IE: "EUR",
  JP: "JPY", CN: "CNY", IN: "INR",
  SN: "XOF", CI: "XOF", BF: "XOF", ML: "XOF",
};

/**
 * Detect device region and map to a currency code
 */
export function detectRegionCurrency(): string {
  try {
    const locales = Localization.getLocales();
    if (locales && locales.length > 0) {
      const region = locales[0].regionCode;
      if (region && REGION_TO_CURRENCY[region]) {
        return REGION_TO_CURRENCY[region];
      }
    }
  } catch (e) {
    console.log("Could not detect locale:", e);
  }
  return "NGN"; // Default fallback
}

/**
 * Detect region currency and save to user_preferences if not already set.
 * Call this after login/signup.
 */
export async function detectAndSaveRegionCurrency(userId: string): Promise<string> {
  try {
    // Check if user already has a currency preference
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("preferred_currency")
      .eq("user_id", userId)
      .single();

    // If they already have one, respect it
    if (existing?.preferred_currency) {
      return existing.preferred_currency;
    }

    const currency = detectRegionCurrency();

    // Upsert the preference
    await supabase.from("user_preferences").upsert({
      user_id: userId,
      preferred_currency: currency,
    }, { onConflict: "user_id" });

    return currency;
  } catch (e) {
    console.error("Error saving region currency:", e);
    return "USD";
  }
}

/**
 * Currency conversion and formatting utilities
 */

export interface CurrencyRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  updated_at: string;
}

// Common currency symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
  NGN: "₦",
  KES: "KSh",
  ZAR: "R",
  GHS: "₵",
  CAD: "CA$",
  AUD: "A$",
};

/**
 * Convert price from one currency to another
 */
export async function convertPrice(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number> {
  // If same currency, no conversion needed
  if (fromCurrency === toCurrency) {
    return amount;
  }

  try {
    // Fetch conversion rate from database
    const { data, error } = await supabase
      .from("currency_rates")
      .select("rate")
      .eq("base_currency", fromCurrency)
      .eq("target_currency", toCurrency)
      .single();

    if (error) {
      console.error("Currency conversion error:", error);
      // Fallback: return original amount if conversion fails
      return amount;
    }

    return amount * data.rate;
  } catch (error) {
    console.error("Currency conversion error:", error);
    return amount;
  }
}

/**
 * Format currency with proper symbol and locale
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  options?: {
    showCode?: boolean;
    decimals?: number;
  }
): string {
  const { showCode = false, decimals = 2 } = options || {};

  const symbol = getCurrencySymbol(currencyCode);
  const formattedAmount = amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (showCode) {
    return `${symbol}${formattedAmount} ${currencyCode}`;
  }

  return `${symbol}${formattedAmount}`;
}

/**
 * Get currency symbol for a currency code
 */
export function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
}

/**
 * Get user's preferred currency from preferences
 */
export async function getUserCurrency(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("preferred_currency")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return "USD"; // Default fallback
    }

    return data.preferred_currency || "USD";
  } catch (error) {
    console.error("Error fetching user currency:", error);
    return "USD";
  }
}

/**
 * Update currency rates (call this periodically via cron or API)
 */
export async function updateCurrencyRates(
  rates: Array<{ from: string; to: string; rate: number }>
): Promise<void> {
  try {
    const updates = rates.map((r) => ({
      base_currency: r.from,
      target_currency: r.to,
      rate: r.rate,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("currency_rates").upsert(updates, {
      onConflict: "base_currency,target_currency",
    });

    if (error) {
      console.error("Error updating currency rates:", error);
    }
  } catch (error) {
    console.error("Error updating currency rates:", error);
  }
}

/**
 * Fetch all available currencies
 */
export async function getAvailableCurrencies(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("currency_rates")
      .select("target_currency")
      .eq("base_currency", "USD");

    if (error || !data) {
      return ["USD"];
    }

    return data.map((d) => d.target_currency);
  } catch (error) {
    console.error("Error fetching currencies:", error);
    return ["USD"];
  }
}

/**
 * Convert and format price for display
 */
export async function convertAndFormatPrice(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  options?: {
    showCode?: boolean;
    decimals?: number;
  }
): Promise<string> {
  const converted = await convertPrice(amount, fromCurrency, toCurrency);
  return formatCurrency(converted, toCurrency, options);
}
