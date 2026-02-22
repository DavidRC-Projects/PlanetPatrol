/** Returns total pieces from photo object (handles missing pieces). */
function getPieces(photo) {
  return Math.max(0, Number(photo?.pieces) || 0);
}

/** Returns true if photo is moderated. Uses published flag when available. */
function isModerated(photo) {
  if (typeof photo?.published === 'boolean') return photo.published;
  if (typeof photo?.published === 'string') {
    const normalized = photo.published.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return !!(photo?.moderated);
}

/** Returns Date from photo (updated, moderated, or created). */
function getPhotoDate(photo) {
  const str = photo?.updated || photo?.moderated || photo?.created;
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns photo categories array, or empty list. */
function getPhotoCategories(photo) {
  return Array.isArray(photo?.categories) ? photo.categories : [];
}

/** Returns category count, defaulting to 1 if missing. */
function getCategoryCount(category) {
  const n = Number(category?.number);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Returns normalized category value, defaulting to "undefined". */
function getCategoryValue(category, fieldName) {
  const raw = String(category?.[fieldName] || '').trim();
  return raw || 'undefined';
}

/** Returns location coordinates from photo, if present. */
function getPhotoCoordinates(photo) {
  const lat = Number(photo?.location?._latitude);
  const lon = Number(photo?.location?._longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/** Returns normalized location key for dropdown grouping. */
function getPhotoLocationKey(photo) {
  const coords = getPhotoCoordinates(photo);
  if (!coords) return 'undefined';
  const lat = coords.lat.toFixed(2);
  const lon = coords.lon.toFixed(2);
  return `${lat}, ${lon}`;
}
