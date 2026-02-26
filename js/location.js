/** Location helpers. */

const LOCATION_DICT_STORAGE_KEY = 'planetpatrol.locationDictionary.v2';
const LOCATION_REQUEST_DELAY_MS = 80;
const LOCATION_REQUEST_TIMEOUT_MS = 6000;
const UNKNOWN_LOCATION_LABEL = 'Unknown location';
const UNKNOWN_COUNTRY_LABEL = 'Unknown country';
const NEARBY_SEARCH_STEPS = [0.75, 1.5];
const RESOLUTION_DATA_URL = '/exports/location-resolutions.json';
const RESOLUTION_KEY_DECIMALS = 2;
const DICTIONARY_KEY_DECIMALS = RESOLUTION_KEY_DECIMALS;
const RESOLUTION_NEAREST_MAX_DISTANCE = 0.35;
const ENABLE_LIVE_REVERSE_GEOCODING = true;
const COUNTRY_NAME_ALIASES = {
  usa: 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  uae: 'United Arab Emirates',
  'ελλάς': 'Greece',
  eire: 'Ireland',
  'éire': 'Ireland',
  belgie: 'Belgium',
  'belgië': 'Belgium',
  belgique: 'Belgium',
  belgien: 'Belgium',
  schweiz: 'Switzerland',
  suisse: 'Switzerland',
  svizzera: 'Switzerland',
  svizra: 'Switzerland',
  'مصر': 'Egypt',
  sesel: 'Seychelles',
  viti: 'Fiji',
  'україна': 'Ukraine',
  '中国': 'China',
  'българия': 'Bulgaria',
  'ދިވެހިރާއްޖެ': 'Maldives',
  'ព្រះរាជាណាចក្រ​កម្ពុជា': 'Cambodia'
};
const COUNTRY_NAME_ALIASES_BY_KEY = Object.fromEntries(
  Object.entries(COUNTRY_NAME_ALIASES).map(([key, value]) => [normalizeCountryLookupKey(key), value])
);
const COUNTRY_CODE_NAME_ALIASES = {
  bolivia: 'Bolivia',
  'brunei darussalam': 'Brunei',
  'cape verde': 'Cabo Verde',
  'congo kinshasa': 'Congo - Kinshasa',
  'congo brazzaville': 'Congo - Brazzaville',
  curacao: 'Curacao',
  'cote divoire': "Cote d'Ivoire",
  'cote d ivoire': "Cote d'Ivoire",
  'ivory coast': "Cote d'Ivoire",
  'czech republic': 'Czechia',
  'falkland islands': 'Falkland Islands (Islas Malvinas)',
  micronesia: 'Micronesia',
  iran: 'Iran',
  laos: 'Laos',
  moldova: 'Moldova',
  'north korea': 'North Korea',
  'south korea': 'South Korea',
  palestine: 'Palestine',
  russia: 'Russia',
  reunion: 'Reunion',
  swaziland: 'Eswatini',
  syria: 'Syria',
  tanzania: 'Tanzania',
  'timor leste': 'Timor-Leste',
  'east timor': 'Timor-Leste',
  turkey: 'Turkiye',
  venezuela: 'Venezuela',
  vietnam: 'Vietnam',
  'wallis and futuna': 'Wallis & Futuna'
};
const COUNTRY_NAME_TO_CODE_OVERRIDES = {
  kosovo: 'XK',
  'vatican city': 'VA'
};
const COUNTRY_CODE_ALIASES = {
  UK: 'GB',
  FX: 'FR'
};
const COUNTRY_NAME_LOCALE_HINTS = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'da', 'sv', 'no', 'fi',
  'pl', 'cs', 'sk', 'sl', 'hr', 'hu', 'ro', 'bg', 'el', 'tr',
  'ru', 'uk', 'sr', 'mk', 'sq', 'hy', 'ka', 'az', 'he', 'ar', 'fa',
  'hi', 'bn', 'ur', 'th', 'vi', 'id', 'ms', 'zh', 'ja', 'ko'
];

let resolutionLookupPromise = null;
const countryCodeLookupCache = new WeakMap();
let countryNameToCodeLookupCache = null;
let countryNameToEnglishLookupCache = null;
let locationEnrichmentJobs = 0;
const DICTIONARY_KEY_PATTERN = /^-?\d+\.\d{2},-?\d+\.\d{2}$/;

