/**
 * Example React Hook for AI Music Generation
 * 
 * This is a reference implementation showing how to integrate the generation service
 * into a React component or custom hook.
 */

import { useState, useCallback } from 'react';
import { generationService, GenerationResult, UserGenerationPreferences } from '../services/ai/generation';
import type { ChatMessage } from '../services/ai/openai';
import type { Track } from '../interfaces/track';

interface UseAIGenerationReturn {
  // State
  loading: boolean;
  error: string | null;
  result: GenerationResult | null;
  preferences: UserGenerationPreferences;
  
  // Actions
  generate: (prompt: string, conversationHistory?: ChatMessage[]) => Promise<void>;
  regenerate: (conversationHistory?: ChatMessage[]) => Promise<void>;
  updatePreference: (key: keyof UserGenerationPreferences, value: any) => void;
  resetPreferences: () => void;
  
  // Helpers
  getTracks: () => Track[];
  getPlaylistName: () => string;
}

/**
 * Custom hook for AI music generation
 */
export const useAIGeneration = (): UseAIGenerationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [preferences, setPreferences] = useState<UserGenerationPreferences>(
    generationService.getPreferences()
  );

  /**
   * Generate a new playlist based on user prompt
   */
  const generate = useCallback(async (
    prompt: string,
    conversationHistory: ChatMessage[] = []
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const generationResult = await generationService.generatePlaylist(
        prompt,
        conversationHistory,
        true // use preferences
      );
      
      setResult(generationResult);
      
      // Refresh preferences after generation (they may have been updated)
      setPreferences(generationService.getPreferences());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate playlist';
      setError(errorMessage);
      console.error('Generation error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Regenerate playlist with same prompt but new selections
   */
  const regenerate = useCallback(async (conversationHistory: ChatMessage[] = []) => {
    setLoading(true);
    setError(null);
    
    try {
      const generationResult = await generationService.regeneratePlaylist(conversationHistory);
      setResult(generationResult);
      setPreferences(generationService.getPreferences());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to regenerate playlist';
      setError(errorMessage);
      console.error('Regeneration error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a specific preference setting
   */
  const updatePreference = useCallback((
    key: keyof UserGenerationPreferences,
    value: any
  ) => {
    generationService.updatePreferenceSetting(key, value);
    setPreferences(generationService.getPreferences());
  }, []);

  /**
   * Reset preferences to default
   */
  const resetPreferences = useCallback(() => {
    generationService.resetPreferences();
    setPreferences(generationService.getPreferences());
  }, []);

  /**
   * Get tracks from current result
   */
  const getTracks = useCallback((): Track[] => {
    return result?.tracks || [];
  }, [result]);

  /**
   * Get playlist name from mood analysis
   */
  const getPlaylistName = useCallback((): string => {
    return result?.moodAnalysis?.playlistName || 'AI Generated Playlist';
  }, [result]);

  return {
    loading,
    error,
    result,
    preferences,
    generate,
    regenerate,
    updatePreference,
    resetPreferences,
    getTracks,
    getPlaylistName,
  };
};

/**
 * Example Component Usage:
 * 
 * ```tsx
 * import { useAIGeneration } from './hooks/useAIGeneration';
 * 
 * export const AIPlaylistGenerator: React.FC = () => {
 *   const [prompt, setPrompt] = useState('');
 *   const {
 *     loading,
 *     error,
 *     result,
 *     preferences,
 *     generate,
 *     regenerate,
 *     updatePreference,
 *     getTracks,
 *     getPlaylistName,
 *   } = useAIGeneration();
 * 
 *   const handleGenerate = async () => {
 *     await generate(prompt);
 *   };
 * 
 *   const handleRegenerate = async () => {
 *     await regenerate();
 *   };
 * 
 *   return (
 *     <div>
 *       <h1>AI Music Generator</h1>
 *       
 *       {/\* Input *\/}
 *       <input
 *         type="text"
 *         value={prompt}
 *         onChange={(e) => setPrompt(e.target.value)}
 *         placeholder="Describe the music you want..."
 *       />
 *       <button onClick={handleGenerate} disabled={loading}>
 *         {loading ? 'Generating...' : 'Generate Playlist'}
 *       </button>
 *       
 *       {/\* Preferences *\/}
 *       <div>
 *         <label>
 *           Playlist Length:
 *           <input
 *             type="number"
 *             value={preferences.playlistLength}
 *             onChange={(e) => updatePreference('playlistLength', parseInt(e.target.value))}
 *           />
 *         </label>
 *         <label>
 *           Discovery Level:
 *           <select
 *             value={preferences.discoveryLevel}
 *             onChange={(e) => updatePreference('discoveryLevel', e.target.value)}
 *           >
 *             <option value="familiar">Familiar</option>
 *             <option value="balanced">Balanced</option>
 *             <option value="discovery">Discovery</option>
 *           </select>
 *         </label>
 *       </div>
 *       
 *       {/\* Error *\/}
 *       {error && <div className="error">{error}</div>}
 *       
 *       {/\* Results *\/}
 *       {result && (
 *         <div>
 *           <h2>{getPlaylistName()}</h2>
 *           <p>{result.playlistDescription}</p>
 *           <button onClick={handleRegenerate} disabled={loading}>
 *             Regenerate
 *           </button>
 *           
 *           <ul>
 *             {getTracks().map((track, index) => (
 *               <li key={track.id}>
 *                 {track.name} - {track.artists.map(a => a.name).join(', ')}
 *                 {result.recommendations[index] && (
 *                   <div>
 *                     <small>{result.recommendations[index].reason}</small>
 *                     <div>
 *                       Taste Match: {result.recommendations[index].tasteAlignment.score}%
 *                     </div>
 *                     <div>
 *                       Mood Fit: {result.recommendations[index].moodFit.score}%
 *                     </div>
 *                   </div>
 *                 )}
 *               </li>
 *             ))}
 *           </ul>
 *         </div>
 *       )}
 *     </div>
 *   );
 * };
 * ```
 */
