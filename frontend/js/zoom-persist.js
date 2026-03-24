(function () {
  const ZOOM_KEY = "smug_zoom_level";
  let applying = false;

  function setZoom(value) {
    applying = true;
    document.documentElement.style.zoom = value;
    requestAnimationFrame(function () { applying = false; });
  }

  function applyZoom() {
    const stored = localStorage.getItem(ZOOM_KEY);
    const pct = parseInt(stored, 10);
    // Sanity-check: discard any corrupted value outside a reasonable range
    if (pct >= 80 && pct <= 200) {
      setZoom(stored);
    } else {
      localStorage.removeItem(ZOOM_KEY);
      document.documentElement.style.zoom = "";
    }
  }

  document.addEventListener("DOMContentLoaded", applyZoom);

  var resizeTimer;
  window.addEventListener("resize", function () {
    if (applying) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (applying) return;
      var ratio = window.outerWidth / window.innerWidth;
      // Only save if ratio looks like a real browser-zoom value
      if (ratio >= 0.8 && ratio <= 2.0) {
        var current = Math.round(ratio * 100) + "%";
        localStorage.setItem(ZOOM_KEY, current);
        setZoom(current);
      }
    }, 150);
  });
})();
