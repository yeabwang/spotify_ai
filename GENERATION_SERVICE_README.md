# AI Music Generation Service

A comprehensive AI-powered music generation service that creates personalized Spotify playlists based on user prompts, listening history, and preferences.

## Overview

The generation service combines:

- **OpenAI's LLM** for understanding user intent and mood
- **Spotify API** for fetching user's listening history and searching tracks
- **User Preferences** stored locally for personalization
- **Taste Profile** from Spotify to ensure recommendations match user's style

## Architecture

```
User Prompt
    ↓
┌─────────────────────────────────────┐
│  1. Load User Preferences           │
│     - Saved vibes & genres          │
│     - Energy/valence preferences    │
│     - Discovery level               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  2. Fetch User Taste Profile        │
│     - Top artists & tracks          │
│     - Listening patterns            │
│     - Recent history                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  3. LLM Mood Analysis               │
│     - Analyze user's emotional      │
│       state & music need            │
│     - Determine energy/valence      │
│     - Suggest genres                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  4. Derive Music Plan               │
│     - Set mood constraints          │
│     - Define taste anchors          │
│     - Balance discovery/familiar    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  5. Generate Search Queries         │
│     - LLM creates specific track    │
│       queries (artist + song)       │
│     - With reasoning & scores       │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  6. Search Spotify                  │
│     - Fetch candidate tracks        │
│     - Get multiple options per      │
│       query                         │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  7. LLM Rank & Explain              │
│     - Score candidates              │
│     - Explain taste alignment       │
│     - Provide reasoning bullets     │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  8. Update Preferences              │
│     - Learn from successful gen     │
│     - Update favorite genres        │
│     - Adjust energy/valence prefs   │
└─────────────────────────────────────┘
    ↓
Final Playlist with Tracks + Explanations
```

## Installation & Setup

### Prerequisites

- OpenAI API Key configured in `.env`:
  ```
  REACT_APP_OPENAI_API_KEY=your_api_key_here
  ```
- Spotify API authentication active

### Import

```typescript
import { generationService } from './services/ai/generation';
```

## API Reference

### `generatePlaylist()`

Generate a new playlist based on user prompt.

```typescript
const result = await generationService.generatePlaylist(
  prompt: string,
  conversationHistory?: ChatMessage[],
  usePreferences?: boolean
): Promise<GenerationResult>
```

**Parameters:**

- `prompt` - User's music request (e.g., "upbeat workout music")
- `conversationHistory` - Optional conversation context
- `usePreferences` - Whether to use saved preferences (default: true)

**Returns:** `GenerationResult`

```typescript
{
  tracks: Track[];                    // Spotify tracks ready to play
  recommendations: TrackRecommendation[];  // Detailed reasoning for each
  moodAnalysis: MoodAnalysis;         // LLM's mood interpretation
  playlistDescription: string;        // Overall playlist description
  moodJourney: string;                // Emotional arc narrative
  generatedAt: string;                // ISO timestamp
}
```

**Example:**

```typescript
const result = await generationService.generatePlaylist(
  "I need focus music for coding"
);

console.log(result.tracks);  // Array of Spotify tracks
console.log(result.moodAnalysis.playlistName);  // "Deep Focus Flow"
console.log(result.recommendations[0].reason);  // "Ambient soundscape..."
```

### `regeneratePlaylist()`

Regenerate playlist using the same prompt but with fresh tracks.

```typescript
const result = await generationService.regeneratePlaylist(
  conversationHistory?: ChatMessage[]
): Promise<GenerationResult>
```

**Example:**

```typescript
// After generating once
const firstResult = await generationService.generatePlaylist("chill evening vibes");

// Get different tracks with same vibe
const secondResult = await generationService.regeneratePlaylist();
```

### `getPreferences()`

Get current user preferences.

```typescript
const prefs = generationService.getPreferences(): UserGenerationPreferences
```

**Returns:**

