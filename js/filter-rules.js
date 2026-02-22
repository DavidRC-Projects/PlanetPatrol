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
function passesDateFilter(photo, year, month) {
  const d = getPhotoDate(photo);
  return matchesYear(d, year) && matchesMonth(d, month);
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
