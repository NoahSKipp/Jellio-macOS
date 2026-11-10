const DEFAULT = { width: 1440, height: 900 };
const MIN = { width: 800, height: 560 };
const MAX = 16384;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

// config.json is hand-editable; anything odd falls back to the default size.
function sanitizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return { ...DEFAULT };
  if (!finite(bounds.width) || !finite(bounds.height)) return { ...DEFAULT };
  const size = {
    width: Math.round(Math.min(MAX, Math.max(MIN.width, bounds.width))),
    height: Math.round(Math.min(MAX, Math.max(MIN.height, bounds.height))),
  };
  if (!finite(bounds.x) || !finite(bounds.y) || Math.abs(bounds.x) > MAX || Math.abs(bounds.y) > MAX) return size;
  return { x: Math.round(bounds.x), y: Math.round(bounds.y), ...size };
}

function isOnScreen(bounds, workAreas) {
  if (!('x' in bounds)) return false;
  return workAreas.some(
    (area) =>
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y,
  );
}

module.exports = { MIN, isOnScreen, sanitizeBounds };
