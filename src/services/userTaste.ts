import { userService } from './users';
import { playerService } from './player';
import type { Track } from '../interfaces/track';
import type { Artist } from '../interfaces/artist';

/**
 * Represents a user's musical taste profile for AI-powered personalization.
 * Based on Spotify's research on personalized agentic systems and preference optimization.
 */
export interface UserTasteProfile {
  // Taste Anchors - most distinctive preferences (top 3-5)
  topArtists: TasteAnchor[];
  topGenres: string[];
  topTracks: TasteAnchor[];
  
  // Taste Vectors - numerical representations of preferences
  tasteVectors: {
    avgEnergy: number;      // 0-1
    avgValence: number;     // 0-1
    avgDanceability: number; // 0-1
    avgAcousticness: number; // 0-1
    preferredDecade: string; // e.g., "2010s", "2020s"
    tempoRange: { min: number; max: number };
  };
  
  // Recent Context - what they've been listening to lately
  recentlyPlayed: RecentTrack[];
  recentGenres: string[];
  recentMoods: string[];
  
  // Listening Patterns
  listeningPatterns: {
    morningGenres: string[];
    eveningGenres: string[];
    weekendGenres: string[];
    workoutGenres: string[];
  };
  
  // Profile metadata
  profileUpdatedAt: string;
  confidence: number; // 0-1 how much data we have
}

export interface TasteAnchor {
  id: string;
  name: string;
  imageUrl?: string;
  genres?: string[];
  popularity?: number;
}

export interface RecentTrack {
  id: string;
  name: string;
  artist: string;
  playedAt: string;
  genres?: string[];
}

/**
 * Extract genres from a list of artists
 */
const extractGenres = (artists: Artist[]): string[] => {
  const genreCount: Record<string, number> = {};
  
  artists.forEach(artist => {
    artist.genres?.forEach(genre => {
      genreCount[genre] = (genreCount[genre] || 0) + 1;
    });
  });
  
  // Sort by frequency and return top genres
  return Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([genre]) => genre);
};

/**
 * Infer mood from genres and time patterns
 */
const inferMoodsFromGenres = (genres: string[]): string[] => {
  const moodMapping: Record<string, string[]> = {
    'chill': ['ambient', 'lo-fi', 'chillhop', 'downtempo', 'trip-hop', 'chill'],
    'energetic': ['edm', 'dance', 'house', 'techno', 'drum and bass', 'electronic'],
    'melancholic': ['sad', 'emo', 'post-punk', 'gothic', 'dark'],
    'upbeat': ['pop', 'dance pop', 'happy', 'funk', 'disco'],
    'introspective': ['indie', 'folk', 'singer-songwriter', 'acoustic'],
    'aggressive': ['metal', 'hardcore', 'punk', 'hard rock', 'thrash'],
    'romantic': ['r&b', 'soul', 'jazz', 'blues', 'neo soul'],
    'focused': ['classical', 'instrumental', 'study', 'piano', 'ambient'],
  };
  
  const moods = new Set<string>();
  
  genres.forEach(genre => {
    Object.entries(moodMapping).forEach(([mood, genrePatterns]) => {
      if (genrePatterns.some(pattern => genre.toLowerCase().includes(pattern))) {
        moods.add(mood);
      }
    });
  });
  
  return Array.from(moods).slice(0, 5);
};

/**
 * Infer preferred decade from track release dates
 */
const inferPreferredDecade = (tracks: Track[]): string => {
  const decadeCount: Record<string, number> = {};
  
  tracks.forEach(track => {
    if (track.album?.release_date) {
      const year = parseInt(track.album.release_date.substring(0, 4));
      const decade = `${Math.floor(year / 10) * 10}s`;
      decadeCount[decade] = (decadeCount[decade] || 0) + 1;
    }
  });
  
  // Return the most common decade
  const sorted = Object.entries(decadeCount).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || '2020s';
};

/**
 * Fetch and build a complete user taste profile
 */
