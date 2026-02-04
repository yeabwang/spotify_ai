import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { 
  generateMusicForContext,
  getQuickVibeMood,
  analyzeEmotionFromMapClick,
  MoodAnalysis, 
  ChatMessage, 
  UserContext,
  EmotionPoint,
  TrackRecommendation,
  ConversationAnalysis
} from '../../services/ai/openai';
import { generatePlaylist } from '../../services/ai/generation';
import { buildUserContext } from '../../services/contextService';
import { querySearch } from '../../services/search';
import { Track } from '../../interfaces/track';
import { RootState } from '../store';
import type { UserTasteProfile } from '../../services/userTaste';

export interface RecommendedTrack extends TrackRecommendation {
  spotifyTrack?: Track;
  isLoading?: boolean;
  error?: string;
}

type FeedbackType = 'more' | 'less' | 'not' | 'perfect';

interface TrackFeedback {
  trackId: string;
  feedback: FeedbackType;
  weight: number;
  updatedAt: string;
}

interface TrackStats {
  plays: number;
  skips: number;
  saves: number;
  completions: number;
  lastPlayedAt?: string;
}

interface MoodMusicState {
  // Chat
  messages: ChatMessage[];
  isTyping: boolean;
  pendingMusicOffer: boolean; // AI has offered music, waiting for user response
  musicContext: string | null; // What the music is for
  
  // Mood
  currentMood: MoodAnalysis | null;
  startPoint: EmotionPoint | null;
  endPoint: EmotionPoint | null;
  isSelectingEnd: boolean;
  
  // Context
  userContext: UserContext | null;
  
  // User Taste Profile (Phase 2)
  tasteProfile: UserTasteProfile | null;
  isTasteLoading: boolean;
  tasteError: string | null;
  
  // Recommendations
  recommendations: RecommendedTrack[];
  playlistDescription: string;
  moodJourney: string;
  isLoadingRecommendations: boolean;

  // Preference optimization (Phase 6)
  feedbackByTrackId: Record<string, TrackFeedback>;
  trackStats: Record<string, TrackStats>;
  sessionReward: {
    score: number;
    plays: number;
    skips: number;
    saves: number;
    completions: number;
  };
  
  // UI
  activeTab: 'chat' | 'map' | 'vibes';
  showExplanations: boolean;
  showEmotionMap: boolean;
  expandedTrackIndex: number | null; // For reasoning drawer (Phase 3)
  
  // Saved vibes - with full context for learning
  savedVibes: Array<{
    id: string;
    name: string;
    mood: MoodAnalysis;
    createdAt: string;
    // Extended context for vibe memory
    userQuery?: string;
    trackIds?: string[];
    valence: number;
    arousal: number;
    genres?: string[];
    reasoning?: string;
  }>;
}

const initialState: MoodMusicState = {
  messages: [],
  isTyping: false,
  pendingMusicOffer: false,
  musicContext: null,
  currentMood: null,
  startPoint: null,
  endPoint: null,
  isSelectingEnd: false,
  userContext: null,
  tasteProfile: null,
  isTasteLoading: false,
  tasteError: null,
  recommendations: [],
  playlistDescription: '',
  moodJourney: '',
  isLoadingRecommendations: false,
  activeTab: 'chat',
  showExplanations: true,
  showEmotionMap: false,
  expandedTrackIndex: null,
  feedbackByTrackId: JSON.parse(localStorage.getItem('spotifyAiFeedback') || '{}'),
  trackStats: JSON.parse(localStorage.getItem('spotifyAiTrackStats') || '{}'),
  sessionReward: JSON.parse(localStorage.getItem('spotifyAiSessionReward') || '{"score":0,"plays":0,"skips":0,"saves":0,"completions":0}'),
  savedVibes: JSON.parse(localStorage.getItem('savedVibes') || '[]'),
};

// Async thunk to fetch user taste profile
export const fetchTasteProfile = createAsyncThunk<UserTasteProfile>(
  'moodMusic/fetchTasteProfile',
  async () => {
    // Dynamic import to avoid circular dependency
    const { fetchUserTasteProfile } = await import('../../services/userTaste');
    return await fetchUserTasteProfile();
  }
);

// Async thunks
export const initializeContext = createAsyncThunk<
  { context: UserContext; tasteProfile: UserTasteProfile },
  { recentlyPlayed?: string[]; topArtists?: string[]; topGenres?: string[] } | undefined