/**
 * Returns all valid latitude/longitude coordinates from a photos map.
 * Output format: [{ id, lat, lon }]
 */
function getAllCoordinates(photos) {
  photos = photos || {};
  const out = [];

  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const coords = getPhotoCoordinates(photo);
    if (!coords) continue;
    out.push({ id, lat: coords.lat, lon: coords.lon });
  }

  return out;
}

/** Returns stable dictionary key for a coordinate pair. */
function coordinateKey(lat, lon) {
  return `${Number(lat).toFixed(DICTIONARY_KEY_DECIMALS)},${Number(lon).toFixed(DICTIONARY_KEY_DECIMALS)}`;
}

/** Returns unique coordinate records keyed by rounded lat/lon. */
function getUniqueCoordinates(photos) {
  const unique = new Map();
  for (const item of getAllCoordinates(photos)) {
    const key = coordinateKey(item.lat, item.lon);
    if (!unique.has(key)) unique.set(key, { key, lat: item.lat, lon: item.lon });
  }
  return [...unique.values()];
}

function formatLocationLabel(payload) {
  const props = payload?.features?.[0]?.properties || {};
  const city =
    props.city ||
    props.name ||
    props.county ||
    props.state ||
    null;
  const country = props.country || null;
  if (city && country) return `${city}, ${country}`;
  if (country) return country;
  if (city) return city;
  return UNKNOWN_LOCATION_LABEL;
}

function parseCountryFromLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return UNKNOWN_COUNTRY_LABEL;
  const lower = raw.toLowerCase();
  if (lower === 'unknown location' || lower === 'unknown country') return UNKNOWN_COUNTRY_LABEL;
  if (raw.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean).pop() || UNKNOWN_COUNTRY_LABEL;
  return raw;
}

function normalizeConstituencyName(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'unknown' || lower === 'unknown constituency' || lower === 'n/a') return '';
  return raw;
}

function parseConstituencyFromLabel(label, country = '') {
  const raw = String(label || '').trim();
  if (!raw || !raw.includes(',')) return '';
  const first = normalizeConstituencyName(raw.split(',')[0]);
  if (!first) return '';
  const normalizedCountry = normalizeCountryName(country || parseCountryFromLabel(raw));
  if (first.toLowerCase() === String(normalizedCountry || '').toLowerCase()) return '';
  return first;
}

function normalizeCountryName(country) {
  const raw = String(country || '').trim().replace(/\s+/g, ' ');
  if (!raw) return UNKNOWN_COUNTRY_LABEL;
  const lower = raw.toLowerCase();
  if (lower === 'unknown location' || lower === 'unknown country') return UNKNOWN_COUNTRY_LABEL;
  const candidates = [raw, ...raw.split(/[\/|]/g).map((part) => part.trim()).filter(Boolean)];
  for (const candidate of candidates) {
    const aliased = COUNTRY_NAME_ALIASES_BY_KEY[normalizeCountryLookupKey(candidate)] || candidate;
    const english = getEnglishCountryName(aliased);
    if (english) return english;
    if (COUNTRY_NAME_ALIASES_BY_KEY[normalizeCountryLookupKey(candidate)]) return aliased;
  }
  const aliased = COUNTRY_NAME_ALIASES_BY_KEY[normalizeCountryLookupKey(raw)] || raw;
  return getEnglishCountryName(aliased) || aliased;
}

function normalizeCountryLookupKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function getCountryNameToEnglishLookup() {
  if (countryNameToEnglishLookupCache) return countryNameToEnglishLookupCache;
  const lookup = new Map();

  if (typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') {
    countryNameToEnglishLookupCache = lookup;
    return lookup;
  }

  const englishDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const codes = [];
  for (let i = 65; i <= 90; i += 1) {
    for (let j = 65; j <= 90; j += 1) {
      const code = String.fromCharCode(i, j);
      const englishName = englishDisplayNames.of(code);
      if (!englishName || englishName === code) continue;
      codes.push(code);
      lookup.set(normalizeCountryLookupKey(englishName), englishName);
    }
  }

  for (const locale of COUNTRY_NAME_LOCALE_HINTS) {
    const localizedDisplayNames = new Intl.DisplayNames([locale], { type: 'region' });
    for (const code of codes) {
      const localizedName = localizedDisplayNames.of(code);
      const englishName = englishDisplayNames.of(code);
      if (!localizedName || localizedName === code || !englishName || englishName === code) continue;
      lookup.set(normalizeCountryLookupKey(localizedName), englishName);
    }
  }

  countryNameToEnglishLookupCache = lookup;
  return lookup;
}