export const fetchUserTasteProfile = async (): Promise<UserTasteProfile> => {
  try {
    // Fetch all data in parallel for efficiency
    const [
      topArtistsLong,
      topArtistsShort,
      topTracksLong,
      topTracksShort,
      recentlyPlayedData,
    ] = await Promise.all([
      userService.fetchTopArtists({ timeRange: 'long_term', limit: 10 }).catch(() => ({ data: { items: [] } })),
      userService.fetchTopArtists({ timeRange: 'short_term', limit: 10 }).catch(() => ({ data: { items: [] } })),
      userService.fetchTopTracks({ timeRange: 'long_term', limit: 20 }).catch(() => ({ data: { items: [] } })),
      userService.fetchTopTracks({ timeRange: 'short_term', limit: 20 }).catch(() => ({ data: { items: [] } })),
      playerService.getRecentlyPlayed({ limit: 50 }).catch(() => ({ items: [] })),
    ]);

    // Process top artists (combine long and short term, prioritize short term)
    const allArtists = [...(topArtistsShort.data.items || []), ...(topArtistsLong.data.items || [])];
    const uniqueArtists = allArtists.filter((artist, index, self) => 
      index === self.findIndex(a => a.id === artist.id)
    ).slice(0, 10);

    const topArtists: TasteAnchor[] = uniqueArtists.slice(0, 5).map(artist => ({
      id: artist.id,
      name: artist.name,
      imageUrl: artist.images?.[0]?.url,
      genres: artist.genres?.slice(0, 3),
      popularity: artist.popularity,
    }));

    // Process top tracks
    const allTracks = [...(topTracksShort.data.items || []), ...(topTracksLong.data.items || [])];
    const uniqueTracks = allTracks.filter((track, index, self) => 
      index === self.findIndex(t => t.id === track.id)
    ).slice(0, 20);

    const topTracks: TasteAnchor[] = uniqueTracks.slice(0, 5).map(track => ({
      id: track.id,
      name: track.name,
      imageUrl: track.album?.images?.[0]?.url,
      popularity: track.popularity,
    }));

    // Extract top genres from artists
    const topGenres = extractGenres(uniqueArtists);

    // Process recently played
    const recentItems = recentlyPlayedData?.items || [];
    const recentlyPlayed: RecentTrack[] = recentItems.slice(0, 20).map((item: any) => ({
      id: item.track?.id || '',
      name: item.track?.name || '',
      artist: item.track?.artists?.[0]?.name || '',
      playedAt: item.played_at || '',
    }));

    // Use top genres as fallback for recent genres
    const recentGenres = topGenres.slice(0, 5);

    // Infer moods from genres
    const recentMoods = inferMoodsFromGenres(topGenres);

    // Calculate taste vectors (estimated from genres - in production would use audio features API)
    const tasteVectors = {
      avgEnergy: calculateGenreEnergy(topGenres),
      avgValence: calculateGenreValence(topGenres),
      avgDanceability: calculateGenreDanceability(topGenres),
      avgAcousticness: calculateGenreAcousticness(topGenres),
      preferredDecade: inferPreferredDecade(uniqueTracks),
      tempoRange: inferTempoRange(topGenres),
    };

    // Build listening patterns (simplified - would need more data in production)
    const listeningPatterns = {
      morningGenres: topGenres.filter(g => g.includes('acoustic') || g.includes('indie') || g.includes('folk')).slice(0, 3) || topGenres.slice(0, 3),
      eveningGenres: topGenres.filter(g => g.includes('r&b') || g.includes('jazz') || g.includes('chill')).slice(0, 3) || topGenres.slice(0, 3),
      weekendGenres: topGenres.filter(g => g.includes('dance') || g.includes('pop') || g.includes('party')).slice(0, 3) || topGenres.slice(0, 3),
      workoutGenres: topGenres.filter(g => g.includes('edm') || g.includes('hip hop') || g.includes('rock')).slice(0, 3) || topGenres.slice(0, 3),
    };

    // Calculate confidence based on data availability
    const confidence = Math.min(1, (
      (topArtists.length / 5) * 0.3 +
      (topTracks.length / 5) * 0.3 +
      (recentlyPlayed.length / 20) * 0.2 +
      (topGenres.length / 10) * 0.2
    ));

    return {
      topArtists,
      topGenres,
      topTracks,
      tasteVectors,
      recentlyPlayed,
      recentGenres,
      recentMoods,
      listeningPatterns,
      profileUpdatedAt: new Date().toISOString(),
      confidence,
    };
  } catch (error) {
    console.error('Failed to fetch user taste profile:', error);
    // Return empty profile on error
    return getEmptyTasteProfile();
  }
};

