const API_URL = 'https://api.plasticpatrol.co.uk/photos.json';

let rawData = null;

/** Fetches JSON from the API. */
async function fetchData() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Failed to fetch data');
  return res.json();
}

/** Returns total pieces from photo object (handles missing pieces). */
function getPieces(photo) {
  return Number(photo?.pieces) || 0;
}

/** Returns true if photo has a moderated date. */
function isModerated(photo) {
  return !!(photo?.moderated);
}

/** Returns Date from photo (moderated, updated, or created). */
function getPhotoDate(photo) {
  const str = photo?.moderated || photo?.updated || photo?.created;
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns true if date matches year filter. */
function matchesYear(d, year) {
  if (!year || !d) return true;
  return d.getFullYear() === parseInt(year, 10);
}

/** Returns true if date matches month filter. */
function matchesMonth(d, month, year) {
  if (!month || !d) return true;
  return d.getMonth() + 1 === parseInt(month, 10) && (!year || d.getFullYear() === parseInt(year, 10));
}

/** Returns ISO week number (1–53). */
function getISOWeek(d) {
  if (!d) return 0;
  const temp = new Date(d);
  temp.setDate(temp.getDate() + 4 - (temp.getDay() || 7));
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
}

/** Returns true if date matches week filter. */
function matchesWeek(d, week, year) {
  if (!week || !d) return true;
  return getISOWeek(d) === parseInt(week, 10) && (!year || d.getFullYear() === parseInt(year, 10));
}

/** Sums pieces across all photos in the photos object. */
function sumTotalPieces(photos) {
  let sum = 0;
  for (const id in photos) sum += getPieces(photos[id]);
  return sum;
}

/** Counts photos that have a moderated date. */
function countModerated(photos) {
  let n = 0;
  for (const id in photos) if (isModerated(photos[id])) n++;
  return n;
}

/** Counts photos that have no moderated date. */
function countUnmoderated(photos) {
  let n = 0;
  for (const id in photos) if (!isModerated(photos[id])) n++;
  return n;
}

/** Returns photos object filtered by status, min pieces, and date. */
function filterPhotos(photos, status, minPieces, year, month, week) {
  photos = photos || {};
  const out = {};
  for (const id in photos) {
    const p = photos[id];
    if (status === 'moderated' && !isModerated(p)) continue;
    if (status === 'unmoderated' && isModerated(p)) continue;
    if (getPieces(p) < minPieces) continue;
    const d = getPhotoDate(p);
    if (!matchesYear(d, year)) continue;
    if (!matchesMonth(d, month, year)) continue;
    if (!matchesWeek(d, week, year)) continue;
    out[id] = p;
  }
  return out;
}

/** Updates summary cards from filtered photos. */
function renderCards(filtered) {
  filtered = filtered || {};
  document.getElementById('totalPieces').textContent = sumTotalPieces(filtered);
  document.getElementById('moderated').textContent = countModerated(filtered);
  document.getElementById('unmoderated').textContent = countUnmoderated(filtered);
  document.getElementById('totalPhotos').textContent = Object.keys(filtered).length;
}

/** Populates year and week dropdowns from photo dates. */
function populateDateFilters(photos) {
  const years = new Set();
  for (const id in photos) {
    const d = getPhotoDate(photos[id]);
    if (d) years.add(d.getFullYear());
  }
  const yearEl = document.getElementById('filterYear');
  yearEl.innerHTML = '<option value="">All</option>';
  [...years].sort((a, b) => a - b).forEach((y) => {
    yearEl.appendChild(new Option(y, y));
  });
  const weekEl = document.getElementById('filterWeek');
  weekEl.innerHTML = '<option value="">All</option>';
  for (let w = 1; w <= 53; w++) weekEl.appendChild(new Option(w, w));
}

/** Reads filter values, filters photos, renders cards. */
function applyFilters(photos) {
  const status = document.getElementById('filterStatus').value;
  const minPieces = Math.max(0, parseInt(document.getElementById('filterMinPieces').value, 10) || 0);
  const year = document.getElementById('filterYear').value;
  const month = document.getElementById('filterMonth').value;
  const week = document.getElementById('filterWeek').value;
  renderCards(filterPhotos(photos, status, minPieces, year, month, week));
}

/** Main entry: fetches data, renders dashboard, wires up filters. */
async function init() {
  try {
    rawData = await fetchData();
    const photos = rawData?.photos || {};
    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    populateDateFilters(photos);
    applyFilters(photos);

    document.getElementById('applyFilters').onclick = () => applyFilters(photos);
  } catch (e) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').textContent = 'Error: ' + e.message + '. If CORS blocks the request, try a CORS proxy.';
  }
}

init();