function getEnglishCountryName(countryName) {
  const key = normalizeCountryLookupKey(countryName);
  if (!key) return '';
  return getCountryNameToEnglishLookup().get(key) || '';
}

function getCountryNameToCodeLookup() {
  if (countryNameToCodeLookupCache) return countryNameToCodeLookupCache;
  const lookup = new Map();

  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    const englishDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    const codes = [];
    for (let i = 65; i <= 90; i += 1) {
      for (let j = 65; j <= 90; j += 1) {
        const code = String.fromCharCode(i, j);
        const name = englishDisplayNames.of(code);
        if (!name || name === code) continue;
        codes.push(code);
        lookup.set(normalizeCountryLookupKey(name), code);
      }
    }
    for (const locale of COUNTRY_NAME_LOCALE_HINTS) {
      const localizedDisplayNames = new Intl.DisplayNames([locale], { type: 'region' });
      for (const code of codes) {
        const localizedName = localizedDisplayNames.of(code);
        if (!localizedName || localizedName === code) continue;
        lookup.set(normalizeCountryLookupKey(localizedName), code);
      }
    }
  }

  for (const [rawAlias, canonicalName] of Object.entries(COUNTRY_CODE_NAME_ALIASES)) {
    const key = normalizeCountryLookupKey(rawAlias);
    const canonicalKey = normalizeCountryLookupKey(canonicalName);
    const code = lookup.get(canonicalKey);
    if (code) lookup.set(key, code);
  }

  for (const [countryName, code] of Object.entries(COUNTRY_NAME_TO_CODE_OVERRIDES)) {
    lookup.set(normalizeCountryLookupKey(countryName), code);
  }

  countryNameToCodeLookupCache = lookup;
  return lookup;
}

function getCountryCodeFromName(countryName) {
  const normalizedCountry = normalizeCountryName(countryName);
  if (normalizedCountry === UNKNOWN_COUNTRY_LABEL) return '';
  return normalizeCountryCode(
    getCountryNameToCodeLookup().get(normalizeCountryLookupKey(normalizedCountry)) || ''
  );
}

function normalizeCountryCode(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return COUNTRY_CODE_ALIASES[code] || code;
}

function getCountryGroupKey(country, countryCode) {
  const normalizedCountry = normalizeCountryName(country);
  const code = normalizeCountryCode(countryCode) || getCountryCodeFromName(normalizedCountry);
  if (/^[A-Z]{2}$/.test(code)) return `cc:${code}`;
  return `nm:${normalizedCountry.toLowerCase()}`;
}