>(
  'moodMusic/initializeContext',
  async (params = {}) => {
    // Dynamic import to avoid circular dependency
    const { fetchUserTasteProfile } = await import('../../services/userTaste');
    
    // Fetch taste profile and context in parallel
    const [tasteProfile, baseContext] = await Promise.all([
      fetchUserTasteProfile(),
      buildUserContext(params?.recentlyPlayed, params?.topArtists, params?.topGenres),
    ]);
    
    // Merge taste profile into context
    const context: UserContext = {
      ...baseContext,
      tasteProfile,
    };
    
    return { context, tasteProfile };
  }
);

export const sendChatMessage = createAsyncThunk<
  { analysis: ConversationAnalysis; mood?: MoodAnalysis },
  string,
  { state: RootState }
>(
  'moodMusic/sendChatMessage',
  async (message, { getState }) => {
    const state = getState();
    const { messages, userContext, tasteProfile } = state.moodMusic;
    
    // Build context with taste profile
    const baseContext = userContext || await buildUserContext();
    const context: UserContext = {
      ...baseContext,
      tasteProfile: tasteProfile || undefined,
    };
    
    // ALWAYS generate music - we're a music app, that's what users want
    // The AI should be concise and action-oriented
    const mood = await generateMusicForContext(message, messages, context);
    
    // Create a brief response
    const briefResponse = `Here's "${mood.playlistName}" 🎵`;
    
    return { 
      analysis: { 
        shouldOfferMusic: true, 
        conversationalResponse: briefResponse,
        musicContext: message,
      }, 
      mood 
    };
  }
);

export const fetchRecommendationsForMood = createAsyncThunk<
  { recommendations: RecommendedTrack[]; description: string; journey: string },
  void,
  { state: RootState }
>(
  'moodMusic/fetchRecommendations',
  async (_, { getState }) => {
    const state = getState();
    const { currentMood, messages } = state.moodMusic;
    
    if (!currentMood) throw new Error('No mood set');
    
    // Use the generation service which follows the correct flow:
    // 1. Load preferences
    // 2. Fetch taste profile
    // 3. LLM mood analysis (already done - currentMood)
    // 4. Derive music plan
    // 5. Generate search queries
    // 6. Search Spotify (using Search API, not Recommendations API)
    // 7. LLM rank & explain
    // 8. Update preferences
    
    // Create a prompt from the mood description for the generation service
    const prompt = currentMood.moodDescription;
    
    const result = await generatePlaylist(prompt, messages, true);
    
    // Map the result to RecommendedTrack format
    const recommendations: RecommendedTrack[] = result.recommendations.map((rec, index) => ({
      ...rec,
      spotifyTrack: result.tracks[index],
      isLoading: false,
    }));

    return {
      recommendations,
      description: result.playlistDescription,
      journey: result.moodJourney,
    };
  }
);

export const searchSpotifyTrack = createAsyncThunk<
  { index: number; track: Track | null },
  { index: number; searchQuery: string }
>(
  'moodMusic/searchSpotifyTrack',
  async ({ index, searchQuery }) => {
    try {
      const response = await querySearch({
        q: searchQuery,
        type: 'track',
        limit: 1,
      });
      
      const track = response.data.tracks?.items?.[0] || null;
      return { index, track };
    } catch (error) {
      console.error('Failed to search track:', searchQuery, error);
      return { index, track: null };
    }
  }
);

export const selectEmotionFromMap = createAsyncThunk<
  MoodAnalysis,
  { startPoint: EmotionPoint; endPoint: EmotionPoint },
  { state: RootState }
>(
  'moodMusic/selectEmotionFromMap',
  async ({ startPoint, endPoint }, { getState }) => {
    const state = getState();
    const context = state.moodMusic.userContext || await buildUserContext();
    return analyzeEmotionFromMapClick(startPoint, endPoint, context);
  }
);

export const selectQuickVibe = createAsyncThunk<
  MoodAnalysis,
  string,
  { state: RootState }
>(
  'moodMusic/selectQuickVibe',
  async (vibeName, { getState }) => {
    const state = getState();
    const context = state.moodMusic.userContext || await buildUserContext();
    return getQuickVibeMood(vibeName, context);
  }
);

