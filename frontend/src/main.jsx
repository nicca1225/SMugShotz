import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Zoom persistence (from zoom-persist.js)
const ZOOM_KEY = 'smug_zoom_level';
let applying = false;

function setZoom(value) {
  applying = true;
  document.documentElement.style.zoom = value;
  requestAnimationFrame(() => { applying = false; });
}

function applyZoom() {
  const stored = localStorage.getItem(ZOOM_KEY);
  const pct = parseInt(stored, 10);
  if (pct >= 80 && pct <= 200) {
    setZoom(stored);
  } else {
    localStorage.removeItem(ZOOM_KEY);
    document.documentElement.style.zoom = '';
  }
}

applyZoom();

let resizeTimer;
window.addEventListener('resize', function () {
  if (applying) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    if (applying) return;
    const ratio = window.outerWidth / window.innerWidth;
    if (ratio >= 0.8 && ratio <= 2.0) {
      const current = Math.round(ratio * 100) + '%';
      localStorage.setItem(ZOOM_KEY, current);
      setZoom(current);
    }
  }, 150);
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
