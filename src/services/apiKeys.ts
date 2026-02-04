/**
 * API Keys Service
 * 
 * Securely manages user-provided API keys in localStorage.
 * Keys are stored encrypted using a simple obfuscation (for basic protection).
 * 
 * Note: Spotify Client ID and Redirect URL are pre-configured via environment variables.
 * Users only need to provide their OpenAI API key.
 */

const STORAGE_KEY = 'spotify_ai_keys';

export interface APIKeys {
  openaiApiKey?: string;
}

// Simple obfuscation (not true encryption, but prevents casual viewing)
const obfuscate = (text: string): string => {
  return btoa(text.split('').reverse().join(''));
};

const deobfuscate = (text: string): string => {
  try {
    return atob(text).split('').reverse().join('');
  } catch {
    return '';
  }
};

/**
 * Save API keys to localStorage
 */
export const saveAPIKeys = (keys: APIKeys): void => {
  const stored: Record<string, string> = {};
  
  if (keys.openaiApiKey) {
    stored.openaiApiKey = obfuscate(keys.openaiApiKey);
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
};

/**
 * Load API keys from localStorage
 */
export const loadAPIKeys = (): APIKeys => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    
    const parsed = JSON.parse(stored);
    return {
      openaiApiKey: parsed.openaiApiKey ? deobfuscate(parsed.openaiApiKey) : undefined,
    };
  } catch {
    return {};
  }
};

/**
 * Clear all API keys
 */
export const clearAPIKeys = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Check if user has provided their own keys
 */
export const hasUserKeys = (): boolean => {
  const keys = loadAPIKeys();
  return !!keys.openaiApiKey;
};

/**
 * Get the Spotify Client ID (from environment)
 */
export const getSpotifyClientId = (): string => {
  return process.env.REACT_APP_SPOTIFY_CLIENT_ID || '';
};

/**
 * Get the effective OpenAI API Key (user's or env)
 */
export const getOpenAIApiKey = (): string => {
  const keys = loadAPIKeys();
  return keys.openaiApiKey || process.env.REACT_APP_OPENAI_API_KEY || '';
};

/**
 * Get the Spotify Redirect URL (from environment or default)
 */
export const getSpotifyRedirectUrl = (): string => {
  return process.env.REACT_APP_SPOTIFY_REDIRECT_URL || window.location.origin;
};

/**
 * Check if all required keys are configured
 */
export const isFullyConfigured = (): { configured: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  if (!getOpenAIApiKey()) missing.push('OpenAI API Key');
  
  return {
    configured: missing.length === 0,
    missing,
  };
};