const moodMusicSlice = createSlice({
  name: 'moodMusic',
  initialState,
  reducers: {
    setActiveTab: (state, action: PayloadAction<'chat' | 'map' | 'vibes'>) => {
      state.activeTab = action.payload;
    },
    setStartPoint: (state, action: PayloadAction<EmotionPoint>) => {
      state.startPoint = action.payload;
      state.isSelectingEnd = true;
    },
    setEndPoint: (state, action: PayloadAction<EmotionPoint>) => {
      state.endPoint = action.payload;
      state.isSelectingEnd = false;
    },
    clearPoints: (state) => {
      state.startPoint = null;
      state.endPoint = null;
      state.isSelectingEnd = false;
    },
    toggleExplanations: (state) => {
      state.showExplanations = !state.showExplanations;
    },
    toggleEmotionMap: (state) => {
      state.showEmotionMap = !state.showEmotionMap;
    },
    setShowEmotionMap: (state, action: PayloadAction<boolean>) => {
      state.showEmotionMap = action.payload;
    },
    setExpandedTrackIndex: (state, action: PayloadAction<number | null>) => {
      state.expandedTrackIndex = action.payload;
    },
    recordTrackFeedback: (
      state,
      action: PayloadAction<{ trackId: string; feedback: FeedbackType }>
    ) => {
      const { trackId, feedback } = action.payload;
      const weightMap: Record<FeedbackType, number> = {
        more: 1,
        less: -1,
        not: -2,
        perfect: 2,
      };
      const weight = weightMap[feedback];
      state.feedbackByTrackId[trackId] = {
        trackId,
        feedback,
        weight,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('spotifyAiFeedback', JSON.stringify(state.feedbackByTrackId));
    },
    recordTrackEvent: (
      state,
      action: PayloadAction<{ trackId: string; event: 'play' | 'skip' | 'save' | 'complete' }>
    ) => {
      const { trackId, event } = action.payload;
      const stats = state.trackStats[trackId] || {
        plays: 0,
        skips: 0,
        saves: 0,
        completions: 0,
      };

      if (event === 'play') {
        stats.plays += 1;
        stats.lastPlayedAt = new Date().toISOString();
        state.sessionReward.plays += 1;
        state.sessionReward.score += 1;
      }
      if (event === 'skip') {
        stats.skips += 1;
        state.sessionReward.skips += 1;
        state.sessionReward.score -= 2;
      }
      if (event === 'save') {
        stats.saves += 1;
        state.sessionReward.saves += 1;
        state.sessionReward.score += 3;
      }
      if (event === 'complete') {
        stats.completions += 1;
        state.sessionReward.completions += 1;
        state.sessionReward.score += 4;
      }

      state.trackStats[trackId] = stats;
      localStorage.setItem('spotifyAiTrackStats', JSON.stringify(state.trackStats));
      localStorage.setItem('spotifyAiSessionReward', JSON.stringify(state.sessionReward));
    },
    resetSessionReward: (state) => {
      state.sessionReward = { score: 0, plays: 0, skips: 0, saves: 0, completions: 0 };
      localStorage.setItem('spotifyAiSessionReward', JSON.stringify(state.sessionReward));
    },
    addUserMessage: (state, action: PayloadAction<string>) => {
      state.messages.push({ role: 'user', content: action.payload });
    },
    clearChat: (state) => {
      state.messages = [];
      state.currentMood = null;
      state.recommendations = [];
      state.pendingMusicOffer = false;
      state.musicContext = null;
      state.expandedTrackIndex = null;
    },
    clearPlaylist: (state) => {
      state.currentMood = null;
      state.recommendations = [];
      state.playlistDescription = '';
      state.moodJourney = '';
      state.expandedTrackIndex = null;
    },
    saveCurrentVibe: (state, action: PayloadAction<string>) => {
      if (state.currentMood) {
        // Get the last user message as the query
        const lastUserMessage = [...state.messages].reverse().find(m => m.role === 'user')?.content;
        
        // Get track IDs from recommendations
        const trackIds = state.recommendations
          .filter(r => r.spotifyTrack)
          .map(r => r.spotifyTrack!.id);
        
        const newVibe = {
          id: Date.now().toString(),
          name: action.payload || state.currentMood.playlistName,
          mood: state.currentMood,
          createdAt: new Date().toISOString(),
          // Extended context
          userQuery: lastUserMessage,
          trackIds,
          valence: state.currentMood.endPoint?.valence ?? 0,
          arousal: state.currentMood.endPoint?.energy ?? 0.5,
          genres: state.currentMood.suggestedGenres,
          reasoning: state.currentMood.reasoning,
        };
        state.savedVibes.push(newVibe);
        localStorage.setItem('savedVibes', JSON.stringify(state.savedVibes));
      }
    },
    deleteVibe: (state, action: PayloadAction<string>) => {
      state.savedVibes = state.savedVibes.filter(v => v.id !== action.payload);
      localStorage.setItem('savedVibes', JSON.stringify(state.savedVibes));
    },
    loadSavedVibe: (state, action: PayloadAction<MoodAnalysis>) => {
      state.currentMood = action.payload;
      state.startPoint = action.payload.startPoint;
      state.endPoint = action.payload.endPoint;
    },
  },
  extraReducers: (builder) => {
    builder
      // Initialize context with taste profile
      .addCase(initializeContext.pending, (state) => {
        state.isTasteLoading = true;
        state.tasteError = null;
      })
      .addCase(initializeContext.fulfilled, (state, action) => {
        state.userContext = action.payload.context;
        state.tasteProfile = action.payload.tasteProfile;
        state.isTasteLoading = false;
      })
      .addCase(initializeContext.rejected, (state, action) => {
        state.isTasteLoading = false;
        state.tasteError = action.error.message || 'Failed to load taste profile';
      })
      
      // Fetch taste profile separately
      .addCase(fetchTasteProfile.pending, (state) => {
        state.isTasteLoading = true;
        state.tasteError = null;
      })
      .addCase(fetchTasteProfile.fulfilled, (state, action) => {
        state.tasteProfile = action.payload;
        state.isTasteLoading = false;
        // Also update userContext if it exists
        if (state.userContext) {
          state.userContext.tasteProfile = action.payload;
        }
      })
      .addCase(fetchTasteProfile.rejected, (state, action) => {
        state.isTasteLoading = false;
        state.tasteError = action.error.message || 'Failed to load taste profile';
      })
      
      // Send chat message
      .addCase(sendChatMessage.pending, (state) => {
        state.isTyping = true;
      })
      .addCase(sendChatMessage.fulfilled, (state, action) => {
        state.isTyping = false;
        const { analysis, mood } = action.payload;
        
        state.messages.push({ role: 'assistant', content: analysis.conversationalResponse });
        
        if (mood) {
          // User wanted music, we generated it
          state.currentMood = mood;
          state.startPoint = mood.startPoint;
          state.endPoint = mood.endPoint;
          state.pendingMusicOffer = false;
          state.musicContext = null;
        } else if (analysis.shouldOfferMusic) {
          // AI is offering music
          state.pendingMusicOffer = true;
          state.musicContext = analysis.musicContext || analysis.detectedActivity || analysis.detectedMood || null;
        }
      })
      .addCase(sendChatMessage.rejected, (state) => {
        state.isTyping = false;
        state.messages.push({ 
          role: 'assistant', 
          content: "Oops, I hit a little snag there! What were you saying?" 
        });
      })
      
      // Fetch recommendations
      .addCase(fetchRecommendationsForMood.pending, (state) => {
        state.isLoadingRecommendations = true;
      })
      .addCase(fetchRecommendationsForMood.fulfilled, (state, action) => {
        state.isLoadingRecommendations = false;
        state.recommendations = action.payload.recommendations;
        state.playlistDescription = action.payload.description;
        state.moodJourney = action.payload.journey;
      })
      .addCase(fetchRecommendationsForMood.rejected, (state) => {
        state.isLoadingRecommendations = false;
      })
      
      // Search Spotify track
      .addCase(searchSpotifyTrack.fulfilled, (state, action) => {
        const { index, track } = action.payload;
        if (state.recommendations[index]) {
          state.recommendations[index].spotifyTrack = track || undefined;
          state.recommendations[index].isLoading = false;
          if (!track) {
            state.recommendations[index].error = 'Track not found';
          }
        }
      })
      
      // Select from emotion map
      .addCase(selectEmotionFromMap.pending, (state) => {
        state.isTyping = true;
      })
      .addCase(selectEmotionFromMap.fulfilled, (state, action) => {
        state.isTyping = false;
        state.currentMood = action.payload;
      })
      
      // Quick vibe
      .addCase(selectQuickVibe.pending, (state) => {
        state.isTyping = true;
      })
      .addCase(selectQuickVibe.fulfilled, (state, action) => {
        state.isTyping = false;
        state.currentMood = action.payload;
        state.startPoint = action.payload.startPoint;
        state.endPoint = action.payload.endPoint;
      });
  },
});

export const {
  setActiveTab,
  setStartPoint,
  setEndPoint,
  clearPoints,
  toggleExplanations,
  toggleEmotionMap,
  setShowEmotionMap,
  setExpandedTrackIndex,
  recordTrackFeedback,
  recordTrackEvent,
  resetSessionReward,
  addUserMessage,
  clearChat,
  clearPlaylist,
  saveCurrentVibe,
  deleteVibe,
  loadSavedVibe,
} = moodMusicSlice.actions;

export default moodMusicSlice.reducer;