function normalizeLocationEntry(entry) {
  if (!entry) return { label: UNKNOWN_LOCATION_LABEL, country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
  if (typeof entry === 'string') {
    const country = normalizeCountryName(parseCountryFromLabel(entry));
    const countryCode = getCountryCodeFromName(country);
    const constituency = parseConstituencyFromLabel(entry, country);
    return {
      label: entry,
      country,
      countryCode,
      constituency
    };
  }
  const label = String(entry.label || '').trim() || UNKNOWN_LOCATION_LABEL;
  const country = normalizeCountryName(entry.country || parseCountryFromLabel(label));
  const countryCode = normalizeCountryCode(entry.countryCode) || getCountryCodeFromName(country);
  const constituency = normalizeConstituencyName(entry.constituency) || parseConstituencyFromLabel(label, country);
  return { label, country, countryCode, constituency };
}

function countryCodeToFlag(countryCode) {
  const code = normalizeCountryCode(countryCode);
  if (!/^[A-Z]{2}$/.test(code)) return '🌍';
  const chars = [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
  return chars.join('');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Looks up one coordinate on the internet and returns a label. */
async function fetchLocationLabel(lat, lon) {
  // Prefer local precomputed resolution data first for speed and reliability.
  let best = await fetchCountryFromResolutionData(lat, lon);
  if (!ENABLE_LIVE_REVERSE_GEOCODING) return { ...best, _usedLiveLookup: false };
  // If we already know the country from local resolution data, return immediately.
  // This keeps country dropdown population fast and avoids long startup delays.
  if (best.country !== UNKNOWN_COUNTRY_LABEL) return { ...best, _usedLiveLookup: false };

  const direct = await fetchPhotonLocation(lat, lon);
  best = mergeLocationResult(best, direct);
  if (best.country !== UNKNOWN_COUNTRY_LABEL && best.constituency) return best;

  const nearby = await findNearbyCountry(lat, lon);
  best = mergeLocationResult(best, nearby);
  if (best.country !== UNKNOWN_COUNTRY_LABEL && best.constituency) return best;

  const nominatim = await fetchNominatimCountry(lat, lon);
  best = mergeLocationResult(best, nominatim);
  return { ...best, _usedLiveLookup: true };
}

function mergeLocationResult(base, candidate) {
  base = normalizeLocationEntry(base);
  candidate = normalizeLocationEntry(candidate);
  if (base.country === UNKNOWN_COUNTRY_LABEL) return candidate;
  if (candidate.country === UNKNOWN_COUNTRY_LABEL) return base;
  if (base.country !== candidate.country) return base;
  const constituency = normalizeConstituencyName(candidate.constituency) || normalizeConstituencyName(base.constituency);
  return {
    label: constituency ? `${constituency}, ${base.country}` : (base.label || base.country),
    country: base.country,
    countryCode: candidate.countryCode || base.countryCode || '',
    constituency
  };
}

function toResolutionKey(lat, lon) {
  return `${Number(lat).toFixed(RESOLUTION_KEY_DECIMALS)}, ${Number(lon).toFixed(RESOLUTION_KEY_DECIMALS)}`;
}

function distanceSquared(aLat, aLon, bLat, bLon) {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return (dLat * dLat) + (dLon * dLon);
}

async function getResolutionLookup() {
  if (!resolutionLookupPromise) {
    resolutionLookupPromise = fetchJsonWithTimeout(RESOLUTION_DATA_URL)
      .then((payload) => {
        const byKey = new Map();
        const points = [];
        const rows = Array.isArray(payload?.locations) ? payload.locations : [];
        for (const row of rows) {
          const country = normalizeCountryName(row?.country);
          if (country === UNKNOWN_COUNTRY_LABEL) continue;
          const lat = Number(row?.lat);
          const lon = Number(row?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const key = String(row?.key || '').trim() || toResolutionKey(lat, lon);
          const value = {
            lat,
            lon,
            country,
            constituency: normalizeConstituencyName(row?.detail)
          };
          byKey.set(key, value);
          points.push(value);
        }
        return { byKey, points };
      })
      .catch(() => ({ byKey: new Map(), points: [] }));
  }
  return resolutionLookupPromise;
}

async function fetchCountryFromResolutionData(lat, lon) {
  const lookup = await getResolutionLookup();
  const exact = lookup.byKey.get(toResolutionKey(lat, lon));
  if (exact) {
    const constituency = normalizeConstituencyName(exact.constituency);
    return {
      label: constituency ? `${constituency}, ${exact.country}` : exact.country,
      country: exact.country,
      countryCode: '',
      constituency
    };
  }

  const maxDistanceSq = RESOLUTION_NEAREST_MAX_DISTANCE * RESOLUTION_NEAREST_MAX_DISTANCE;
  let nearest = null;
  let nearestDistanceSq = Infinity;
  for (const point of lookup.points) {
    const distSq = distanceSquared(lat, lon, point.lat, point.lon);
    if (distSq < nearestDistanceSq) {
      nearestDistanceSq = distSq;
      nearest = point;
    }
  }

  if (nearest && nearestDistanceSq <= maxDistanceSq) {
    const constituency = normalizeConstituencyName(nearest.constituency);
    return {
      label: constituency ? `${constituency}, ${nearest.country}` : nearest.country,
      country: nearest.country,
      countryCode: '',
      constituency
    };
  }

  return { label: UNKNOWN_LOCATION_LABEL, country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
}

async function fetchJsonWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOCATION_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPhotonLocation(lat, lon) {
  const query = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const payload = await fetchJsonWithTimeout(`https://photon.komoot.io/reverse?${query}`);
  if (!payload) return { label: UNKNOWN_LOCATION_LABEL, country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
  const props = payload?.features?.[0]?.properties || {};
  const label = formatLocationLabel(payload);
  const country = normalizeCountryName(props.country || parseCountryFromLabel(label));
  const constituency = normalizeConstituencyName(
    props.district || props.county || props.city || parseConstituencyFromLabel(label, country)
  );
  return {
    label,
    country,
    countryCode: String(props.countrycode || '').trim().toUpperCase(),
    constituency
  };
}

async function fetchNominatimCountry(lat, lon) {
  const query = `format=jsonv2&zoom=3&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const payload = await fetchJsonWithTimeout(`https://nominatim.openstreetmap.org/reverse?${query}`);
  const country = normalizeCountryName(payload?.address?.country);
  if (country === UNKNOWN_COUNTRY_LABEL) {
    return { label: UNKNOWN_LOCATION_LABEL, country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
  }
  const countryCode = String(payload?.address?.country_code || '').trim().toUpperCase();
  const constituency = normalizeConstituencyName(
    payload?.address?.state_district ||
    payload?.address?.county ||
    payload?.address?.city_district ||
    payload?.address?.city
  );
  return {
    label: constituency ? `${constituency}, ${country}` : country,
    country,
    countryCode,
    constituency
  };
}

function getNearbyPoints(lat, lon) {
  const out = [];
  for (const step of NEARBY_SEARCH_STEPS) {
    out.push([lat + step, lon], [lat - step, lon], [lat, lon + step], [lat, lon - step]);
  }
  return out;
}

async function findNearbyCountry(lat, lon) {
  for (const [nearLat, nearLon] of getNearbyPoints(lat, lon)) {
    const photon = await fetchPhotonLocation(nearLat, nearLon);
    if (photon.country !== UNKNOWN_COUNTRY_LABEL) return photon;
    const nominatim = await fetchNominatimCountry(nearLat, nearLon);
    if (nominatim.country !== UNKNOWN_COUNTRY_LABEL) return nominatim;
  }
  return { label: UNKNOWN_LOCATION_LABEL, country: UNKNOWN_COUNTRY_LABEL, countryCode: '', constituency: '' };
}

function isUnknownLocationEntry(entry) {
  const normalized = normalizeLocationEntry(entry);
  return normalized.country === UNKNOWN_COUNTRY_LABEL;
}

/** Loads dictionary from local storage, if available. */
function loadLocationDictionary(storageKey = LOCATION_DICT_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    // Keep only current-format coordinate keys so old cache shapes do not poison lookups.
    const sanitized = {};
    for (const key of Object.keys(parsed)) {
      if (!DICTIONARY_KEY_PATTERN.test(key)) continue;
      sanitized[key] = normalizeLocationEntry(parsed[key]);
    }
    return sanitized;
  } catch (_) {
    return {};
  }
}

/** Saves dictionary to local storage. */
function saveLocationDictionary(dictionary, storageKey = LOCATION_DICT_STORAGE_KEY) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(dictionary || {}));
  } catch (_) {
    // Keep runtime dictionary in memory even when storage quota is exceeded.
  }
}

/**
 * Builds coordinate->location dictionary once, then reuses it from storage.
 * Dictionary format: { "lat,lon": "City, Country" }
 */
async function getOrBuildLocationDictionary(photos, options = {}) {
  const storageKey = options.storageKey || LOCATION_DICT_STORAGE_KEY;
  const requestDelayMs = Number.isFinite(options.requestDelayMs)
    ? options.requestDelayMs
    : LOCATION_REQUEST_DELAY_MS;

  const dictionary = loadLocationDictionary(storageKey);
  const coords = getUniqueCoordinates(photos);

  locationEnrichmentJobs += 1;
  try {
    for (const c of coords) {
      const existing = normalizeLocationEntry(dictionary[c.key]);
      const alreadyResolved = existing.country !== UNKNOWN_COUNTRY_LABEL;
      const hasLocalArea = !!normalizeConstituencyName(existing.constituency);
      if (alreadyResolved && (hasLocalArea || !ENABLE_LIVE_REVERSE_GEOCODING)) continue;
      const fetched = await fetchLocationLabel(c.lat, c.lon);
      dictionary[c.key] = normalizeLocationEntry(fetched);
      countryCodeLookupCache.delete(dictionary);
      saveLocationDictionary(dictionary, storageKey);
      if (requestDelayMs > 0 && fetched._usedLiveLookup) await sleep(requestDelayMs);
    }
  } finally {
    locationEnrichmentJobs = Math.max(0, locationEnrichmentJobs - 1);
  }

  return dictionary;
}

function isLocationEnrichmentRunning() {
  return locationEnrichmentJobs > 0;
}

function getCountryInfoForPhoto(photo, dictionary) {
  const coords = getPhotoCoordinates(photo);
  if (!coords) {
    return {
      country: UNKNOWN_COUNTRY_LABEL,
      countryCode: '',
      countryKey: getCountryGroupKey(UNKNOWN_COUNTRY_LABEL, ''),
      label: UNKNOWN_LOCATION_LABEL,
      constituency: ''
    };
  }
  const key = coordinateKey(coords.lat, coords.lon);
  const entry = normalizeLocationEntry((dictionary || {})[key]);
  const country = entry.country || UNKNOWN_COUNTRY_LABEL;
  const countryCode = entry.countryCode || getCountryCodeFromDictionary(dictionary, country) || '';
  return {
    country,
    countryCode,
    countryKey: getCountryGroupKey(country, countryCode),
    label: entry.label || 'Unknown location',
    constituency: normalizeConstituencyName(entry.constituency)
  };
}

function getConstituencyInfoForPhoto(photo, dictionary) {
  const countryInfo = getCountryInfoForPhoto(photo, dictionary);
  let constituency = normalizeConstituencyName(countryInfo.constituency);
  if (!constituency) constituency = parseConstituencyFromLabel(countryInfo.label, countryInfo.country);
  if (!constituency) return { key: '', constituency: '', countryKey: countryInfo.countryKey };
  return {
    key: `${countryInfo.countryKey}::${constituency.toLowerCase()}`,
    constituency,
    countryKey: countryInfo.countryKey
  };
}

function buildCountryCounts(photos, dictionary) {
  photos = photos || {};
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
    // Prefer an entry with country code when available.
    if (!current.countryCode && info.countryCode) current.countryCode = info.countryCode;
    groups.set(groupKey, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

function buildConstituencyCounts(photos, dictionary, selectedCountry = '') {
  photos = photos || {};
  const groups = new Map();
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const countryInfo = getCountryInfoForPhoto(photo, dictionary);
    if (selectedCountry && countryInfo.countryKey !== selectedCountry) continue;
    const constituencyInfo = getConstituencyInfoForPhoto(photo, dictionary);
    if (!constituencyInfo.key) continue;
    const current = groups.get(constituencyInfo.key) || {
      key: constituencyInfo.key,
      constituency: constituencyInfo.constituency,
      count: 0
    };
    current.count += 1;
    groups.set(constituencyInfo.key, current);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.constituency.localeCompare(b.constituency));
}

function hasMissingConstituencyForCountry(photos, dictionary, selectedCountry = '') {
  if (!selectedCountry) return false;
  photos = photos || {};
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const countryInfo = getCountryInfoForPhoto(photo, dictionary);
    if (countryInfo.countryKey !== selectedCountry) continue;
    const constituencyInfo = getConstituencyInfoForPhoto(photo, dictionary);
    if (!constituencyInfo.key) return true;
  }
  return false;
}

function getCountryCodeFromDictionary(dictionary, countryName) {
  if (!dictionary || typeof dictionary !== 'object') return '';
  const target = normalizeCountryName(countryName);
  if (!target) return '';
  let lookup = countryCodeLookupCache.get(dictionary);
  if (!lookup) {
    lookup = new Map();
    for (const key of Object.keys(dictionary || {})) {
      const entry = normalizeLocationEntry(dictionary[key]);
      if (!entry.countryCode) continue;
      if (!lookup.has(entry.country)) lookup.set(entry.country, entry.countryCode);
    }
    countryCodeLookupCache.set(dictionary, lookup);
  }
  return lookup.get(target) || getCountryCodeFromName(target) || '';
}
