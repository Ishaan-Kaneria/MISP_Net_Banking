import type { Language } from "./types";

export const LANGUAGES: ReadonlyArray<readonly [Language, string]> = [
  ["en", "English"],
  ["hi", "हिंदी"],
  ["gu", "ગુજરાતી"],
] as const;

const STORAGE_KEY = "mispbank_lang";

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(([code]) => code === value);

/**
 * The language the customer picked on this device, if any.
 *
 * Onboarding (sign-in and KYC) happens before there is an account to read a
 * preference from, so the choice has to live here to survive the trip into the
 * dashboard. A stored choice is an explicit action by the customer and beats
 * the `lang` on their account record -- otherwise someone who deliberately
 * switched to Gujarati on the sign-in screen would be flipped back to their
 * account's stored language the moment the dashboard loaded.
 */
export function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    // Private browsing / storage disabled: fall back to the account default
    // rather than crashing the first screen of the app.
    return null;
  }
}

export function rememberLanguage(language: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* storage unavailable -- the in-memory choice still applies for this session */
  }
}
