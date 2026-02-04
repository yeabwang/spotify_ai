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
    openaiApiKey: '',
  });
  const [showKeys, setShowKeys] = useState({
    openai: false,
  });
  const [saved, setSaved] = useState(false);
  const [configStatus, setConfigStatus] = useState(isFullyConfigured());

  useEffect(() => {
    const savedKeys = loadAPIKeys();
    setKeys({
      openaiApiKey: savedKeys.openaiApiKey || '',
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
    if (window.confirm('Are you sure you want to clear your API key? You will need to re-enter it to use AI features.')) {
      clearAPIKeys();
      setKeys({
        openaiApiKey: '',
      });
      setConfigStatus(isFullyConfigured());
      window.location.reload();
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1>⚙️ Settings</h1>
        <p className="settings-subtitle">
          Configure your OpenAI API key to enable AI-powered music discovery. Your key is stored locally and never sent to our servers.
        </p>

        {/* Status Banner */}
        <div className={`status-banner ${configStatus.configured ? 'configured' : 'not-configured'}`}>
          {configStatus.configured ? (
            <>
              <span className="status-icon">✅</span>
              <span>OpenAI API key configured. You're ready to use AI features!</span>
            </>
          ) : (
            <>
              <span className="status-icon">⚠️</span>
              <span>Missing: {configStatus.missing.join(', ')}</span>
            </>
          )}
        </div>

        {/* Spotify Info Banner */}
        <div className="env-notice">
          <span className="notice-icon">🎵</span>
          <span>Spotify integration is pre-configured. Just log in with your Spotify account to start!</span>
        </div>

        {/* OpenAI Settings */}
        <div className="settings-section">
          <h2>🤖 OpenAI API</h2>
          <p className="section-description">
            Get your API key from{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
              OpenAI Platform
            </a>
            {' '}to enable AI-powered playlist generation.
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
              <strong>Get OpenAI API Key:</strong> Go to{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                platform.openai.com/api-keys
              </a>
              , create a new secret key, and paste it above.
            </li>
            <li>
              <strong>Save:</strong> Click "Save Settings" and the app will reload with your key.
            </li>
            <li>
              <strong>Start Using:</strong> Go to the AI chat and describe what music you want!
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>
            {saved ? '✅ Saved!' : '💾 Save Settings'}
          </button>
          <button className="btn-secondary" onClick={handleClear}>
            🗑️ Clear API Key
          </button>
        </div>

        {/* Security Notice */}
        <div className="security-notice">
          <h3>🔒 Security</h3>
          <ul>
            <li>Your API key is stored only in your browser's localStorage</li>
            <li>Key is obfuscated to prevent casual viewing</li>
            <li>Key is never sent to any server except OpenAI's API</li>
            <li>Clear your browser data to remove the stored key</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Settings;