/**
 * Helper functions to estimate audio features from genres
 */
const calculateGenreEnergy = (genres: string[]): number => {
  const highEnergy = ['edm', 'metal', 'punk', 'dance', 'techno', 'house', 'drum and bass'];
  const lowEnergy = ['ambient', 'classical', 'acoustic', 'folk', 'jazz', 'lo-fi'];
  
  let score = 0.5;
  genres.forEach(genre => {
    if (highEnergy.some(he => genre.includes(he))) score += 0.05;
    if (lowEnergy.some(le => genre.includes(le))) score -= 0.05;
  });
  
  return Math.max(0, Math.min(1, score));
};

const calculateGenreValence = (genres: string[]): number => {
  const positive = ['pop', 'dance', 'funk', 'disco', 'happy', 'party'];
  const negative = ['sad', 'emo', 'dark', 'gothic', 'melancholy'];
  
  let score = 0.5;
  genres.forEach(genre => {
    if (positive.some(p => genre.includes(p))) score += 0.05;
    if (negative.some(n => genre.includes(n))) score -= 0.05;
  });
  
  return Math.max(0, Math.min(1, score));
};

const calculateGenreDanceability = (genres: string[]): number => {
  const danceable = ['dance', 'disco', 'house', 'techno', 'hip hop', 'r&b', 'funk'];
  const notDanceable = ['ambient', 'classical', 'metal', 'acoustic'];
  
  let score = 0.5;
  genres.forEach(genre => {
    if (danceable.some(d => genre.includes(d))) score += 0.06;
    if (notDanceable.some(nd => genre.includes(nd))) score -= 0.04;
  });
  
  return Math.max(0, Math.min(1, score));
};

const calculateGenreAcousticness = (genres: string[]): number => {
  const acoustic = ['acoustic', 'folk', 'classical', 'jazz', 'singer-songwriter'];
  const electronic = ['edm', 'electronic', 'synth', 'techno', 'house'];
  
  let score = 0.4;
  genres.forEach(genre => {
    if (acoustic.some(a => genre.includes(a))) score += 0.08;
    if (electronic.some(e => genre.includes(e))) score -= 0.05;
  });
  
  return Math.max(0, Math.min(1, score));
};

const inferTempoRange = (genres: string[]): { min: number; max: number } => {
  const fastGenres = ['edm', 'metal', 'punk', 'drum and bass', 'techno'];
  const slowGenres = ['ambient', 'lo-fi', 'chill', 'ballad', 'acoustic'];
  
  let hasFast = genres.some(g => fastGenres.some(fg => g.includes(fg)));
  let hasSlow = genres.some(g => slowGenres.some(sg => g.includes(sg)));
  
  if (hasFast && hasSlow) return { min: 80, max: 150 };
  if (hasFast) return { min: 120, max: 180 };
  if (hasSlow) return { min: 60, max: 110 };
  return { min: 90, max: 140 };
};

/**
 * Return an empty taste profile for users without data
 */
