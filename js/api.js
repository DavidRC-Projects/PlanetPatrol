const FETCH_TIMEOUT_MS = 30000;
const RETRY_TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 2;

/** Loads data from the API proxy only. */
async function fetchData() {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const timeoutMs = attempt === 1 ? FETCH_TIMEOUT_MS : RETRY_TIMEOUT_MS;
      return await tryFirestoreProxy(timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        // Brief delay before retry to allow cold starts or transient Firestore slowness.
        await delay(1200);
      }
    }
  }

  throw new Error(lastError?.message || 'Unable to load API data.');
}

/** Loads missions data from the API proxy. */
async function fetchMissions() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(MISSIONS_PROXY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Missions API request failed (${res.status}).`);
    const payload = await res.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.missions || typeof payload.missions !== 'object') {
      throw new Error('Unexpected missions API response format. Expected { missions: { id: mission } }.');
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Missions API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Tries local server Firestore proxy source. */
async function tryFirestoreProxy(timeoutMs) {
  return fetchAndNormalize(FIRESTORE_PROXY_URL, timeoutMs);
}

/** Fetches JSON from URL and validates expected payload shape. */
async function fetchAndNormalize(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

