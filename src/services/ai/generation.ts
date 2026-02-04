/**
 * AI Music Generation Service
 * 
 * This service provides AI-powered playlist generation using OpenAI's LLM
 * combined with Spotify's music catalog and user's listening history.
 * 
 * FEATURES:
 * 1. User Preference Management - Saves and loads user's music preferences (vibes, genres, energy levels)
 * 2. Taste Profile Integration - Uses Spotify listening history to personalize recommendations
 * 3. AI-Powered Generation - Sends user context + preferences + prompt to LLM for intelligent track selection
 * 4. Automatic Track Fetching - Searches Spotify for recommended tracks and ranks them
 * 5. Preference Learning - Updates user preferences based on successful generations
 * 
 * USAGE EXAMPLE:
 * 
 * ```typescript
 * import { generationService } from './services/ai/generation';
 * 
 * // Generate a new playlist
 * const result = await generationService.generatePlaylist(
 *   "I need some energetic music for working out",
 *   [], // conversation history (optional)
 *   true // use saved preferences
 * );
 * 
 * // Result contains:
 * // - tracks: Array of Spotify Track objects ready to play
 * // - recommendations: Detailed explanations for each track
 * // - moodAnalysis: AI's interpretation of the request
 * // - playlistDescription: Overall description
 * 
 * // Regenerate with same preferences but new tracks
 * const newResult = await generationService.regeneratePlaylist();
 * 
 * // Update preferences
 * generationService.updatePreferenceSetting('discoveryLevel', 'discovery');
 * generationService.updatePreferenceSetting('playlistLength', 15);
 * 
 * // Get current preferences
 * const prefs = generationService.getPreferences();
 * ```
 * 
 * WORKFLOW:
 * 1. User sends a prompt (e.g., "relaxing evening music")
 * 2. Service loads user's taste profile from Spotify
 * 3. Service loads saved preferences from localStorage
 * 4. LLM analyzes the mood and creates a music plan
 * 5. LLM generates search queries for tracks
 * 6. Service searches Spotify for candidate tracks
 * 7. LLM ranks and explains the best matches
 * 8. Service returns final playlist with detailed reasoning
 * 9. User preferences are updated based on the generation
 */

import { userTasteService, UserTasteProfile } from '../userTaste';
import { playerService } from '../player';
import { querySearch } from '../search';
import { getAIConfig } from '../../config/ai.config';
import { 
  analyzeMoodFromChat, 
  generatePlaylistRecommendations,
  MoodAnalysis,
  TrackRecommendation,
  UserContext,
  ChatMessage,
  deriveMusicPlan,
  rankAndExplainCandidates,
  CandidateTrack,
} from './openai';
import type { Track } from '../../interfaces/track';
import { 
  setLocalStorageWithExpiry, 
  getFromLocalStorageWithExpiry 
} from '../../utils/localstorage';

const config = getAIConfig();

/**
 * User's saved generation preferences/vibe
 */
export interface UserGenerationPreferences {
  // User's preferred vibe/mood settings
  preferredVibes: string[];
  favoriteGenres: string[];
  energyPreference: number; // 0-1
  valencePreference: number; // -1 to 1
  discoveryLevel: 'familiar' | 'balanced' | 'discovery';
  
  // Generation history
  lastGeneratedAt?: string;
  totalGenerations: number;
  
  // Custom settings
  playlistLength: number; // default 10
  explicitContent: boolean;
  
  // Last successful generation context
  lastPrompt?: string;
  lastMoodAnalysis?: MoodAnalysis;
}

/**
 * Result of a generation request
 */
export interface GenerationResult {
  tracks: Track[];
  recommendations: TrackRecommendation[];
  moodAnalysis: MoodAnalysis;
  playlistDescription: string;
  moodJourney: string;
  generatedAt: string;
}

/**
 * Storage keys for preferences
 */
const PREFERENCES_KEY = 'spotify_ai_generation_preferences';
const PREFERENCES_TTL = config.preferences.ttl;

/**
 * Get default preferences
 */
const getDefaultPreferences = (): UserGenerationPreferences => ({
  preferredVibes: [],
  favoriteGenres: [],
  energyPreference: 0.6,
  valencePreference: 0.5,
  discoveryLevel: config.generation.defaultDiscoveryLevel,
  totalGenerations: 0,
  playlistLength: config.generation.defaultTrackCount,
  explicitContent: true,
});

