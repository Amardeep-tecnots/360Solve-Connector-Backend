import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './app.css';

console.log('[RENDERER] App entry point loaded, styles imported');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
