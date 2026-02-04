import OpenAI from 'openai';
import { UserTasteProfile, formatTasteProfileForAI } from '../userTaste';
import { getAIConfig } from '../../config/ai.config';

const config = getAIConfig();

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Note: In production, use a backend proxy
  timeout: config.openai.timeout,
});

export interface EmotionPoint {
  valence: number; // -1 to 1 (negative to positive)
  energy: number;  // 0 to 1 (calm to energetic)
}

export interface MoodAnalysis {
  startPoint: EmotionPoint;
  endPoint: EmotionPoint;
  moodDescription: string;
  reasoning: string;
  suggestedGenres: string[];
  playlistName: string;
  shouldAskFollowUp: boolean;
  followUpQuestion?: string;
}

/**
 * Enhanced track recommendation with detailed reasoning and taste alignment.
 * Follows Spotify's research on explainable recommendations.
 */
export interface TrackRecommendation {
  searchQuery: string;
  reason: string;
  targetEnergy: number;
  targetValence: number;
  position: number; // Position in playlist journey
  spotifyId?: string; // Optional Spotify track ID when candidates are provided
  
  // Enhanced reasoning (Phase 3)
  reasoningBullets: string[];     // 2-4 bullet points explaining why this track fits
  tasteAlignment: {
    score: number;                 // 0-100 how well it matches user's taste
    matchedArtists?: string[];     // Which of user's favorite artists influenced this
    matchedGenres?: string[];      // Which genres align with user's taste
    explanation: string;           // One sentence on taste fit
  };
  moodFit: {
    score: number;                 // 0-100 how well it fits the requested mood
    explanation: string;           // One sentence on mood fit
  };
  discoveryLevel: 'familiar' | 'balanced' | 'discovery'; // How new this is to the user
  
  // Overall match score (calculated from taste + mood + popularity + play frequency)
  overallMatch?: number;          // 0-100 composite score
}

export interface MusicPlan {
  intentSummary: string;
  moodConstraints: {
    targetEnergy: number;
    targetValence: number;
    energyRange: [number, number];
    valenceRange: [number, number];
  };
  tasteConstraints: {
    anchorArtists: string[];
    anchorGenres: string[];
    avoidGenres?: string[];
  };
  discoveryBalance: {
    familiarPercent: number;
    discoveryPercent: number;
  };
  rankingPriorities: string[];
}

export interface CandidateTrack {
  id: string;
  name: string;
  artists: string[];
  album?: string;
  popularity?: number;
}