/**
 * Load user generation preferences from localStorage
 */
export const loadUserPreferences = (): UserGenerationPreferences => {
  const saved = getFromLocalStorageWithExpiry(PREFERENCES_KEY);
  if (saved) {
    return { ...getDefaultPreferences(), ...saved };
  }
  return getDefaultPreferences();
};

/**
 * Save user generation preferences to localStorage
 */
export const saveUserPreferences = (preferences: Partial<UserGenerationPreferences>): void => {
  const current = loadUserPreferences();
  const updated = { ...current, ...preferences };
  setLocalStorageWithExpiry(PREFERENCES_KEY, updated, PREFERENCES_TTL);
};

/**
 * Update user's vibe preferences based on successful generation
 */
export const updateVibePreferences = (
  moodAnalysis: MoodAnalysis,
  genres: string[]
): void => {
  const current = loadUserPreferences();
  
  // Add new genres to favorites (keep configured max)
  const updatedGenres = Array.from(new Set([...genres, ...current.favoriteGenres]))
    .slice(0, config.preferences.maxFavoriteGenres);
  
  // Add mood description as a vibe if not already present
  const updatedVibes = current.preferredVibes.includes(moodAnalysis.moodDescription)
    ? current.preferredVibes
    : [...current.preferredVibes, moodAnalysis.moodDescription].slice(-config.preferences.maxSavedVibes);
  
  // Update energy/valence preferences (weighted average)
  const newEnergyPref = (current.energyPreference * 0.7) + (moodAnalysis.endPoint.energy * 0.3);
  const newValencePref = (current.valencePreference * 0.7) + (moodAnalysis.endPoint.valence * 0.3);
  
  saveUserPreferences({
    preferredVibes: updatedVibes,
    favoriteGenres: updatedGenres,
    energyPreference: Math.max(0, Math.min(1, newEnergyPref)),
    valencePreference: Math.max(-1, Math.min(1, newValencePref)),
  });
};

/**
 * Get current user context for AI generation
 */
const getUserContext = async (tasteProfile?: UserTasteProfile): Promise<UserContext> => {
  const now = new Date();
  const hour = now.getHours();
  
  let timeOfDay = 'morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 6) timeOfDay = 'night';
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getDay()];
  
  // Try to get recently played tracks (reduced to avoid overwhelming the prompt)
  let recentlyPlayed: string[] = [];
  try {
    const recent = await playerService.getRecentlyPlayed({ limit: 5 });
    recentlyPlayed = recent.items.map((item: any) => 
      `${item.track.name} by ${item.track.artists.map((a: any) => a.name).join(', ')}`
    );
  } catch (error) {
    console.warn('Could not fetch recently played:', error);
  }
  
  return {
    timeOfDay,
    dayOfWeek,
    recentlyPlayed,
    topArtists: tasteProfile?.topArtists.map(a => a.name).slice(0, 5) || [],
    topGenres: tasteProfile?.topGenres.slice(0, 8) || [],
    tasteProfile,
  };
};

/**
 * Fetch candidate tracks from Spotify based on search queries
 */
