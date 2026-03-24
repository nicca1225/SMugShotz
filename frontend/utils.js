/**
 * SMugShotz — zoom persistence across pages
 *
 * WHY THE PREVIOUS VERSION FAILED
 * ─────────────────────────────────
 * It stored a "base DPR" on first visit. If the user was already at
 * 75% zoom when they first visited, base = 0.75. Then zoom factor
 * = 0.75/0.75 = 1.0, so the key was cleared and the next page got
 * no correction.
 *
 * NEW APPROACH
 * ─────────────
 * Store the raw devicePixelRatio (DPR) immediately on every page
 * load. On the next page, compare stored DPR to current DPR:
 *
 *   • Same  → browser preserved zoom → do nothing.
 *   • Different → browser reset zoom → apply CSS zoom = saved/current
 *                 so the page visually matches the user's last zoom.
 *
 * When the user explicitly zooms on a page, we clear the CSS
 * override (browser zoom is now the truth) and store the new DPR.
 *
 * Works correctly on HiDPI (2×) screens: ratio saved/current always
 * gives the right factor regardless of the screen's native DPR.
 *
 * Key: smug_zoom_dpr  — raw DPR from the previous page
 */
(function () {
  'use strict';

  var KEY = 'smug_zoom_dpr';
  var root = document.documentElement;

  // Remove stale keys from the previous (broken) implementation.
  localStorage.removeItem('smug_zoom_level');
  localStorage.removeItem('smug_base_dpr');

  var currentDpr = window.devicePixelRatio || 1;
  var savedDpr   = parseFloat(localStorage.getItem(KEY) || '0');

  // ── 1. Restore zoom if the browser reset it ──────────────────────
  // If saved and current DPR differ, the browser wiped the zoom when
  // navigating. Re-apply it via CSS zoom so the page looks the same.
  if (savedDpr > 0 && Math.abs(savedDpr - currentDpr) > 0.04) {
    root.style.zoom = savedDpr / currentDpr;
  }

  // ── 2. Save immediately ──────────────────────────────────────────
  // Always persist the intended DPR right now. This covers the case
  // where the user navigates without triggering any resize event
  // (e.g. they just click a link immediately after landing).
  localStorage.setItem(KEY, savedDpr > 0 ? savedDpr : currentDpr);

  // ── 3. Track explicit zoom changes ──────────────────────────────
  // DPR changes only on browser zoom — not on plain window resize.
  // When the user zooms: clear our CSS override (their browser zoom
  // is now the intended level) and save the new raw DPR.
  var lastDpr = currentDpr;

  window.addEventListener('resize', function () {
    var dpr = window.devicePixelRatio || 1;
    if (Math.abs(dpr - lastDpr) < 0.02) return; // not a zoom event
    lastDpr = dpr;

    // Remove CSS correction — browser zoom is now ground truth.
    root.style.zoom = '';

    // Save the new intended DPR for the next page.
    localStorage.setItem(KEY, dpr);
  });
}());