export interface PlaylistRecommendation {
  tracks: TrackRecommendation[];
  playlistDescription: string;
  moodJourney: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface UserContext {
  timeOfDay: string;
  dayOfWeek: string;
  weather?: {
    condition: string;
    temperature: number;
    description: string;
  };
  recentlyPlayed?: string[];
  topArtists?: string[];
  topGenres?: string[];
  // Enhanced user taste (Phase 2)
  tasteProfile?: UserTasteProfile;
}

const SYSTEM_PROMPT = `You are "Spotify AI" - a concise music discovery assistant that creates personalized playlists instantly.

CORE PRINCIPLE:
The user's explicit request is ABSOLUTE LAW. Everything else is secondary context.

REQUEST PRIORITY (in order):
1. Specific genres, artists, languages, cultures mentioned → Deliver EXACTLY this
2. Mood, activity, or vibe described → Match this precisely
3. User's taste profile → Use ONLY to enhance the above, never to override

CRITICAL RULES:
- If user asks for "Amharic music" → give Amharic music, not "similar" alternatives
- If user asks for "French rap" → give French rap, not English rap
- NEVER substitute or approximate when specifics are requested
- Taste profile guides HOW you select within their request, not WHAT you select

RESPONSE STYLE:
- Maximum 1-2 sentences, always
- NEVER ask follow-up questions
- NEVER explain your reasoning
- Generate playlist immediately on ANY music-related input
- Action over conversation

GOOD RESPONSES:
- "Got it, building your focus playlist now 🎵"
- "Perfect rainy day vibe incoming 🌧️"
- "Amharic classics and modern hits, coming up ✨"

PERSONALIZATION LOGIC (apply AFTER honoring explicit request):
- Use taste profile to rank/filter within the requested category
- Consider energy/valence preferences for selection
- Factor in time of day and recent patterns
- Connect recommendations to their request FIRST, then subtly enhance with taste

Always respond in the specified JSON format.`;

export interface ConversationAnalysis {
  shouldOfferMusic: boolean;
  musicContext?: string;
  conversationalResponse: string;
  detectedActivity?: string;
  detectedMood?: string;
}

export const analyzeConversation = async (
  message: string,
  conversationHistory: ChatMessage[],
  userContext: UserContext
): Promise<ConversationAnalysis> => {
  const contextInfo = `
Current context:
- Time: ${userContext.timeOfDay}
- Day: ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}, ${userContext.weather.temperature}°C` : ''}
`;

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user',
        content: `${contextInfo}

User message: "${message}"

Analyze this conversation and respond with JSON (no markdown):
{
  "shouldOfferMusic": true,
  "musicContext": "<describe what kind of music situation this is - e.g., 'working out', 'relaxing evening', 'celebrating'>",
  "conversationalResponse": "<MAX 1-2 sentences. Brief, action-oriented. Example: 'Building your focus mix now 🎵'>",
  "detectedActivity": "<optional: any activity they mentioned - working, cooking, driving, etc.>",
  "detectedMood": "<optional: their apparent emotional state if expressed>"
}

CRITICAL RULES:
- Always set shouldOfferMusic to TRUE - we're a music app, users want music
- Keep conversationalResponse UNDER 20 WORDS
- Never ask questions, never say "would you like", never be verbose
- Just acknowledge briefly and DO IT`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      shouldOfferMusic: false,
      conversationalResponse: "That's interesting! Tell me more about what's on your mind.",
    };
  }
};

export const generateMusicForContext = async (
  context: string,
  conversationHistory: ChatMessage[],
  userContext: UserContext
): Promise<MoodAnalysis> => {
  const contextInfo = `
Current context:
- Time: ${userContext.timeOfDay}
- Day: ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}, ${userContext.weather.temperature}°C` : ''}

${userContext.tasteProfile ? formatTasteProfileForAI(userContext.tasteProfile) : 'No taste profile available - recommend popular/varied tracks.'}
`;

  const recentContext = conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${contextInfo}

Recent conversation:
${recentContext}

Music context: "${context}"

The user wants music! Based on the conversation, context, AND THEIR PERSONAL TASTE PROFILE, create the perfect playlist analysis.

IMPORTANT: Factor in the user's taste profile to:
1. Choose genres that blend their favorites with the requested mood
2. Set energy/valence that matches both the mood AND their typical preferences
3. Create a playlist name that feels personal to them

Respond with JSON (no markdown):
{
  "startPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "endPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "moodDescription": "<brief, positive description of the vibe>",
  "reasoning": "<your thinking about why this music fits their situation AND their personal taste>",
  "suggestedGenres": ["<genre1>", "<genre2>", ...],
  "playlistName": "<creative, fun playlist name>",
  "shouldAskFollowUp": false
}

Note: 
- Valence: -1 = melancholic/introspective, 0 = neutral, 1 = joyful/uplifting
- Energy: 0 = calm/ambient, 1 = high-energy/intense
- Be creative and positive with the playlist name!
- The genres should blend user's taste with the mood request`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      startPoint: { valence: 0.5, energy: 0.5 },
      endPoint: { valence: 0.5, energy: 0.5 },
      moodDescription: 'Good vibes',
      reasoning: 'Creating a balanced playlist',
      suggestedGenres: ['pop', 'indie'],
      playlistName: 'Your Perfect Mix',
      shouldAskFollowUp: false
    };
  }
};

