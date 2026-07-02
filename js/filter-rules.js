/**
 * loops through all photos.
 * For each photo, it calls these checks.
 * Only photos that pass all relevant checks are kept in the final filtered result.
 */

/** Returns true if photo passes status filter (moderated/unmoderated). */
function passesStatusFilter(photo, status) {
  if (status === 'all') return true;
  if (status === 'moderated') return isModerated(photo);
  if (status === 'unmoderated') return !isModerated(photo);
  return true;
}

/** Returns true if photo has at least minPieces. */
function passesPiecesFilter(photo, minPieces) {
  return getPieces(photo) >= minPieces;
}

/** Returns true if photo passes year/month filters. */
function passesDateFilter(photo, year, month, day) {
  const d = getPhotoDate(photo);
  return matchesYear(d, year) && matchesMonth(d, month) && matchesDay(d, day);
}

/** Returns true if photo matches selected location bucket. */
function passesLocationFilter(photo, selectedLocation) {
  if (!selectedLocation) return true;
  return getPhotoLocationKey(photo) === selectedLocation;
}

function normalizeBrandLabelSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function categoryMatchesBrandLabelSearch(category, normalizedTerm) {
  if (!normalizedTerm) return true;
  const brand = String(category?.brand || '').trim().toLowerCase();
  const label = String(category?.label || '').trim().toLowerCase();
  return brand.includes(normalizedTerm) || label.includes(normalizedTerm);
}

/** Returns true if photo brand/label matches search input. */
function passesBrandLabelFilter(photo, searchTerm) {
  const normalizedTerm = normalizeBrandLabelSearch(searchTerm);
  if (!normalizedTerm) return true;
  return getPhotoCategories(photo).some((category) =>
    categoryMatchesBrandLabelSearch(category, normalizedTerm)
  );
}

/** True when any dashboard filter narrows the photo set from “all missions, all locations, all time”. */
function hasActivePhotoFilters(values) {
  if (!values) return false;
  return !!(
    values.mission ||
    values.country ||
    values.constituency ||
    values.year ||
    values.month ||
    values.day ||
    (values.status && values.status !== 'all') ||
    String(values.brandLabelSearch || '').trim()
  );
}

/** True when filters narrow beyond mission alone (date, location, status, search, etc.). */
function hasScopedPhotoFilters(values) {
  if (!values) return false;
  return !!(
    values.country ||
    values.constituency ||
    values.year ||
    values.month ||
    values.day ||
    (values.status && values.status !== 'all') ||
    String(values.brandLabelSearch || '').trim()
  );
}

/**
 * Matches Plastic Patrol mission totalPieces: pending photos plus published;
 * excludes moderated submissions that were not published.
 */
function passesMissionOfficialCountFilter(photo) {
  if (photo?.moderated == null) return true;
  if (typeof photo?.published === 'boolean') return photo.published;
  if (typeof photo?.published === 'string') {
    const normalized = photo.published.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return true;
}

function shouldApplyMissionOfficialCountFilter(missionKey, missions, status, country, constituency, year, month, day, brandLabelSearch) {
  if (!missionKey) return false;
  const mission = missions?.[missionKey];
  const official = Number(mission?.totalPieces);
  if (!Number.isFinite(official) || official <= 0) return false;
  return !(
    country ||
    constituency ||
    year ||
    month ||
    day ||
    (status && status !== 'all') ||
    String(brandLabelSearch || '').trim()
  );
}
