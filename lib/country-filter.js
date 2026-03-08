/**
 * Country filter logic - extracted for unit testing.
 * Used by both main app (via re-export) and tests.
 */

const DICTIONARY_KEY_DECIMALS = 2;
const UNKNOWN_COUNTRY_LABEL = 'Unknown country';

function getPhotoCoordinates(photo) {
  const lat = Number(photo?.location?._latitude ?? photo?.location?.latitude);
  const lon = Number(photo?.location?._longitude ?? photo?.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

function coordinateKey(lat, lon) {
  return `${Number(lat).toFixed(DICTIONARY_KEY_DECIMALS)},${Number(lon).toFixed(DICTIONARY_KEY_DECIMALS)}`;
}

function normalizeLocationEntry(entry) {
  if (!entry) return { country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
  if (typeof entry === 'string') {
    return { country: entry, countryCode: '', constituency: '' };
  }
  const country = String(entry.country || '').trim() || UNKNOWN_COUNTRY_LABEL;
  const countryCode = String(entry.countryCode || '').trim().toUpperCase();
  const constituency = String(entry.constituency || '').trim();
  return { country, countryCode, constituency };
}

function getCountryGroupKey(country, countryCode) {
  const normalized = String(country || '').trim() || UNKNOWN_COUNTRY_LABEL;
  const code = String(countryCode || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return `cc:${code}`;
  return `nm:${normalized.toLowerCase()}`;
}

function getCountryInfoForPhoto(photo, dictionary) {
  const coords = getPhotoCoordinates(photo);
  if (!coords) {
    return {
      country: UNKNOWN_COUNTRY_LABEL,
      countryCode: '',
      countryKey: getCountryGroupKey(UNKNOWN_COUNTRY_LABEL, '')
    };
  }
  const key = coordinateKey(coords.lat, coords.lon);
  const entry = normalizeLocationEntry((dictionary || {})[key]);
  const country = entry.country || UNKNOWN_COUNTRY_LABEL;
  const countryCode = entry.countryCode || '';
  return {
    country,
    countryCode,
    countryKey: getCountryGroupKey(country, countryCode)
  };
}

function buildCountryCounts(photos, dictionary) {
  photos = photos || {};
  dictionary = dictionary || {};
  const groups = new Map();
  for (const id of Object.keys(photos)) {
    const info = getCountryInfoForPhoto(photos[id], dictionary);
    if (info.country === UNKNOWN_COUNTRY_LABEL) continue;
    const groupKey = info.countryKey;
    const current = groups.get(groupKey) || {
      key: groupKey,
      country: info.country || 'Unknown country',
      countryCode: info.countryCode || '',
      count: 0
    };
    current.count += 1;
    if (!current.countryCode && info.countryCode) current.countryCode = info.countryCode;
    groups.set(groupKey, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

function filterPhotosByCountry(photos, dictionary, selectedCountryKey) {
  photos = photos || {};
  if (!selectedCountryKey) return photos;
  const out = {};
  for (const id of Object.keys(photos)) {
    const info = getCountryInfoForPhoto(photos[id], dictionary);
    if (info.countryKey === selectedCountryKey) out[id] = photos[id];
  }
  return out;
}

function filterRecordsByCountry(records, dictionary, selectedCountryKey) {
  if (!records || !selectedCountryKey) return records || {};
  const out = {};
  for (const id of Object.keys(records)) {
    const info = getCountryInfoForPhoto(records[id], dictionary);
    if (info.countryKey === selectedCountryKey) out[id] = records[id];
  }
  return out;
}

module.exports = {
  coordinateKey,
  getCountryGroupKey,
  getCountryInfoForPhoto,
  buildCountryCounts,
  filterPhotosByCountry,
  filterRecordsByCountry,
  getPhotoCoordinates,
  normalizeLocationEntry,
  UNKNOWN_COUNTRY_LABEL
};