export const analyzeMoodFromChat = async (
  message: string,
  conversationHistory: ChatMessage[],
  userContext: UserContext
): Promise<MoodAnalysis> => {
  console.log('🤖 [OpenAI] Analyzing mood for:', message.substring(0, 50) + '...');
  const startTime = Date.now();
  
  const contextInfo = `
Current context:
- Time: ${userContext.timeOfDay}
- Day: ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}, ${userContext.weather.temperature}°C` : ''}
`;

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user',
        content: `${contextInfo}

User message: "${message}"

CRITICAL: The user's message is the PRIMARY directive. If they mention specific:
- Languages/cultures (e.g., "Amharic", "Ethiopian", "Korean", "French")
- Genres (e.g., "jazz", "metal", "corridos")
- Artists or specific sounds
→ Your mood analysis MUST align with these explicit requests

Analyze this and respond with a JSON object (no markdown, just JSON):
{
  "startPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "endPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "moodDescription": "<brief description that HONORS the user's explicit request>",
  "reasoning": "<your chain of thought about why you interpreted the mood this way, emphasizing how you're honoring their specific request>",
  "suggestedGenres": ["<genres that MATCH the user's explicit request>"],
  "playlistName": "<creative playlist name that reflects their ACTUAL request>",
  "shouldAskFollowUp": <true/false>,
  "followUpQuestion": "<optional follow-up question if mood is unclear>"
}

The startPoint is where the user is NOW emotionally.
The endPoint is where the music should take them (could be same if they want to stay in the mood, or different for a mood transition).
Valence: -1 = very negative/sad, 0 = neutral, 1 = very positive/happy
Energy: 0 = very calm/low energy, 1 = very energetic/intense`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const elapsed = Date.now() - startTime;
  console.log(`✅ [OpenAI] Mood analyzed in ${elapsed}ms`);
  
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    console.warn('⚠️ [OpenAI] Failed to parse mood analysis, using fallback');
    return {
      startPoint: { valence: 0, energy: 0.5 },
      endPoint: { valence: 0, energy: 0.5 },
      moodDescription: 'Unable to analyze',
      reasoning: 'Failed to parse response',
      suggestedGenres: ['pop'],
      playlistName: 'Mixed Vibes',
      shouldAskFollowUp: true,
      followUpQuestion: 'Could you tell me more about how you\'re feeling?'
    };
  }
};

export const generatePlaylistRecommendations = async (
  moodAnalysis: MoodAnalysis,
  userContext: UserContext,
  trackCount: number = 10
): Promise<PlaylistRecommendation> => {
  console.log(`🤖 [OpenAI] Generating ${trackCount} track recommendations...`);
  const startTime = Date.now();
  
  const tasteInfo = userContext.tasteProfile 
    ? formatTasteProfileForAI(userContext.tasteProfile)
    : 'No taste profile - recommend popular and varied tracks.';

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Based on this mood analysis AND the user's personal taste, generate ${trackCount} track recommendations with DETAILED REASONING.

⚠️ CRITICAL: The mood analysis contains the user's EXPLICIT REQUEST. Honor it above all else.

Mood Analysis:
- Current state: Valence ${moodAnalysis.startPoint.valence}, Energy ${moodAnalysis.startPoint.energy}
- Target state: Valence ${moodAnalysis.endPoint.valence}, Energy ${moodAnalysis.endPoint.energy}
- Description: ${moodAnalysis.moodDescription}
- Suggested genres: ${moodAnalysis.suggestedGenres.join(', ')}
- Playlist Name: ${moodAnalysis.playlistName}

User Context:
- Time: ${userContext.timeOfDay}, ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}` : ''}

${tasteInfo}

