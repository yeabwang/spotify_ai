/**
 * API Keys Service
 * 
 * Manages user-provided API keys in localStorage.
 * Keys are stored with simple obfuscation (NOT true encryption - only prevents casual viewing).
 * 
 * IMPORTANT: This is client-side storage with inherent limitations:
 * - Keys are stored in the browser and can be extracted by determined users
 * - For production deployments, consider using a backend proxy for API calls
 * - Never expose API keys in network requests visible to users
 * - The obfuscation used here is reversible and should not be considered secure
 * 
 * Note: Spotify Client ID and Redirect URL should be configured via environment variables.
 * Users provide their OpenAI API key through the Settings page.
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
 * Check if Spotify is configured (via environment variables)
 */
export const isSpotifyConfigured = (): boolean => {
  return !!getSpotifyClientId();
};

/**
 * Check if AI features are configured (OpenAI API key)
 */
export const isAIConfigured = (): boolean => {
  return !!getOpenAIApiKey();
};

/**
 * Check if all required keys are configured
 * Returns separate status for Spotify and AI features
 */
export const isFullyConfigured = (): { 
  configured: boolean; 
  missing: string[];
  spotifyConfigured: boolean;
  aiConfigured: boolean;
} => {
  const missing: string[] = [];
  const spotifyConfigured = isSpotifyConfigured();
  const aiConfigured = isAIConfigured();
  
  if (!spotifyConfigured) missing.push('Spotify Client ID (environment variable)');
  if (!aiConfigured) missing.push('OpenAI API Key');
  
  return {
    configured: missing.length === 0,
    missing,
    spotifyConfigured,
    aiConfigured,
  };
};
