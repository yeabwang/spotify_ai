import React, { useState, useEffect } from 'react';
import { 
  loadAPIKeys, 
  saveAPIKeys, 
  clearAPIKeys, 
  isFullyConfigured,
  APIKeys 
} from '../../services/apiKeys';
import './Settings.scss';

const Settings: React.FC = () => {
  const [keys, setKeys] = useState<APIKeys>({
    spotifyClientId: '',
    openaiApiKey: '',
    spotifyRedirectUrl: '',
  });
  const [showKeys, setShowKeys] = useState({
    spotify: false,
    openai: false,
  });
  const [saved, setSaved] = useState(false);
  const [configStatus, setConfigStatus] = useState(isFullyConfigured());

  useEffect(() => {
    const savedKeys = loadAPIKeys();
    setKeys({
      spotifyClientId: savedKeys.spotifyClientId || '',
      openaiApiKey: savedKeys.openaiApiKey || '',
      spotifyRedirectUrl: savedKeys.spotifyRedirectUrl || window.location.origin,
    });
    setConfigStatus(isFullyConfigured());
  }, []);

  const handleSave = () => {
    saveAPIKeys(keys);
    setSaved(true);
    setConfigStatus(isFullyConfigured());
    setTimeout(() => setSaved(false), 3000);
    
    // Reload the page to apply new keys
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all API keys? You will need to re-enter them to use the app.')) {
      clearAPIKeys();
      setKeys({
        spotifyClientId: '',
        openaiApiKey: '',
        spotifyRedirectUrl: window.location.origin,
      });
      setConfigStatus(isFullyConfigured());
      window.location.reload();
    }
  };

  const hasEnvKeys = !!(process.env.REACT_APP_SPOTIFY_CLIENT_ID || process.env.REACT_APP_OPENAI_API_KEY);

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1>⚙️ Settings</h1>
        <p className="settings-subtitle">
          Configure your API keys to use Spotify AI. Your keys are stored locally and never sent to our servers.
        </p>

        {/* Status Banner */}
        <div className={`status-banner ${configStatus.configured ? 'configured' : 'not-configured'}`}>
          {configStatus.configured ? (
            <>
              <span className="status-icon">✅</span>
              <span>All API keys are configured. You're ready to use Spotify AI!</span>
            </>
          ) : (
            <>
              <span className="status-icon">⚠️</span>
              <span>Missing: {configStatus.missing.join(', ')}</span>
            </>
          )}
        </div>

        {hasEnvKeys && (
          <div className="env-notice">
            <span className="notice-icon">ℹ️</span>
            <span>Some keys are pre-configured. Your personal keys will override them.</span>
          </div>
        )}

        {/* Spotify Settings */}
        <div className="settings-section">
          <h2>🎵 Spotify API</h2>
          <p className="section-description">
            Get your credentials from the{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">
              Spotify Developer Dashboard
            </a>
          </p>

          <div className="form-group">
            <label htmlFor="spotifyClientId">Client ID</label>
            <div className="input-wrapper">
              <input
                id="spotifyClientId"
                type={showKeys.spotify ? 'text' : 'password'}
                value={keys.spotifyClientId}
                onChange={(e) => setKeys({ ...keys, spotifyClientId: e.target.value })}
                placeholder="Enter your Spotify Client ID"
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowKeys({ ...showKeys, spotify: !showKeys.spotify })}
              >
                {showKeys.spotify ? '🙈' : '👁️'}
              </button>
            </div>
            <small>Found in your Spotify app settings</small>
          </div>

          <div className="form-group">
            <label htmlFor="spotifyRedirectUrl">Redirect URL</label>
            <input
              id="spotifyRedirectUrl"
              type="text"
              value={keys.spotifyRedirectUrl}
              onChange={(e) => setKeys({ ...keys, spotifyRedirectUrl: e.target.value })}
              placeholder={window.location.origin}
            />
            <small>Must match the URL in your Spotify app settings (usually {window.location.origin})</small>
          </div>
        </div>

        {/* OpenAI Settings */}
        <div className="settings-section">
          <h2>🤖 OpenAI API</h2>
          <p className="section-description">
            Get your API key from{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              OpenAI Platform
            </a>
          </p>

          <div className="form-group">
            <label htmlFor="openaiApiKey">API Key</label>
            <div className="input-wrapper">
              <input
                id="openaiApiKey"
                type={showKeys.openai ? 'text' : 'password'}
                value={keys.openaiApiKey}
                onChange={(e) => setKeys({ ...keys, openaiApiKey: e.target.value })}
                placeholder="sk-..."
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowKeys({ ...showKeys, openai: !showKeys.openai })}
              >
                {showKeys.openai ? '🙈' : '👁️'}
              </button>
            </div>
            <small>Starts with "sk-" - keep this secret!</small>
          </div>
        </div>

        {/* Setup Guide */}
        <div className="settings-section guide-section">
          <h2>📖 Quick Setup Guide</h2>
          <ol>
            <li>
              <strong>Spotify:</strong> Go to{' '}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">
                developer.spotify.com/dashboard
              </a>
              , create an app, and copy the Client ID. Add <code>{window.location.origin}</code> as a Redirect URI.
            </li>
            <li>
              <strong>OpenAI:</strong> Go to{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                platform.openai.com/api-keys
              </a>
              , create a new secret key, and paste it here.
            </li>
            <li>
              <strong>Save:</strong> Click "Save Settings" and the app will reload with your keys.
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>
            {saved ? '✅ Saved!' : '💾 Save Settings'}
          </button>
          <button className="btn-secondary" onClick={handleClear}>
            🗑️ Clear All Keys
          </button>
        </div>

        {/* Security Notice */}
        <div className="security-notice">
          <h3>🔒 Security</h3>
          <ul>
            <li>Your keys are stored only in your browser's localStorage</li>
            <li>Keys are obfuscated to prevent casual viewing</li>
            <li>Keys are never sent to any server except the respective APIs</li>
            <li>Clear your browser data to remove all stored keys</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Settings;