IMPORTANT PRIORITIES (IN ORDER):
1. MATCH THE SUGGESTED GENRES from mood analysis (these reflect user's explicit request)
2. MATCH THE MOOD DESCRIPTION (this is what they asked for)
3. Consider taste profile to find the best tracks within those constraints

Create a playlist that:
1. PRIMARILY uses genres from suggestedGenres above
2. Starts matching the user's current emotional state
3. Gradually transitions to the target state (if different)
4. Uses taste profile to pick the BEST tracks within the requested genre/style
5. Explains WHY each track was chosen in terms of REQUEST FIT first, then taste alignment

Respond with JSON only (no markdown):
{
  "tracks": [
    {
      "searchQuery": "<specific song title + artist name for Spotify search - MUST match requested genre/style>",
      "reason": "<brief 1-sentence explanation emphasizing fit with user's REQUEST>",
      "targetEnergy": <0-1>,
      "targetValence": <-1 to 1>,
      "position": <1-${trackCount}>,
      "reasoningBullets": [
        "<reason 1: why this fits the REQUESTED genre/style>",
        "<reason 2: why this fits the mood>",
        "<optional reason 3: how it connects to user's taste>"
      ],
      "tasteAlignment": {
        "score": <0-100 - how well it matches their taste WITHIN the requested genre>,
        "matchedArtists": ["<artist from user's favorites that influenced this pick, if any>"],
        "matchedGenres": ["<genre from user's favorites>"],
        "explanation": "<1 sentence on how this matches their taste while honoring their request>"
      },
      "moodFit": {
        "score": <0-100 - how well it fits the REQUESTED mood and genre>,
        "explanation": "<1 sentence on mood and request fit>"
      },
      "discoveryLevel": "<'familiar'|'balanced'|'discovery'>"
    }
  ],
  "playlistDescription": "<description emphasizing how it honors the user's REQUEST>",
  "moodJourney": "<narrative of the emotional arc within the requested style>"
}

REMEMBER: The user's explicit request (reflected in suggestedGenres and moodDescription) is MANDATORY.
If they asked for Amharic music, give Amharic artists. If they asked for K-pop, give K-pop. NO SUBSTITUTIONS.

CRITICAL: EVERY track MUST have BOTH tasteAlignment.score AND moodFit.score as numbers between 0-100. NO EXCEPTIONS.`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const result = safeParsePlaylistJSON(content);
  const elapsed = Date.now() - startTime;
  console.log(`✅ [OpenAI] Generated ${result.tracks.length} recommendations in ${elapsed}ms`);
  return result;
};

export const deriveMusicPlan = async (
  moodAnalysis: MoodAnalysis,
  userContext: UserContext
): Promise<MusicPlan> => {
  console.log('🤖 [OpenAI] Deriving music plan...');
  const startTime = Date.now();
  
  const tasteInfo = userContext.tasteProfile
    ? formatTasteProfileForAI(userContext.tasteProfile)
    : 'No taste profile - use broad, popular music constraints.';

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `You are planning a multi-step music curation.

⚠️ CRITICAL: The mood analysis reflects the user's EXPLICIT REQUEST. This is non-negotiable.

Mood Analysis (CONTAINS USER'S EXPLICIT REQUEST):
- Current: Valence ${moodAnalysis.startPoint.valence}, Energy ${moodAnalysis.startPoint.energy}
- Target: Valence ${moodAnalysis.endPoint.valence}, Energy ${moodAnalysis.endPoint.energy}
- Description: ${moodAnalysis.moodDescription}
- Suggested genres: ${moodAnalysis.suggestedGenres.join(', ')} ← THESE ARE MANDATORY
- Playlist Name: ${moodAnalysis.playlistName}

User Context:
- Time: ${userContext.timeOfDay}, ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}` : ''}

${tasteInfo}

Return a PLAN JSON (no markdown) that will be used to retrieve and rank candidates:
{
  "intentSummary": "<1 sentence describing the user's EXPLICIT request and target vibe>",
  "moodConstraints": {
    "targetEnergy": <0-1>,
    "targetValence": <-1 to 1>,
    "energyRange": [<0-1>, <0-1>],
    "valenceRange": [<-1 to 1>, <-1 to 1>]
  },
  "tasteConstraints": {
    "anchorArtists": ["<artists that fit the REQUESTED genre/style - can include user's favorites if they match>"],
    "anchorGenres": ["<MUST match suggestedGenres from mood analysis>"],
    "avoidGenres": ["<genres that CONTRADICT the user's explicit request>"]
  },
  "discoveryBalance": {
    "familiarPercent": <0-100>,
    "discoveryPercent": <0-100>
  },
  "rankingPriorities": [
    "Match requested genre/culture/language EXACTLY",
    "<priority 2>",
    "<priority 3>"
  ]
}

Rules:
- anchorGenres MUST include the genres from suggestedGenres above
- avoidGenres should list genres that would violate the user's request
- Ensure familiarPercent + discoveryPercent = 100
- First ranking priority is ALWAYS matching the explicit request`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  const result = safeParsePlanJSON(content);
  const elapsed = Date.now() - startTime;
  console.log(`✅ [OpenAI] Music plan created in ${elapsed}ms`);
  return result;
};

