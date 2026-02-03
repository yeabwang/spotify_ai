import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/store';
import {
  sendChatMessage,
  fetchRecommendationsForMood,
  searchSpotifyTrack,
  selectEmotionFromMap,
  initializeContext,
  setStartPoint,
  setEndPoint,
  clearPoints,
  recordTrackFeedback,
  recordTrackEvent,
  addUserMessage,
  clearChat,
  clearPlaylist,
  saveCurrentVibe,
  setShowEmotionMap,
  loadSavedVibe,
  deleteVibe,
  RecommendedTrack,
} from '../../store/slices/moodMusic';
import { playerService } from '../../services/player';
import { playlistService } from '../../services/playlists';
import { EmotionPoint } from '../../services/ai/openai';
import '../../styles/MoodMusic.scss';

const CHAT_SUGGESTIONS = [
  'Late-night drive',
  'Deep focus',
  'Feel-good pop',
  'Moody indie',
  'Chill R&B',
  'Gym energy',
];

const MoodMusicPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');
  const [saveVibeName, setSaveVibeName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showTrackDetailsModal, setShowTrackDetailsModal] = useState<number | null>(null);
  const lastPlayRef = useRef<{ trackId: string; startedAt: number } | null>(null);
  const completionTimeoutRef = useRef<number | null>(null);

  const {
    messages,
    isTyping,
    currentMood,
    startPoint,
    endPoint,
    isSelectingEnd,
    recommendations,
    isLoadingRecommendations,
    showEmotionMap,
    savedVibes,
    tasteProfile,
    isTasteLoading,
    feedbackByTrackId,
    trackStats,
  } = useAppSelector((state) => state.moodMusic);

  const user = useAppSelector((state) => state.auth.user);

  // Show notification
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Initialize context with taste profile
  useEffect(() => {
    const initContext = async () => {
      if (isInitialized) return;
      
      // Initialize with full context including user taste profile
      dispatch(initializeContext({}));
      
      setIsInitialized(true);
    };

    initContext();
  }, [dispatch, isInitialized]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch recommendations when mood changes
  useEffect(() => {
    if (currentMood && !isLoadingRecommendations && recommendations.length === 0) {
      dispatch(fetchRecommendationsForMood());
    }
  }, [currentMood, dispatch, isLoadingRecommendations, recommendations.length]);

  // Search for Spotify tracks when recommendations are received
  useEffect(() => {
    recommendations.forEach((rec, index) => {
      if (rec.isLoading && !rec.spotifyTrack && rec.searchQuery) {
        dispatch(searchSpotifyTrack({ index, searchQuery: rec.searchQuery }));
      }
    });
  }, [recommendations, dispatch]);

  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || isTyping) return;
    
    const message = chatInput.trim();
    setChatInput('');
    dispatch(addUserMessage(message));
    dispatch(sendChatMessage(message));
  }, [chatInput, isTyping, dispatch]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isTyping) return;
    setChatInput('');
    dispatch(addUserMessage(suggestion));
    dispatch(sendChatMessage(suggestion));
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    const valence = (x * 2) - 1;
    const energy = 1 - y;
    
    const point: EmotionPoint = { valence, energy };
    
    if (!startPoint || (startPoint && endPoint)) {
      dispatch(clearPoints());
      dispatch(setStartPoint(point));
    } else if (isSelectingEnd) {
      dispatch(setEndPoint(point));
      dispatch(selectEmotionFromMap({ startPoint, endPoint: point }));
      dispatch(setShowEmotionMap(false));
    }
  };


  // Play a single track
  const handlePlayTrack = async (trackUri: string, trackId: string) => {
    try {
      // Heuristic: if switching tracks quickly, mark previous as skip
      if (lastPlayRef.current && lastPlayRef.current.trackId !== trackId) {
        const elapsed = Date.now() - lastPlayRef.current.startedAt;
        if (elapsed < 30000) {
          dispatch(recordTrackEvent({ trackId: lastPlayRef.current.trackId, event: 'skip' }));
        }
      }

      // Clear any pending completion timer
      if (completionTimeoutRef.current) {
        window.clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }

      setPlayingTrackId(trackId);
      const result = await playerService.startPlayback({ uris: [trackUri] });
      if (result === undefined) {
        // Premium-only returned undefined (403)
        showNotification('error', 'Spotify Premium required');
        setPlayingTrackId(null);
      } else {
        dispatch(recordTrackEvent({ trackId, event: 'play' }));
        lastPlayRef.current = { trackId, startedAt: Date.now() };

        // Heuristic completion after 120s of playback
        completionTimeoutRef.current = window.setTimeout(() => {
          dispatch(recordTrackEvent({ trackId, event: 'complete' }));
        }, 120000);
        showNotification('success', 'Now playing');
      }
    } catch (error: any) {
      console.error('Failed to play track:', error);
      showNotification('error', 'Open Spotify app first');
      setPlayingTrackId(null);
    }
  };

  // Add track to queue
  const handleAddToQueue = async (trackUri: string) => {
    try {
      const result = await playerService.addToQueue(trackUri);
      if (result === undefined) {
        showNotification('error', 'Spotify Premium required');
      } else {
        showNotification('success', 'Added to queue');
      }
    } catch (error: any) {
      showNotification('error', 'Failed to add to queue');
    }
  };

  // Play all tracks (sorted by match score)
  const handlePlayAll = async () => {
    const sortedTracks = getSortedTracks();
    const trackUris = sortedTracks
      .filter(r => r.spotifyTrack)
      .map(r => r.spotifyTrack!.uri);
    
    if (trackUris.length > 0) {
      try {
        const result = await playerService.startPlayback({ uris: trackUris });
        if (result === undefined) {
          showNotification('error', 'Spotify Premium required');
        } else {
          showNotification('success', `Playing ${trackUris.length} tracks`);
          if (sortedTracks[0]?.spotifyTrack?.id) {
            setPlayingTrackId(sortedTracks[0].spotifyTrack.id);
            dispatch(recordTrackEvent({ trackId: sortedTracks[0].spotifyTrack.id, event: 'play' }));
            lastPlayRef.current = { trackId: sortedTracks[0].spotifyTrack.id, startedAt: Date.now() };
          }
        }
      } catch (error: any) {
        showNotification('error', 'Open Spotify app first');
      }
    }
  };

  // Save playlist to Spotify
  const handleSavePlaylist = async () => {
    if (!user || !user.id || !currentMood) {
      showNotification('error', 'Please log in to save playlists');
      return;
    }
    
    const sortedTracks = getSortedTracks();
    const trackUris = sortedTracks
      .filter(r => r.spotifyTrack)
      .map(r => r.spotifyTrack!.uri);
    
    if (trackUris.length === 0) {
      showNotification('error', 'No tracks to save');
      return;
    }
    
    try {
      const playlist = await playlistService.createPlaylist(user.id, {
        name: currentMood.playlistName,
        description: `Created by Spotify AI: ${currentMood.moodDescription}`,
        public: false,
      });
      
      await playlistService.addPlaylistItems(playlist.data.id, trackUris, playlist.data.snapshot_id);
      
      // Record save events for reward model
      sortedTracks
        .filter(r => r.spotifyTrack)
        .forEach(r => dispatch(recordTrackEvent({ trackId: r.spotifyTrack!.id, event: 'save' })));

      showNotification('success', `Saved "${currentMood.playlistName}"!`);
    } catch (error) {
      console.error('Failed to create playlist:', error);
      showNotification('error', 'Failed to save playlist');
    }
  };

  // Save vibe with full context
  const handleSaveVibe = () => {
    if (currentMood) {
      dispatch(saveCurrentVibe(saveVibeName || currentMood.playlistName));
      setShowSaveModal(false);
      setSaveVibeName('');
      showNotification('success', 'Vibe saved!');
    }
  };

  // Load a saved vibe
  const handleLoadVibe = (mood: any) => {
    dispatch(loadSavedVibe(mood));
    dispatch(clearPlaylist());
  };

  const getLineStyle = () => {
    if (!startPoint || !endPoint) return {};
    
    const startX = ((startPoint.valence + 1) / 2) * 100;
    const startY = (1 - startPoint.energy) * 100;
    const endX = ((endPoint.valence + 1) / 2) * 100;
    const endY = (1 - endPoint.energy) * 100;
    
    const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    
    return {
      left: `${startX}%`,
      top: `${startY}%`,
      width: `${length}%`,
      transform: `rotate(${angle}deg)`,
    };
  };

  // Get tracks sorted by match score (descending)
  // Get tracks sorted by combined match score (average of taste + mood)
  const getSortedTracks = useCallback(() => {
    if (!currentMood) return recommendations;
    
    return [...recommendations]
      .map(rec => {
        const tasteScore = rec.tasteAlignment?.score ?? 75;
        const moodScore = rec.moodFit?.score ?? 80;
        const combinedScore = Math.round((tasteScore + moodScore) / 2);
        const trackId = rec.spotifyTrack?.id;
        const feedbackWeight = trackId ? (feedbackByTrackId[trackId]?.weight ?? 0) : 0;
        const stats = trackId ? trackStats[trackId] : undefined;
        const rewardDelta = stats ? (stats.saves * 2 + stats.completions * 3 - stats.skips * 2) : 0;
        const adjustedScore = combinedScore + (feedbackWeight * 8) + rewardDelta;
        return {
          ...rec,
          matchScore: combinedScore,
          rankScore: adjustedScore
        };
      })
      .sort((a, b) => (b as any).rankScore - (a as any).rankScore);
  }, [recommendations, currentMood, feedbackByTrackId, trackStats]);

  const sortedTracks = getSortedTracks();
  const hasPlaylist = recommendations.some(r => r.spotifyTrack);

  return (
    <div className="mood-music-page">
      {/* Notification Toast */}
      {notification && (
        <div className={`notification-toast ${notification.type}`}>
          {notification.type === 'success' ? '✓' : '⚠'} {notification.message}
        </div>
      )}

      {/* LEFT PANEL - Chat */}
      <div className="left-panel">
        <div className="vibes-header">
          <h3>Mood Journey</h3>
          <button 
            className="emotion-map-btn"
            onClick={() => dispatch(setShowEmotionMap(true))}
            title="Emotion Map"
          >
            ✨
          </button>
        </div>

        {/* Saved Vibes */}
        {savedVibes.length > 0 && (
          <div className="saved-vibes">
            <h4>💾 Your Vibes</h4>
            <div className="saved-vibes-list">
              {savedVibes.slice(0, 3).map((vibe) => (
                <div key={vibe.id} className="saved-vibe-item">
                  <button 
                    className="vibe-load-btn"
                    onClick={() => handleLoadVibe(vibe.mood)}
                  >
                    {vibe.name}
                  </button>
                  <button 
                    className="vibe-delete-btn"
                    onClick={() => dispatch(deleteVibe(vibe.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Container */}
        <div className="chat-container">
          <div className="chat-header">
            <h3>Spotify AI</h3>
            {/* Taste Profile Indicator */}
            {tasteProfile && tasteProfile.confidence > 0 && (
              <div className="taste-indicator" title={`Based on your top genres: ${tasteProfile.topGenres.slice(0, 3).join(', ')}`}>
                <span className="taste-dot"></span>
                <span className="taste-text">Personalized</span>
              </div>
            )}
            {isTasteLoading && (
              <div className="taste-indicator loading">
                <span className="taste-text">Loading your taste...</span>
              </div>
            )}
            {messages.length > 0 && (
              <button className="clear-btn" onClick={() => dispatch(clearChat())}>
                Clear
              </button>
            )}
          </div>

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="welcome-message">
                <span className="ai-avatar">✨</span>
                <div className="welcome-content">
                  <strong>What are you in the mood for?</strong>
                  <p>Describe a vibe, activity, or feeling — I'll create a playlist that matches.</p>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <span className={msg.role === 'user' ? 'user-avatar' : 'ai-avatar'}>
                    {msg.role === 'user' ? '👤' : '✨'}
                  </span>
                  <div className="message-bubble">{msg.content}</div>
                </div>
              ))
            )}
            {isTyping && (
              <div className="message assistant">
                <span className="ai-avatar">✨</span>
                <div className="typing-indicator">
                  <span className="typing-text">Spotify AI is creating your vibe...</span>
                  <div className="typing-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-wrapper">
            <textarea
              ref={chatInputRef}
              placeholder="Describe a vibe, moment, or feeling..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isTyping}
              rows={1}
            />
            <button 
              className="send-btn"
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isTyping}
            >
              ↑
            </button>
          </div>
          <div className="chat-suggestions">
            {CHAT_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                className="suggestion-chip"
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isTyping}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL - Playlist */}
      <div className="right-panel">
        {currentMood ? (
          <>
            {/* Playlist Header */}
            <div className="playlist-header">
              <div className="playlist-info">
                <h2>{currentMood.playlistName}</h2>
                <p className="mood-description">{currentMood.moodDescription}</p>
              </div>
            </div>

            {/* Genre Tags */}
            <div className="genre-tags">
              {currentMood.suggestedGenres.slice(0, 4).map((genre, i) => (
                <span key={i} className="genre-tag">{genre}</span>
              ))}
            </div>

            {/* Track List Header */}
            <div className="track-list-header">
              <span className="col-num">#</span>
              <span className="col-track">Track</span>
              <span className="col-match">Match</span>
              <span className="col-actions"></span>
            </div>

            {/* Track List - Sorted by match score */}
            <div className="track-list">
              {isLoadingRecommendations ? (
                Array(8).fill(0).map((_, i) => (
                  <div key={i} className="track-row">
                    <div className="track-number">{i + 1}</div>
                    <div className="track-skeleton">
                      <div className="skeleton-image" />
                      <div className="skeleton-text">
                        <div className="skeleton-line short" />
                        <div className="skeleton-line" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                sortedTracks.map((rec, index) => {
                  const isPlaying = rec.spotifyTrack?.id === playingTrackId;
                  const tasteScore = rec.tasteAlignment?.score ?? 75;
                  const moodScore = rec.moodFit?.score ?? 80;
                  // Combined match score (average of taste and mood)
                  const combinedMatch = Math.round((tasteScore + moodScore) / 2);
                  
                  return (
                    <div 
                      key={index} 
                      className={`track-row ${isPlaying ? 'playing' : ''} ${rec.isLoading ? 'loading' : ''}`}
                    >
                      <div className="track-number">{index + 1}</div>
                      
                      {rec.isLoading ? (
                        <div className="track-skeleton">
                          <div className="skeleton-image" />
                          <div className="skeleton-text">
                            <div className="skeleton-line short" />
                            <div className="skeleton-line" />
                          </div>
                        </div>
                      ) : rec.spotifyTrack ? (
                        <>
                          <img 
                            className="track-cover"
                            src={rec.spotifyTrack.album?.images?.[2]?.url || rec.spotifyTrack.album?.images?.[0]?.url}
                            alt={rec.spotifyTrack.name}
                          />
                          <div className="track-details">
                            <div className="track-name">{rec.spotifyTrack.name}</div>
                            <div className="track-artist">
                              {rec.spotifyTrack.artists.map(a => a.name).join(', ')}
                            </div>
                          </div>
                          
                          {/* Combined Match Score */}
                          {combinedMatch >= 90 ? (
                            <div className="match-score-combined high">
                              <span className="score-value">{combinedMatch}%</span>
                              <span className="score-label">match</span>
                            </div>
                          ) : (
                            <div className="match-score-combined empty" />
                          )}
                          
                          <div className="track-actions">
                            <button 
                              className={`action-btn play ${isPlaying ? 'playing' : ''}`}
                              onClick={() => handlePlayTrack(rec.spotifyTrack!.uri, rec.spotifyTrack!.id)}
                              title="Play"
                            >
                              {isPlaying ? '⏸' : '▶'}
                            </button>
                            <button 
                              className="action-btn add"
                              onClick={() => handleAddToQueue(rec.spotifyTrack!.uri)}
                              title="Add to queue"
                            >
                              +
                            </button>
                            <button 
                              className="action-btn info"
                              onClick={() => setShowTrackDetailsModal(index)}
                              title="Why this track?"
                            >
                              ?
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="track-error">
                          <span>Track unavailable</span>
                          <small>{rec.searchQuery}</small>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Playlist Actions */}
            {hasPlaylist && (
              <div className="playlist-actions">
                <button className="btn-primary" onClick={handlePlayAll}>
                  ▶️ Play All
                </button>
                <button className="btn-secondary" onClick={handleSavePlaylist}>
                  💾 Save
                </button>
                <button className="btn-secondary" onClick={() => setShowSaveModal(true)}>
                  ⭐ Vibe
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-playlist">
            <div className="empty-icon">✨</div>
            <h3>Your Playlist Awaits</h3>
            <p>Tell me what you're feeling and I'll curate the perfect soundtrack</p>
          </div>
        )}
      </div>

      {/* Emotion Map Modal */}
      {showEmotionMap && (
        <div className="modal-backdrop" onClick={() => dispatch(setShowEmotionMap(false))}>
          <div className="emotion-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
                <h2>✨ Emotion Journey</h2>
              <button onClick={() => dispatch(setShowEmotionMap(false))}>×</button>
            </div>
            <p className="modal-instruction">
              {!startPoint ? '👆 Tap where you are right now' : '🎯 Now tap where you want to go'}
            </p>
            <div className="emotion-grid" onClick={handleMapClick}>
              <div className="quadrant q1"><span>😤</span><small>Intense</small></div>
              <div className="quadrant q2"><span>😊</span><small>Joyful</small></div>
              <div className="quadrant q3"><span>😢</span><small>Sad</small></div>
              <div className="quadrant q4"><span>😌</span><small>Peaceful</small></div>
              
              <span className="axis top">High Energy</span>
              <span className="axis bottom">Low Energy</span>
              <span className="axis left">Negative</span>
              <span className="axis right">Positive</span>
              
              {startPoint && (
                <div 
                  className="point start"
                  style={{
                    left: `${((startPoint.valence + 1) / 2) * 100}%`,
                    top: `${(1 - startPoint.energy) * 100}%`
                  }}
                >
                  S
                </div>
              )}
              {endPoint && (
                <>
                  <div className="journey-line" style={getLineStyle()} />
                  <div 
                    className="point end"
                    style={{
                      left: `${((endPoint.valence + 1) / 2) * 100}%`,
                      top: `${(1 - endPoint.energy) * 100}%`
                    }}
                  >
                    E
                  </div>
                </>
              )}
            </div>
            <button className="reset-btn" onClick={() => dispatch(clearPoints())}>
              Reset Points
            </button>
          </div>
        </div>
      )}

      {/* Save Vibe Modal */}
      {showSaveModal && (
        <div className="modal-backdrop" onClick={() => setShowSaveModal(false)}>
          <div className="save-modal" onClick={(e) => e.stopPropagation()}>
            <h3>⭐ Save This Vibe</h3>
            <p>Remember this mood for later</p>
            <input
              type="text"
              placeholder={currentMood?.playlistName || 'Give it a name...'}
              value={saveVibeName}
              onChange={(e) => setSaveVibeName(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveVibe}>
                Save Vibe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Track Details Modal - "Why This Music?" Popup */}
      {showTrackDetailsModal !== null && sortedTracks[showTrackDetailsModal]?.spotifyTrack && (() => {
        const rec = sortedTracks[showTrackDetailsModal];
        const track = rec.spotifyTrack!;
        const tasteScore = rec.tasteAlignment?.score ?? 75;
        const moodScore = rec.moodFit?.score ?? 80;
        const combinedMatch = Math.round((tasteScore + moodScore) / 2);
        const popularity = track.popularity || 0;
        const isTrending = popularity >= 70;
        const isPopular = popularity >= 50;
        const playCount = trackStats[track.id]?.plays ?? 0;
        
        return (
          <div className="modal-backdrop" onClick={() => setShowTrackDetailsModal(null)}>
            <div className="track-details-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowTrackDetailsModal(null)}>×</button>
              
              {/* Track Header */}
              <div className="track-modal-header">
                <img 
                  src={track.album?.images?.[0]?.url || track.album?.images?.[1]?.url}
                  alt={track.name}
                  className="track-modal-cover"
                />
                <div className="track-modal-info">
                  <h2>{track.name}</h2>
                  <p className="track-modal-artist">{track.artists.map(a => a.name).join(', ')}</p>
                  <p className="track-modal-album">{track.album?.name}</p>
                  
                  {/* Status Badges */}
                  <div className="track-status-badges">
                    {isTrending && (
                      <span className="status-badge trending">🔥 Trending</span>
                    )}
                    {isPopular && !isTrending && (
                      <span className="status-badge popular">📈 Popular</span>
                    )}
                    {rec.discoveryLevel === 'discovery' && (
                      <span className="status-badge discovery">✨ New Discovery</span>
                    )}
                    {rec.discoveryLevel === 'familiar' && (
                      <span className="status-badge familiar">🎯 Your Style</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Match Breakdown */}
              <div className="match-breakdown">
                <div className="match-overall">
                  <div className={`match-circle ${combinedMatch >= 90 ? 'high' : combinedMatch >= 75 ? 'medium' : 'low'}`}>
                    <span className="match-number">{combinedMatch}</span>
                    <span className="match-percent">%</span>
                  </div>
                  <span className="match-label">Overall Match</span>
                </div>
                <div className="match-details-grid">
                  <div className="match-detail">
                    <span className="detail-icon">🎧</span>
                    <span className="detail-label">Taste Match</span>
                    <span className={`detail-value ${tasteScore >= 85 ? 'high' : tasteScore >= 70 ? 'medium' : 'low'}`}>{tasteScore}%</span>
                  </div>
                  <div className="match-detail">
                    <span className="detail-icon">🌈</span>
                    <span className="detail-label">Mood Match</span>
                    <span className={`detail-value ${moodScore >= 85 ? 'high' : moodScore >= 70 ? 'medium' : 'low'}`}>{moodScore}%</span>
                  </div>
                  <div className="match-detail">
                    <span className="detail-icon">📊</span>
                    <span className="detail-label">Popularity</span>
                    <span className="detail-value">{popularity}/100</span>
                  </div>
                  <div className="match-detail">
                    <span className="detail-icon">▶️</span>
                    <span className="detail-label">You played</span>
                    <span className="detail-value">{playCount}x</span>
                  </div>
                </div>
              </div>

              {/* Why This Track Section */}
              <div className="why-section">
                <h3>🎯 Why This Track?</h3>
                <ul className="why-bullets">
                  {(rec.reasoningBullets || [rec.reason]).map((bullet, i) => (
                    <li key={i}>{bullet}</li>
                  ))}
                </ul>
              </div>

              {/* Taste Alignment */}
              {rec.tasteAlignment && (
                <div className="alignment-section">
                  <h3>🎧 How It Fits Your Taste</h3>
                  <p>{rec.tasteAlignment.explanation}</p>
                  {((rec.tasteAlignment.matchedGenres?.length ?? 0) > 0 || (rec.tasteAlignment.matchedArtists?.length ?? 0) > 0) && (
                    <div className="alignment-tags">
                      {rec.tasteAlignment.matchedGenres?.map((genre, i) => (
                        <span key={`genre-${i}`} className="alignment-tag genre">{genre}</span>
                      ))}
                      {rec.tasteAlignment.matchedArtists?.map((artist, i) => (
                        <span key={`artist-${i}`} className="alignment-tag artist">Like {artist}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Mood Fit */}
              {rec.moodFit && (
                <div className="mood-section">
                  <h3>🌈 Mood Alignment</h3>
                  <p>{rec.moodFit.explanation}</p>
                </div>
              )}

              {/* Feedback Buttons */}
              <div className="feedback-section">
                <h3>🧠 Tune My Taste</h3>
                <div className="feedback-buttons">
                  <button
                    className="feedback-btn positive"
                    onClick={() => dispatch(recordTrackFeedback({ trackId: track.id, feedback: 'more' }))}
                  >
                    More like this
                  </button>
                  <button
                    className="feedback-btn neutral"
                    onClick={() => dispatch(recordTrackFeedback({ trackId: track.id, feedback: 'less' }))}
                  >
                    Less like this
                  </button>
                  <button
                    className="feedback-btn negative"
                    onClick={() => dispatch(recordTrackFeedback({ trackId: track.id, feedback: 'not' }))}
                  >
                    Not my vibe
                  </button>
                  <button
                    className="feedback-btn positive"
                    onClick={() => dispatch(recordTrackFeedback({ trackId: track.id, feedback: 'perfect' }))}
                  >
                    Perfect
                  </button>
                </div>
              </div>

              {/* Play Actions */}
              <div className="modal-play-actions">
                <button 
                  className="btn-primary"
                  onClick={() => {
                    handlePlayTrack(track.uri, track.id);
                    setShowTrackDetailsModal(null);
                  }}
                >
                  ▶️ Play Now
                </button>
                <button 
                  className="btn-secondary"
                  onClick={() => {
                    handleAddToQueue(track.uri);
                    setShowTrackDetailsModal(null);
                  }}
                >
                  + Add to Queue
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default MoodMusicPage;
