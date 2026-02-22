const countryNameCache = new Map();
const coarseCountryCache = new Map();
const UNKNOWN_COUNTRY_LABEL = 'Unknown country';
const GEOCODE_TIMEOUT_MS = 5000;
const GEOCODE_MIN_INTERVAL_MS = 0;
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

function formatCoords(lat, lon) {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function formatCountryName(payload, lat, lon) {
  const properties = payload?.features?.[0]?.properties || {};
  const address = payload?.address || {};
  const country = properties.country || address.country;
  if (!country) return UNKNOWN_COUNTRY_LABEL;
  return country;
}

function enqueueGeocode(task) {
  geocodeQueue = geocodeQueue.then(task, task);
  return geocodeQueue;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns area name for coordinates, suitable for location dropdown labels. */
async function resolveCountryName(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const coarseKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  if (!ENABLE_AREA_LOOKUP) return formatCoords(lat, lon);
  if (countryNameCache.has(key)) return countryNameCache.get(key);
  if (coarseCountryCache.has(coarseKey)) {
    const fromCoarse = coarseCountryCache.get(coarseKey);
    countryNameCache.set(key, fromCoarse);
    return fromCoarse;
  }
  const pending = enqueueGeocode(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    try {
      const waitMs = GEOCODE_MIN_INTERVAL_MS - (Date.now() - lastGeocodeAt);
      if (waitMs > 0) await sleep(waitMs);
      lastGeocodeAt = Date.now();

      const query = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const url = `/api/location-name?${query}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`reverse status ${response.status}`);
      const payload = await response.json();
      return formatCountryName(payload, lat, lon);
    } catch (_) {
      countryNameCache.delete(key);
      return UNKNOWN_COUNTRY_LABEL;
    } finally {
      clearTimeout(timeout);
    }
  });
  countryNameCache.set(key, pending);
  coarseCountryCache.set(coarseKey, pending);
  return pending;
}