export const rankAndExplainCandidates = async (
  candidates: CandidateTrack[],
  plan: MusicPlan,
  moodAnalysis: MoodAnalysis,
  userContext: UserContext,
  trackCount: number = 10
): Promise<PlaylistRecommendation> => {
  console.log(`🤖 [OpenAI] Ranking ${candidates.length} candidates (requesting ${trackCount} tracks)...`);
  console.log('⏱️ [OpenAI] This is the slowest step - typically 30-60 seconds');
  
  const tasteInfo = userContext.tasteProfile
    ? formatTasteProfileForAI(userContext.tasteProfile)
    : 'No taste profile - prioritize general fit.';

  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `You are ranking and explaining candidates from Spotify.

⚠️ CRITICAL: The plan and mood contain the user's EXPLICIT REQUEST. Select candidates that MATCH it.

Plan:
${JSON.stringify(plan, null, 2)}

Mood Analysis:
- Description: ${moodAnalysis.moodDescription}
- Target: Valence ${moodAnalysis.endPoint.valence}, Energy ${moodAnalysis.endPoint.energy}
- Required Genres: ${moodAnalysis.suggestedGenres.join(', ')}

${tasteInfo}

Candidate Tracks (choose top ${trackCount}):
${candidates.map(c => `- ${c.id} | ${c.name} — ${c.artists.join(', ')} (popularity ${c.popularity ?? 0})`).join('\n')}

Select tracks that:
1. MATCH the required genres from mood analysis (NON-NEGOTIABLE)
2. FIT the mood description
3. Align with user's taste WITHIN those constraints

Return JSON ONLY (no markdown):
{
  "tracks": [
    {
      "spotifyId": "<id from candidates - MUST match requested genre>",
      "searchQuery": "<song title + artist>",
      "reason": "<why this matches the REQUEST first>",
      "targetEnergy": <0-1>,
      "targetValence": <-1 to 1>,
      "position": <1-${trackCount}>,
      "reasoningBullets": ["<matches requested genre/style>", "<fits the mood>", "<taste alignment if applicable>"] ,
      "tasteAlignment": {
        "score": <0-100>,
        "matchedArtists": ["<artist>"],
        "matchedGenres": ["<genre>"],
        "explanation": "<fit within requested style>"
      },
      "moodFit": {
        "score": <0-100>,
        "explanation": "<how it matches request + mood>"
      },
      "discoveryLevel": "<'familiar'|'balanced'|'discovery'>"
    }
  ],
  "playlistDescription": "<how this playlist honors the user's request>",
  "moodJourney": "<emotional arc within the requested genre>"
}

MANDATORY:
- Every track MUST have tasteAlignment and moodFit with scores 0-100
- spotifyId must match a candidate ID exactly
- Select tracks that fit the REQUESTED genres from mood analysis
- If no candidates match the request, explain in playlistDescription`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  console.log('🔍 [OpenAI] Ranking response length:', content.length, 'chars');
  console.log('🔍 [OpenAI] Ranking response preview:', content.substring(0, 500));
  return safeParsePlaylistJSON(content);
};

