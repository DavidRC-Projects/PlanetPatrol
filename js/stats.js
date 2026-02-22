/** Shared reducer for piece totals with optional predicate. */
function sumPieces(photos, predicate) {
  photos = photos || {};
  let sum = 0;
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    if (!predicate || predicate(photo)) sum += getPieces(photo);
  }
  return sum;
}

/** Shared counter with optional predicate. */
function countPhotos(photos, predicate) {
  photos = photos || {};
  let count = 0;
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    if (!predicate || predicate(photo)) count++;
  }
  return count;
}

/** Sums pieces across all photos. */
function sumTotalPieces(photos) {
  return sumPieces(photos);
}

/** Sums pieces for unmoderated photos only. */
function sumUnmoderatedPieces(photos) {
  return sumPieces(photos, (photo) => !isModerated(photo));
}

/** Counts moderated photos. */
function countModerated(photos) {
  return countPhotos(photos, isModerated);
}

/** Counts unmoderated photos. */
function countUnmoderated(photos) {
  return countPhotos(photos, (photo) => !isModerated(photo));
}

/** Aggregates category totals by field (e.g. brand, label). */
function aggregateCategoryTotals(photos, fieldName) {
  photos = photos || {};
  const totals = new Map();
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const categories = getPhotoCategories(photo);
    if (!categories.length) {
      totals.set('undefined', (totals.get('undefined') || 0) + 1);
      continue;
    }
    for (const category of categories) {
      const key = getCategoryValue(category, fieldName);
      const next = (totals.get(key) || 0) + getCategoryCount(category);
      totals.set(key, next);
    }
  }
  return totals;
}

/** Returns top N category totals by field. */
function topCategoryTotals(photos, fieldName, limit = 10) {
  return [...aggregateCategoryTotals(photos, fieldName).entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Returns per-photo category totals for display rows. */
function summarizePhotoCategoryTotals(photo, fieldName) {
  const totals = new Map();
  for (const category of getPhotoCategories(photo)) {
    const key = getCategoryValue(category, fieldName);
    const next = (totals.get(key) || 0) + getCategoryCount(category);
    totals.set(key, next);
  }
  return [...totals.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