export const getEmptyTasteProfile = (): UserTasteProfile => ({
  topArtists: [],
  topGenres: [],
  topTracks: [],
  tasteVectors: {
    avgEnergy: 0.5,
    avgValence: 0.5,
    avgDanceability: 0.5,
    avgAcousticness: 0.3,
    preferredDecade: '2020s',
    tempoRange: { min: 90, max: 140 },
  },
  recentlyPlayed: [],
  recentGenres: [],
  recentMoods: [],
  listeningPatterns: {
    morningGenres: [],
    eveningGenres: [],
    weekendGenres: [],
    workoutGenres: [],
  },
  profileUpdatedAt: new Date().toISOString(),
  confidence: 0,
});

/**
 * Format taste profile for AI prompt consumption
 */
export const formatTasteProfileForAI = (profile: UserTasteProfile): string => {
  if (profile.confidence < 0.1) {
    return 'User taste profile: Not enough listening data available yet.';
  }

  const sections: string[] = [];

  // Taste Anchors
  if (profile.topArtists.length > 0) {
    sections.push(`Top Artists: ${profile.topArtists.map(a => a.name).join(', ')}`);
  }
  
  if (profile.topGenres.length > 0) {
    sections.push(`Top Genres: ${profile.topGenres.slice(0, 5).join(', ')}`);
  }
  
  if (profile.topTracks.length > 0) {
    sections.push(`Favorite Tracks: ${profile.topTracks.map(t => t.name).join(', ')}`);
  }

  // Taste Vectors
  const vectors = profile.tasteVectors;
  const energyDesc = vectors.avgEnergy > 0.7 ? 'high-energy' : vectors.avgEnergy > 0.4 ? 'moderate-energy' : 'calm';
  const valenceDesc = vectors.avgValence > 0.6 ? 'upbeat/positive' : vectors.avgValence > 0.4 ? 'balanced' : 'melancholic/introspective';
  const acousticDesc = vectors.avgAcousticness > 0.6 ? 'acoustic/organic' : 'electronic/produced';
  
  sections.push(`Listening Profile: Prefers ${energyDesc}, ${valenceDesc} music with ${acousticDesc} sound`);
  sections.push(`Preferred Era: ${vectors.preferredDecade}`);

  // Recent Context
  if (profile.recentlyPlayed.length > 0) {
    const recentArtists = Array.from(new Set(profile.recentlyPlayed.slice(0, 5).map(t => t.artist)));
    sections.push(`Recently Playing: ${recentArtists.join(', ')}`);
  }

  // Mood Affinities
  if (profile.recentMoods.length > 0) {
    sections.push(`Mood Affinities: ${profile.recentMoods.join(', ')}`);
  }

  return `User Taste Profile (Confidence: ${Math.round(profile.confidence * 100)}%):
${sections.join('\n')}`;
};

/**
 * Get seed artists and genres for Spotify recommendations API
 */
export const getTasteSeeds = (profile: UserTasteProfile, mood?: { genres?: string[] }): {
  seed_artists?: string;
  seed_genres?: string;
  seed_tracks?: string;
} => {
  const seeds: {
    seed_artists?: string;
    seed_genres?: string;
    seed_tracks?: string;
  } = {};

  // Combine user's top artists with mood-appropriate selection
  if (profile.topArtists.length > 0) {
    seeds.seed_artists = profile.topArtists.slice(0, 2).map(a => a.id).join(',');
  }

  // Combine user's top genres with mood genres
  const userGenres = profile.topGenres.slice(0, 2);
  const moodGenres = mood?.genres?.slice(0, 2) || [];
  const combinedGenres = Array.from(new Set([...moodGenres, ...userGenres])).slice(0, 3);
  
  if (combinedGenres.length > 0) {
    seeds.seed_genres = combinedGenres.join(',');
  }

  // Add seed tracks for more specificity
  if (profile.topTracks.length > 0) {
    seeds.seed_tracks = profile.topTracks.slice(0, 1).map(t => t.id).join(',');
  }

  return seeds;
};

export const userTasteService = {
  fetchUserTasteProfile,
  formatTasteProfileForAI,
  getTasteSeeds,
  getEmptyTasteProfile,
};