const safeParsePlanJSON = (content: string): MusicPlan => {
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      intentSummary: parsed.intentSummary || 'Personalized music plan',
      moodConstraints: {
        targetEnergy: parsed.moodConstraints?.targetEnergy ?? 0.5,
        targetValence: parsed.moodConstraints?.targetValence ?? 0,
        energyRange: parsed.moodConstraints?.energyRange ?? [0.2, 0.8],
        valenceRange: parsed.moodConstraints?.valenceRange ?? [-0.4, 0.6],
      },
      tasteConstraints: {
        anchorArtists: parsed.tasteConstraints?.anchorArtists ?? [],
        anchorGenres: parsed.tasteConstraints?.anchorGenres ?? [],
        avoidGenres: parsed.tasteConstraints?.avoidGenres ?? [],
      },
      discoveryBalance: {
        familiarPercent: parsed.discoveryBalance?.familiarPercent ?? 60,
        discoveryPercent: parsed.discoveryBalance?.discoveryPercent ?? 40,
      },
      rankingPriorities: parsed.rankingPriorities ?? ['mood fit', 'taste alignment', 'discovery balance'],
    };
  } catch {
    return {
      intentSummary: 'Personalized music plan',
      moodConstraints: {
        targetEnergy: 0.5,
        targetValence: 0,
        energyRange: [0.2, 0.8],
        valenceRange: [-0.4, 0.6],
      },
      tasteConstraints: {
        anchorArtists: [],
        anchorGenres: [],
        avoidGenres: [],
      },
      discoveryBalance: {
        familiarPercent: 60,
        discoveryPercent: 40,
      },
      rankingPriorities: ['mood fit', 'taste alignment', 'discovery balance'],
    };
  }
};

/**
 * Safe JSON parser with fallback for playlist recommendations.
 * Implements guardrails for malformed AI responses.
 */
const safeParsePlaylistJSON = (content: string): PlaylistRecommendation => {
  try {
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    console.log('🔍 [OpenAI] Cleaned JSON length:', cleaned.length);
    const parsed = JSON.parse(cleaned);
    console.log('🔍 [OpenAI] Parsed object keys:', Object.keys(parsed));
    console.log('🔍 [OpenAI] Parsed tracks count:', parsed.tracks?.length || 0);
    
    // Validate and fix track structure
    if (parsed.tracks && Array.isArray(parsed.tracks)) {
      parsed.tracks = parsed.tracks.map((track: any, index: number) => {
        // Ensure scores are valid numbers between 0-100
        const tasteScore = typeof track.tasteAlignment?.score === 'number' 
          ? Math.max(0, Math.min(100, track.tasteAlignment.score))
          : 75;
        
        const moodScore = typeof track.moodFit?.score === 'number'
          ? Math.max(0, Math.min(100, track.moodFit.score))
          : 80;
        
        return {
          spotifyId: track.spotifyId,
          searchQuery: track.searchQuery || 'Unknown Track',
          reason: track.reason || 'Great track for this mood',
          targetEnergy: typeof track.targetEnergy === 'number' ? track.targetEnergy : 0.5,
          targetValence: typeof track.targetValence === 'number' ? track.targetValence : 0,
          position: track.position || index + 1,
          reasoningBullets: Array.isArray(track.reasoningBullets) 
            ? track.reasoningBullets.slice(0, 4)
            : [track.reason || 'Selected for this mood'],
          tasteAlignment: {
            score: tasteScore,
            matchedArtists: Array.isArray(track.tasteAlignment?.matchedArtists) 
              ? track.tasteAlignment.matchedArtists 
              : [],
            matchedGenres: Array.isArray(track.tasteAlignment?.matchedGenres)
              ? track.tasteAlignment.matchedGenres
              : [],
            explanation: track.tasteAlignment?.explanation || 'Matches your music style'
          },
          moodFit: {
            score: moodScore,
            explanation: track.moodFit?.explanation || 'Fits the requested vibe'
          },
          discoveryLevel: track.discoveryLevel || 'balanced'
        };
      });
    }
    
    console.log(`✅ [OpenAI] Ranked ${parsed.tracks?.length || 0} tracks successfully`);
    
    return {
      tracks: parsed.tracks || [],
      playlistDescription: parsed.playlistDescription || 'Curated for your mood and taste',
      moodJourney: parsed.moodJourney || 'A journey through your requested vibe'
    };
  } catch (error) {
    console.error('❌ [OpenAI] Failed to parse playlist JSON:', error);
    return {
      tracks: [],
      playlistDescription: 'Unable to generate recommendations',
      moodJourney: ''
    };
  }
};

