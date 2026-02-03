/**
 * AI Configuration
 * 
 * Central configuration for AI-powered features including OpenAI integration,
 * generation parameters, and timeout settings.
 * 
 * Users can customize these settings based on their needs and API tier.
 */

export interface AIConfig {
  /** OpenAI Configuration */
  openai: {
    /** OpenAI API model to use (e.g., "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo") */
    model: string;
    /** Maximum tokens for completion responses */
    maxTokens: number;
    /** Temperature for response creativity (0-2, lower = more focused) */
    temperature: number;
    /** Request timeout in milliseconds */
    timeout: number;
  };

  /** Generation Settings */
  generation: {
    /** Default number of tracks to generate */
    defaultTrackCount: number;
    /** Minimum allowed tracks */
    minTracks: number;
    /** Maximum allowed tracks */
    maxTracks: number;
    /** Default discovery level: 'familiar' | 'balanced' | 'discovery' */
    defaultDiscoveryLevel: 'familiar' | 'balanced' | 'discovery';
    /** Number of candidate tracks to fetch before AI ranking */
    candidatePoolSize: number;
  };

  /** Taste Profile Settings */
  tasteProfile: {
    /** Number of top artists to fetch for taste profiling */
    topArtistsCount: number;
    /** Number of top tracks to fetch for taste profiling */
    topTracksCount: number;
    /** Time range for listening history: 'short_term' | 'medium_term' | 'long_term' */
    timeRange: 'short_term' | 'medium_term' | 'long_term';
  };

  /** Preferences Storage */
  preferences: {
    /** Maximum number of vibes to store */
    maxSavedVibes: number;
    /** Maximum number of favorite genres to store */
    maxFavoriteGenres: number;
    /** TTL for preferences in localStorage (milliseconds) */
    ttl: number;
  };

  /** Match Scoring Weights */
  scoring: {
    /** Weight for taste alignment (0-1) */
    tasteWeight: number;
    /** Weight for mood fit (0-1) */
    moodWeight: number;
    /** Weight for popularity (0-1) */
    popularityWeight: number;
    /** Weight for play frequency (0-1) */
    playFrequencyWeight: number;
  };
}

/**
 * Default AI Configuration
 * 
 * Modify these values to customize AI behavior.
 * 
 * Note: Ensure all scoring weights sum to 1.0
 */
export const defaultAIConfig: AIConfig = {
  openai: {
    // Default model - change based on your needs and budget
    // Options: "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", etc.
    model: process.env.REACT_APP_OPENAI_MODEL || 'gpt-4',
    
    // Max tokens per response
    maxTokens: 2000,
    
    // Temperature (0 = focused, 2 = creative)
    temperature: 0.7,
    
    // Request timeout (30 seconds)
    timeout: 30000,
  },

  generation: {
    defaultTrackCount: 10,
    minTracks: 5,
    maxTracks: 50,
    defaultDiscoveryLevel: 'balanced',
    
    // Fetch more candidates than needed for better AI selection
    candidatePoolSize: 30,
  },

  tasteProfile: {
    topArtistsCount: 50,
    topTracksCount: 50,
    
    // 'short_term' = last 4 weeks
    // 'medium_term' = last 6 months (default)
    // 'long_term' = several years
    timeRange: 'medium_term',
  },

  preferences: {
    maxSavedVibes: 5,
    maxFavoriteGenres: 10,
    
    // 30 days TTL
    ttl: 30 * 24 * 60 * 60 * 1000,
  },

  scoring: {
    // Weights must sum to 1.0
    tasteWeight: 0.30,
    moodWeight: 0.30,
    popularityWeight: 0.25,
    playFrequencyWeight: 0.15,
  },
};

/**
 * Get AI Configuration
 * 
 * Returns the current AI configuration. Can be extended to support
 * user-customizable settings from localStorage or backend.
 */
export function getAIConfig(): AIConfig {
  // Future: Load user preferences from localStorage or API
  // For now, return default config
  return defaultAIConfig;
}

/**
 * Validate AI Configuration
 * 
 * Ensures configuration values are within acceptable ranges.
 */
export function validateAIConfig(config: AIConfig): boolean {
  // Validate scoring weights sum to 1.0
  const weightsSum = 
    config.scoring.tasteWeight +
    config.scoring.moodWeight +
    config.scoring.popularityWeight +
    config.scoring.playFrequencyWeight;

  if (Math.abs(weightsSum - 1.0) > 0.01) {
    console.error('AI Config Error: Scoring weights must sum to 1.0');
    return false;
  }

  // Validate track counts
  if (config.generation.minTracks < 1 || config.generation.maxTracks > 100) {
    console.error('AI Config Error: Track counts out of range');
    return false;
  }

  // Validate temperature
  if (config.openai.temperature < 0 || config.openai.temperature > 2) {
    console.error('AI Config Error: Temperature must be between 0 and 2');
    return false;
  }

  return true;
}