```typescript
{
  preferredVibes: string[];      // ["chill", "energetic", ...]
  favoriteGenres: string[];      // ["indie", "electronic", ...]
  energyPreference: number;      // 0-1
  valencePreference: number;     // -1 to 1
  discoveryLevel: 'familiar' | 'balanced' | 'discovery';
  playlistLength: number;        // default 10
  explicitContent: boolean;
  totalGenerations: number;
  lastPrompt?: string;
  lastGeneratedAt?: string;
}
```

### `updatePreferenceSetting()`

Update a specific preference.

```typescript
generationService.updatePreferenceSetting(
  key: keyof UserGenerationPreferences,
  value: any
): void
```

**Example:**

```typescript
// More discovery
generationService.updatePreferenceSetting('discoveryLevel', 'discovery');

// Longer playlists
generationService.updatePreferenceSetting('playlistLength', 20);

// More energetic music
generationService.updatePreferenceSetting('energyPreference', 0.8);
```

### `saveUserPreferences()`

Save multiple preference updates at once.

```typescript
generationService.saveUserPreferences(
  preferences: Partial<UserGenerationPreferences>
): void
```

**Example:**

```typescript
generationService.saveUserPreferences({
  discoveryLevel: 'balanced',
  playlistLength: 15,
  explicitContent: false,
});
```

### `updateVibePreferences()`

Manually update vibe preferences based on mood analysis.

```typescript
generationService.updateVibePreferences(
  moodAnalysis: MoodAnalysis,
  genres: string[]
): void
```

### `resetPreferences()`

Reset all preferences to defaults.

```typescript
generationService.resetPreferences(): void
```

## User Preferences

Preferences are automatically saved to `localStorage` and persist across sessions (30 days TTL).

### Automatic Learning

The service learns from successful generations:

- Adds new genres to favorites
- Updates energy/valence preferences (weighted average)
- Tracks preferred vibes
- Records generation history

### Discovery Levels

- **`familiar`** - Stick close to user's known favorites (80% familiar, 20% new)
- **`balanced`** - Mix of familiar and new (60% familiar, 40% new)
- **`discovery`** - Explore new territory (40% familiar, 60% new)

## Integration Examples

### Basic React Component

```tsx
import { useState } from 'react';
import { generationService } from './services/ai/generation';

export const MusicGenerator = () => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await generationService.generatePlaylist(prompt);
      setResult(res);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div>
      <input 
        value={prompt} 
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What music do you need?"
      />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate'}
      </button>
  
      {result && (
        <div>
          <h2>{result.moodAnalysis.playlistName}</h2>
          <p>{result.playlistDescription}</p>
          <ul>
            {result.tracks.map(track => (
              <li key={track.id}>
                {track.name} - {track.artists[0].name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```

### With Preferences UI

```tsx
import { useState, useEffect } from 'react';
import { generationService } from './services/ai/generation';

export const GeneratorWithPreferences = () => {
  const [preferences, setPreferences] = useState(
    generationService.getPreferences()
  );

  const updatePref = (key, value) => {
    generationService.updatePreferenceSetting(key, value);
    setPreferences(generationService.getPreferences());
  };

  return (
    <div>
      <h3>Preferences</h3>
  
      <label>
        Discovery Level:
        <select 
          value={preferences.discoveryLevel}
          onChange={(e) => updatePref('discoveryLevel', e.target.value)}
        >
          <option value="familiar">Familiar</option>
          <option value="balanced">Balanced</option>
          <option value="discovery">Discovery</option>
        </select>
      </label>

      <label>
        Playlist Length:
        <input 
          type="number"
          value={preferences.playlistLength}
          onChange={(e) => updatePref('playlistLength', parseInt(e.target.value))}
          min={5}
          max={50}
        />
      </label>

      <label>
        Energy Preference:
        <input 
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={preferences.energyPreference}
          onChange={(e) => updatePref('energyPreference', parseFloat(e.target.value))}
        />
      </label>
  
      <p>Total Generations: {preferences.totalGenerations}</p>
      <p>Favorite Genres: {preferences.favoriteGenres.join(', ')}</p>
    </div>
  );
};
```

