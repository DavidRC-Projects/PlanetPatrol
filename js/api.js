const FETCH_TIMEOUT_MS = 12000;

/** Loads data from the API proxy only. */
async function fetchData() {
  try {
    return await tryFirestoreProxy();
  } catch (error) {
    throw new Error(error?.message || 'Unable to load API data.');
  }
}

/** Tries local server Firestore proxy source. */
async function tryFirestoreProxy() {
  return fetchAndNormalize(FIRESTORE_PROXY_URL);
}

/** Fetches JSON from URL and validates expected payload shape. */
async function fetchAndNormalize(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`API request failed (${res.status}).`);

    const payload = await res.json();
    if (!isExpectedApiPayload(payload)) {
      throw new Error('Unexpected API response format. Expected { photos: { id: photo } }.');
    }

    const dataset = ensureNonEmpty(payload);
    if (!dataset) throw new Error('API returned no photos.');
    return dataset;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns dataset only when it has photos. */
function ensureNonEmpty(dataset) {
  return Object.keys(dataset?.photos || {}).length ? dataset : null;
}

function isExpectedApiPayload(data) {
  return !!(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.photos &&
    typeof data.photos === 'object' &&
    !Array.isArray(data.photos)
  );
}