const fetchCandidateTracksFromSpotify = async (
  searchQueries: string[],
  limit: number = 3
): Promise<Map<string, Track[]>> => {
  const results = new Map<string, Track[]>();
  
  // Filter out invalid queries
  const validQueries = searchQueries.filter(q => q && q.trim() && q !== 'Unknown Track');
  console.log(`🔍 [Spotify] Searching for ${validQueries.length} tracks (${searchQueries.length} total, ${searchQueries.length - validQueries.length} invalid)...`);
  
  for (let i = 0; i < validQueries.length; i++) {
    const query = validQueries[i];
    console.log(`  [${i + 1}/${validQueries.length}] Searching: "${query}"`);
    
    try {
      const searchResult = await querySearch({
        q: query,
        type: 'track',
        limit: limit,
      });
      
      const items = searchResult.data.tracks?.items || [];
      console.log(`    → Found ${items.length} results`);
      
      if (items.length > 0) {
        results.set(query, items);
      } else {
        console.log(`    ⚠️ No results for: "${query}"`);
      }
    } catch (error: any) {
      console.error(`    ❌ Search failed for "${query}":`, error?.message || error);
    }
    
    // Delay between requests to avoid rate limiting (200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`✅ [Spotify] ${results.size}/${validQueries.length} queries returned results`);
  return results;
};

/**
 * Convert Spotify tracks to candidate format for LLM ranking
 */
const convertToCandidates = (tracks: Track[]): CandidateTrack[] => {
  return tracks.map(track => ({
    id: track.id,
    name: track.name,
    artists: track.artists.map(a => a.name),
    album: track.album?.name,
    popularity: track.popularity,
  }));
};

/**
 * Calculate overall match score from multiple factors
 * Uses weights from config: taste, mood, popularity, playFrequency
 */
const calculateOverallMatch = (
  tasteScore: number,
  moodScore: number,
  popularity: number = 50,
  trackName: string,
  artistNames: string[],
  recentlyPlayed: string[] = []
): number => {
  // Normalize popularity (0-100 scale)
  const popularityScore = Math.min(100, popularity);
  
  // Calculate play frequency score based on recently played
  // Check if this track or artist appears in recently played
  let playFrequencyScore = 0;
  
  if (recentlyPlayed.length > 0) {
    const trackLower = trackName.toLowerCase();
    const artistsLower = artistNames.map(a => a.toLowerCase());
    
    for (const recentTrack of recentlyPlayed) {
      const recentLower = recentTrack.toLowerCase();
      
      // Exact track match = 100 points
      if (recentLower.includes(trackLower)) {
        playFrequencyScore = 100;
        break;
      }
      
      // Artist match = 60 points
      for (const artist of artistsLower) {
        if (recentLower.includes(artist)) {
          playFrequencyScore = Math.max(playFrequencyScore, 60);
        }
      }
    }
  }
  
  // Weighted average using config values
  const overall = (
    (tasteScore * config.scoring.tasteWeight) +
    (moodScore * config.scoring.moodWeight) +
    (popularityScore * config.scoring.popularityWeight) +
    (playFrequencyScore * config.scoring.playFrequencyWeight)
  );
  
  return Math.round(overall);
};

/**
 * Main generation function - generates playlist based on prompt
 */
export const generatePlaylist = async (
  prompt: string,
  conversationHistory: ChatMessage[] = [],
  usePreferences: boolean = true
): Promise<GenerationResult> => {
  try {
    console.log('🎵 [Generation] Starting playlist generation...');
    
    // Load user preferences
    const preferences = usePreferences ? loadUserPreferences() : getDefaultPreferences();
    console.log('✅ [Generation] Loaded preferences:', { playlistLength: preferences.playlistLength, discoveryLevel: preferences.discoveryLevel });
    
    // Fetch user's taste profile
    console.log('🔍 [Generation] Fetching user taste profile from Spotify...');
    const tasteProfile = await userTasteService.fetchUserTasteProfile();
    console.log('✅ [Generation] Taste profile loaded:', { topArtists: tasteProfile.topArtists.slice(0, 5).join(', ') });
    
    // Get current context
    const userContext = await getUserContext(tasteProfile);
    console.log('✅ [Generation] User context ready:', { timeOfDay: userContext.timeOfDay, dayOfWeek: userContext.dayOfWeek });
    
    // Step 1: Analyze mood from the prompt
    console.log('🤖 [Generation] Step 1/7: Analyzing mood with AI...');
    const moodAnalysis = await analyzeMoodFromChat(
      prompt,
      conversationHistory,
      userContext
    );
    console.log('✅ [Generation] Mood analyzed:', moodAnalysis.moodDescription);
    
    // Step 2: Derive music plan
    console.log('🤖 [Generation] Step 2/7: Creating music plan...');
    const musicPlan = await deriveMusicPlan(moodAnalysis, userContext);
    console.log('✅ [Generation] Plan ready:', musicPlan.intentSummary);
    
    // Step 3: Generate initial search queries from LLM
    console.log('🤖 [Generation] Step 3/7: Generating track recommendations...');
    const initialRecommendations = await generatePlaylistRecommendations(
      moodAnalysis,
      userContext,
      preferences.playlistLength
    );
    console.log('✅ [Generation] Got', initialRecommendations.tracks.length, 'track suggestions');
    
    // Step 4: Fetch candidate tracks from Spotify for each search query
    console.log('🎧 [Generation] Step 4/7: Searching Spotify for tracks...');
    const searchQueries = initialRecommendations.tracks.map(rec => rec.searchQuery);
    console.log('🔍 [Generation] Search queries:', searchQueries);
    const candidatesByQuery = await fetchCandidateTracksFromSpotify(searchQueries, 3);
    console.log('✅ [Generation] Found', candidatesByQuery.size, 'query results');
    
    // Step 5: Flatten all candidates for ranking
    console.log('📊 [Generation] Step 5/7: Processing candidates...');
    const allCandidates: CandidateTrack[] = [];
    Array.from(candidatesByQuery.values()).forEach(tracks => {
      allCandidates.push(...convertToCandidates(tracks));
    });
    
    // Remove duplicates by ID
    const uniqueCandidates = Array.from(
      new Map(allCandidates.map(c => [c.id, c])).values()
    );
    console.log('✅ [Generation] Got', uniqueCandidates.length, 'unique candidates');
    
    // Step 6: Let LLM rank and explain the candidates
    console.log('🤖 [Generation] Step 6/7: AI ranking and explaining tracks (this may take 30-60 seconds)...');
    const rankedPlaylist = await rankAndExplainCandidates(
      uniqueCandidates,
      musicPlan,
      moodAnalysis,
      userContext,
      preferences.playlistLength
    );
    console.log('✅ [Generation] Ranked', rankedPlaylist.tracks.length, 'tracks');
    
    // Step 7: Build final track list based on LLM selections
    console.log('📝 [Generation] Step 7/7: Building final playlist...');
    const finalTracks: Track[] = [];
    const trackMap = new Map<string, Track>();
    const finalRecommendations: TrackRecommendation[] = [];
    
    // Create a map of all fetched tracks
    candidatesByQuery.forEach(tracks => {
      tracks.forEach(track => trackMap.set(track.id, track));
    });
    
    // Get recently played track IDs for play frequency calculation
    const recentTrackIds = userContext.recentlyPlayed || [];
    
    // Get tracks in the order specified by LLM with their recommendations
    for (const rec of rankedPlaylist.tracks) {
      if (rec.spotifyId && trackMap.has(rec.spotifyId)) {
        const track = trackMap.get(rec.spotifyId)!;
        finalTracks.push(track);
        
        // Ensure recommendation has all required fields with GUARANTEED valid scores
        // Extract and validate scores with strong defaults
        const tasteScore = typeof rec.tasteAlignment?.score === 'number' && !isNaN(rec.tasteAlignment.score)
          ? Math.max(0, Math.min(100, rec.tasteAlignment.score))
          : 75;
        
        const moodScore = typeof rec.moodFit?.score === 'number' && !isNaN(rec.moodFit.score)
          ? Math.max(0, Math.min(100, rec.moodFit.score))
          : 80;
        
        const tasteAlignment = {
          score: tasteScore,
          matchedArtists: rec.tasteAlignment?.matchedArtists || [],
          matchedGenres: rec.tasteAlignment?.matchedGenres || [],
          explanation: rec.tasteAlignment?.explanation || 'Matches your music style'
        };
        
        const moodFit = {
          score: moodScore,
          explanation: rec.moodFit?.explanation || 'Fits the requested vibe'
        };
        
        // Calculate overall match score - GUARANTEED to be a number
        const overallMatch = calculateOverallMatch(
          tasteScore,
          moodScore,
          track.popularity || 50,
          track.name,
          track.artists.map(a => a.name),
          recentTrackIds
        );
        
        finalRecommendations.push({
          ...rec,
          tasteAlignment,
          moodFit,
          reasoningBullets: rec.reasoningBullets?.length > 0 
            ? rec.reasoningBullets 
            : [rec.reason || 'Selected for this mood'],
          overallMatch
        });
      }
    }
    
    // If we don't have enough tracks, fill with the best candidates
    if (finalTracks.length < preferences.playlistLength) {
      const remainingIds = new Set(finalTracks.map(t => t.id));
      const allTracksArray = Array.from(trackMap.values());
      let position = finalTracks.length + 1;
      
      for (const track of allTracksArray) {
        if (!remainingIds.has(track.id) && finalTracks.length < preferences.playlistLength) {
          finalTracks.push(track);
          remainingIds.add(track.id);
          
          // Add a default recommendation for filler tracks with GUARANTEED scores
          const tasteScore = 70;
          const moodScore = 75;
          const overallMatch = calculateOverallMatch(
            tasteScore,
            moodScore,
            track.popularity || 50,
            track.name,
            track.artists.map(a => a.name),
            recentTrackIds
          );
          
          finalRecommendations.push({
            spotifyId: track.id,
            searchQuery: `${track.name} ${track.artists[0].name}`,
            reason: 'Additional track that fits the vibe',
            targetEnergy: moodAnalysis.endPoint.energy,
            targetValence: moodAnalysis.endPoint.valence,
            position: position++,
            reasoningBullets: ['Complements the playlist mood'],
            tasteAlignment: {
              score: tasteScore,
              matchedArtists: [],
              matchedGenres: [],
              explanation: 'Good fit for the overall vibe'
            },
            moodFit: {
              score: moodScore,
              explanation: 'Matches the playlist energy'
            },
            discoveryLevel: 'balanced' as const,
            overallMatch
          });
        }
      }
    }
    
    // Step 8: Update preferences based on successful generation
    if (usePreferences && finalTracks.length > 0) {
      updateVibePreferences(moodAnalysis, moodAnalysis.suggestedGenres);
      saveUserPreferences({
        lastPrompt: prompt,
        lastMoodAnalysis: moodAnalysis,
        lastGeneratedAt: new Date().toISOString(),
        totalGenerations: preferences.totalGenerations + 1,
      });
    }
    
    // Final validation: Ensure ALL recommendations have required scores
    const validatedRecommendations = finalRecommendations.map((rec, _index) => {
      // Double-check scores are valid numbers
      const tasteScore = typeof rec.tasteAlignment?.score === 'number' && !isNaN(rec.tasteAlignment.score)
        ? rec.tasteAlignment.score
        : 75;
      
      const moodScore = typeof rec.moodFit?.score === 'number' && !isNaN(rec.moodFit.score)
        ? rec.moodFit.score
        : 80;
      
      // Recalculate overall match if missing or invalid
      const overallMatch = typeof rec.overallMatch === 'number' && !isNaN(rec.overallMatch)
        ? rec.overallMatch
        : Math.round((tasteScore + moodScore) / 2); // Simple average as fallback
      
      return {
        ...rec,
        tasteAlignment: {
          score: tasteScore,
          matchedArtists: rec.tasteAlignment?.matchedArtists || [],
          matchedGenres: rec.tasteAlignment?.matchedGenres || [],
          explanation: rec.tasteAlignment?.explanation || 'Matches your music style'
        },
        moodFit: {
          score: moodScore,
          explanation: rec.moodFit?.explanation || 'Fits the requested vibe'
        },
        overallMatch
      };
    });
    
    console.log('✅ [Generation] Playlist complete! Generated', finalTracks.length, 'tracks');
    console.log('🎉 [Generation] Total time: Check network tab for timing details');
    
    return {
      tracks: finalTracks,
      recommendations: validatedRecommendations,
      moodAnalysis,
      playlistDescription: rankedPlaylist.playlistDescription,
      moodJourney: rankedPlaylist.moodJourney,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ [Generation] Failed to generate playlist:', error);
    throw new Error('Failed to generate playlist. Please try again.');
  }
};

/**
 * Regenerate playlist with same preferences but new selections
 */
export const regeneratePlaylist = async (
  conversationHistory: ChatMessage[] = []
): Promise<GenerationResult> => {
  const preferences = loadUserPreferences();
  
  if (!preferences.lastPrompt) {
    throw new Error('No previous generation found. Please create a new playlist first.');
  }
  
  // Use the last prompt to regenerate
  return generatePlaylist(preferences.lastPrompt, conversationHistory, true);
};

/**
 * Update specific preference settings
 */
export const updatePreferenceSetting = (
  key: keyof UserGenerationPreferences,
  value: any
): void => {
  const preferences = loadUserPreferences();
  saveUserPreferences({
    ...preferences,
    [key]: value,
  });
};

/**
 * Get current preference settings
 */
export const getPreferences = (): UserGenerationPreferences => {
  return loadUserPreferences();
};

/**
 * Reset preferences to default
 */
export const resetPreferences = (): void => {
  localStorage.removeItem(PREFERENCES_KEY);
};

/**
 * Export service object
 */
export const generationService = {
  generatePlaylist,
  regeneratePlaylist,
  loadUserPreferences,
  saveUserPreferences,
  updateVibePreferences,
  updatePreferenceSetting,
  getPreferences,
  resetPreferences,
};