## Advanced Usage

### Conversation Flow

Build up context across multiple messages:

```typescript
const conversationHistory = [];

// First message
conversationHistory.push({
  role: 'user',
  content: 'I need music for studying'
});

const result1 = await generationService.generatePlaylist(
  'I need music for studying',
  conversationHistory
);

conversationHistory.push({
  role: 'assistant',
  content: 'Created a focus playlist'
});

// Follow-up
conversationHistory.push({
  role: 'user',
  content: 'Make it more upbeat'
});

const result2 = await generationService.generatePlaylist(
  'Make it more upbeat',
  conversationHistory
);
```

### Custom Mood Analysis

Access detailed mood data:

```typescript
const result = await generationService.generatePlaylist("party music");

console.log(result.moodAnalysis);
// {
//   startPoint: { valence: 0.8, energy: 0.9 },
//   endPoint: { valence: 0.9, energy: 0.95 },
//   moodDescription: "High-energy celebration vibes",
//   suggestedGenres: ["dance-pop", "electronic", "house"],
//   playlistName: "Party Energy 🎉"
// }
```

### Track Explanations

Show users why tracks were selected with comprehensive match scores:

```typescript
const result = await generationService.generatePlaylist("workout mix");

result.recommendations.forEach((rec, index) => {
  const track = result.tracks[index];
  console.log(`${track.name}:`);
  console.log(`  Overall Match: ${rec.overallMatch}%`);
  console.log(`  - Taste Match: ${rec.tasteAlignment.score}%`);
  console.log(`  - Mood Fit: ${rec.moodFit.score}%`);
  console.log(`  - Popularity: ${track.popularity}%`);
  console.log(`  Reason: ${rec.reason}`);
  rec.reasoningBullets.forEach(bullet => {
    console.log(`  • ${bullet}`);
  });
});
```

### Match Score Calculation

Each track receives an **overall match score** (0-100%) calculated from:

- **30% Taste Alignment** - How well it matches your listening history and preferences
- **30% Mood Fit** - How well it matches the requested mood/vibe
- **25% Popularity** - Track's general popularity on Spotify (0-100)
- **15% Play Frequency** - Bonus if the track or artist is in your recent listening history

**Formula:**

```
Overall Match = (Taste × 0.30) + (Mood × 0.30) + (Popularity × 0.25) + (Frequency × 0.15)
```

**Example:**

- Taste Match: 90%
- Mood Fit: 85%
- Popularity: 75
- Play Frequency: 100 (artist recently played)
- **Overall Match = 87%**

This ensures every track shows a meaningful percentage that combines personalization with quality.

## Error Handling

```typescript
try {
  const result = await generationService.generatePlaylist(prompt);
  // Success
} catch (error) {
  if (error.message.includes('No previous generation')) {
    // Handle regenerate error
    console.log('Generate a playlist first');
  } else if (error.message.includes('Failed to generate')) {
    // Handle API errors
    console.log('Try again or check API keys');
  }
}
```

## Performance Considerations

- **Rate Limiting**: Built-in 100ms delay between Spotify searches
- **Caching**: User preferences cached in localStorage (30 days)
- **Taste Profile**: Fetched once per generation
- **LLM Calls**: 3-4 API calls per generation (mood analysis, plan, recommendations, ranking)

## Best Practices

1. **Use Conversation History** for multi-turn interactions
2. **Show Reasoning** to users for transparency
3. **Allow Regeneration** so users can get fresh options
4. **Expose Preferences** UI for user control
5. **Handle Loading States** - generation takes 5-15 seconds
6. **Cache Results** client-side to avoid re-generation

## Troubleshooting

### No tracks returned

- Check Spotify API authentication
- Verify search queries are returning results
- Check console for API errors

### Generic recommendations

- Ensure OpenAI API key is set
- Check that taste profile is being fetched
- Verify preferences are loading correctly

### Slow generation

- Normal range is 5-15 seconds
- Check network connection
- Monitor OpenAI API rate limits