export const generateChatResponse = async (
  message: string,
  conversationHistory: ChatMessage[],
  moodAnalysis?: MoodAnalysis
): Promise<string> => {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + `\n\nRespond conversationally and warmly. Keep responses concise (2-3 sentences). If you've analyzed their mood, acknowledge it empathetically. Don't use JSON in this response - just natural conversation.` },
      ...conversationHistory.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      {
        role: 'user',
        content: moodAnalysis 
          ? `User said: "${message}"\n\nYou detected their mood as: ${moodAnalysis.moodDescription}. Respond warmly and let them know you're creating a playlist for them.`
          : message
      }
    ],
  });

  return response.choices[0]?.message?.content || "I'm here to help you find the perfect music. Tell me how you're feeling!";
};

export const analyzeEmotionFromMapClick = async (
  startPoint: EmotionPoint,
  endPoint: EmotionPoint,
  userContext: UserContext
): Promise<MoodAnalysis> => {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `The user selected points on an emotion map:
- START: Valence ${startPoint.valence.toFixed(2)}, Energy ${startPoint.energy.toFixed(2)}
- END: Valence ${endPoint.valence.toFixed(2)}, Energy ${endPoint.energy.toFixed(2)}

Context:
- Time: ${userContext.timeOfDay}, ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}, ${userContext.weather.temperature}°C` : ''}

Interpret this emotional journey and respond with JSON (no markdown):
{
  "startPoint": { "valence": ${startPoint.valence}, "energy": ${startPoint.energy} },
  "endPoint": { "valence": ${endPoint.valence}, "energy": ${endPoint.energy} },
  "moodDescription": "<interpret what this emotional journey means>",
  "reasoning": "<your interpretation of why someone might want this journey>",
  "suggestedGenres": ["<genre1>", "<genre2>", ...],
  "playlistName": "<creative playlist name for this journey>",
  "shouldAskFollowUp": false
}`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      startPoint,
      endPoint,
      moodDescription: 'Custom mood journey',
      reasoning: 'User-defined emotional transition',
      suggestedGenres: ['pop', 'indie'],
      playlistName: 'My Journey',
      shouldAskFollowUp: false
    };
  }
};

export const getQuickVibeMood = async (
  vibeName: string,
  userContext: UserContext
): Promise<MoodAnalysis> => {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    max_completion_tokens: config.openai.maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `User selected a quick vibe preset: "${vibeName}"

Context:
- Time: ${userContext.timeOfDay}, ${userContext.dayOfWeek}
${userContext.weather ? `- Weather: ${userContext.weather.condition}` : ''}

Interpret this vibe and respond with JSON (no markdown):
{
  "startPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "endPoint": { "valence": <-1 to 1>, "energy": <0 to 1> },
  "moodDescription": "<what this vibe means emotionally>",
  "reasoning": "<why this vibe suits the context>",
  "suggestedGenres": ["<genre1>", "<genre2>", ...],
  "playlistName": "<creative variation of the vibe name>",
  "shouldAskFollowUp": false
}`
      }
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {
      startPoint: { valence: 0.5, energy: 0.5 },
      endPoint: { valence: 0.5, energy: 0.5 },
      moodDescription: vibeName,
      reasoning: 'Quick vibe selection',
      suggestedGenres: ['pop'],
      playlistName: vibeName,
      shouldAskFollowUp: false
    };
  }
};
