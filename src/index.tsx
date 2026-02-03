import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

import i18n from './i18n';

import TimeAgo from 'javascript-time-ago';

import en from 'javascript-time-ago/locale/en';
import es from 'javascript-time-ago/locale/es-AR';

TimeAgo.addDefaultLocale(en);
TimeAgo.addLocale(es);

// Force English language on load - clear any persisted Spanish setting
const persistedRoot = localStorage.getItem('persist:root');
if (persistedRoot) {
  try {
    const parsed = JSON.parse(persistedRoot);
    if (parsed.language) {
      // Always force English
      parsed.language = JSON.stringify({ language: 'en', isModalOpen: false });
      localStorage.setItem('persist:root', JSON.stringify(parsed));
    }
  } catch (e) {
    // Ignore parse errors
  }
}

// Force i18n to English immediately
i18n.changeLanguage('en');

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
