const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;
const PHOTOS_CACHE_TTL_MS = Number(process.env.PHOTOS_CACHE_TTL_MS) || 5 * 60 * 1000;
const MISSIONS_CACHE_TTL_MS = Number(process.env.MISSIONS_CACHE_TTL_MS) || 5 * 60 * 1000;
const WATER_TESTS_CACHE_TTL_MS = Number(process.env.WATER_TESTS_CACHE_TTL_MS) || 5 * 60 * 1000;
const LOCATION_CACHE_TTL_MS = Number(process.env.LOCATION_CACHE_TTL_MS) || 24 * 60 * 60 * 1000;
const LOCATION_CACHE_MAX_SIZE = Number(process.env.LOCATION_CACHE_MAX_SIZE) || 5000;
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.SERVICE_ACCOUNT_PATH)
  : path.join(ROOT_DIR, 'plastic-patrol-fd3b3-firebase-adminsdk-wzxjy-d21b2320fa.json');

function parseJsonCredential(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function loadServiceAccountCredential() {
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    return require(SERVICE_ACCOUNT_PATH);
  }

  const rawSecret = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawSecret) {
    console.error(`Missing Firebase service account file: ${SERVICE_ACCOUNT_PATH}`);
    console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable.');
    process.exit(1);
  }

  const parsed = parseJsonCredential(rawSecret);
  if (parsed) return parsed;

  // Some secret managers store JSON as base64 to preserve formatting.
  const decoded = Buffer.from(rawSecret, 'base64').toString('utf8');
  const parsedDecoded = parseJsonCredential(decoded);
  if (parsedDecoded) return parsedDecoded;

  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON (raw or base64).');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccountCredential())
});

const db = admin.firestore();
let photosCache = { payload: null, expiresAt: 0 };
let inflightPhotosFetch = null;
let missionsCache = { payload: null, expiresAt: 0 };
let inflightMissionsFetch = null;
const waterTestsCache = new Map(); // type -> { payload, expiresAt }
const inflightWaterTestsFetch = new Map(); // type -> Promise
const locationCache = new Map(); // "lat,lon" -> { payload, expiresAt }
const inflightLocationFetch = new Map(); // "lat,lon" -> Promise

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serializeFirestoreValue(val) {
  if (val === null || val === undefined) return val;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val._latitude !== undefined && val._longitude !== undefined) return val;
  if (Array.isArray(val)) return val.map(serializeFirestoreValue);
  if (typeof val === 'object') {
    const out = {};
    for (const key of Object.keys(val)) out[key] = serializeFirestoreValue(val[key]);
    return out;
  }
  return val;
}

const WATER_TEST_COLLECTIONS = new Set([
  'coliforms',
  'nitrate',
  'nitrite',
  'ph',
  'phosphate',
  'temperature'
]);

async function fetchFirestorePhotos() {
  const snapshot = await db.collection('photos').get();
  const photos = {};
  snapshot.forEach((doc) => {
    photos[doc.id] = serializeFirestoreValue(doc.data());
  });
  return { photos };
}

async function fetchFirestoreMissions() {
  const snapshot = await db.collection('missions').get();
  const missions = {};
  snapshot.forEach((doc) => {
    // Only return fields needed for the dashboard leaderboard.
    // This keeps payload small and avoids leaking per-user breakdowns.
    const data = doc.data() || {};
    missions[doc.id] = {
      hidden: data.hidden === true,
      name: String(data.name || '').trim(),
      totalPieces: Number(data.totalPieces) || 0
    };
  });
  return { missions };
}

async function fetchFirestoreWaterTests(type, limit) {
  const safeType = String(type || '').trim();
  if (!WATER_TEST_COLLECTIONS.has(safeType)) {
    const allowed = [...WATER_TEST_COLLECTIONS].sort().join(', ');
    throw new Error(`Invalid water test type "${safeType}". Allowed: ${allowed}`);
  }

  const n = Math.max(1, Math.min(2000, Number(limit) || 500));
  const snapshot = await db.collection(safeType).limit(n).get();
  const records = {};
  snapshot.forEach((doc) => {
    records[doc.id] = serializeFirestoreValue(doc.data());
  });
  return { type: safeType, records, limit: n };
}

async function getPhotosWithCache() {
  const now = Date.now();
  if (photosCache.payload && photosCache.expiresAt > now) {
    return photosCache.payload;
  }

  if (inflightPhotosFetch) {
    return inflightPhotosFetch;
  }

  inflightPhotosFetch = (async () => {
    try {
      const payload = await fetchFirestorePhotos();
      photosCache = {
        payload,
        expiresAt: Date.now() + PHOTOS_CACHE_TTL_MS
      };
      return payload;
    } catch (error) {
      // Return stale data if available; this keeps dashboard alive during transient outages.
      if (photosCache.payload) return photosCache.payload;
      throw error;
    } finally {
      inflightPhotosFetch = null;
    }
  })();

  return inflightPhotosFetch;
}

async function getMissionsWithCache() {
  const now = Date.now();
  if (missionsCache.payload && missionsCache.expiresAt > now) {
    return missionsCache.payload;
  }

  if (inflightMissionsFetch) {
    return inflightMissionsFetch;
  }

  inflightMissionsFetch = (async () => {
    try {
      const payload = await fetchFirestoreMissions();
      missionsCache = {
        payload,
        expiresAt: Date.now() + MISSIONS_CACHE_TTL_MS
      };
      return payload;
    } catch (error) {
      if (missionsCache.payload) return missionsCache.payload;
      throw error;
    } finally {
      inflightMissionsFetch = null;
    }
  })();

  return inflightMissionsFetch;
}

async function getWaterTestsWithCache(type, limit) {
  const safeType = String(type || '').trim();
  if (!WATER_TEST_COLLECTIONS.has(safeType)) {
    const allowed = [...WATER_TEST_COLLECTIONS].sort();
    return {
      type: safeType,
      records: {},
      limit: Number(limit) || 0,
      available: allowed,
      error: 'Invalid water test type. Choose one of the available values.'
    };
  }

  const now = Date.now();
  const cached = waterTestsCache.get(safeType);
  if (cached?.payload && cached.expiresAt > now) {
    return cached.payload;
  }

  const inflight = inflightWaterTestsFetch.get(safeType);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const payload = await fetchFirestoreWaterTests(safeType, limit);
      waterTestsCache.set(safeType, {
        payload,
        expiresAt: Date.now() + WATER_TESTS_CACHE_TTL_MS
      });
      return payload;
    } catch (error) {
      if (cached?.payload) return cached.payload;
      throw error;
    } finally {
      inflightWaterTestsFetch.delete(safeType);
    }
  })();

  inflightWaterTestsFetch.set(safeType, p);
  return p;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function fetchJsonHttps(url, { timeoutMs = 6500, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (resp) => {
      const status = resp.statusCode || 0;
      let raw = '';
      resp.setEncoding('utf8');
      resp.on('data', (chunk) => { raw += chunk; });
      resp.on('end', () => {
        if (status < 200 || status >= 300) {
          reject(new Error(`upstream status ${status}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (_) {
          reject(new Error('upstream returned invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('upstream timeout'));
    });
    req.end();
  });
}

function getLocationCacheKey(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

async function reverseGeocodeWithCache(lat, lon) {
  const key = getLocationCacheKey(lat, lon);
  const now = Date.now();

  const cached = locationCache.get(key);
  if (cached?.payload && cached.expiresAt > now) return cached.payload;

  const inflight = inflightLocationFetch.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      // Nominatim reverse geocode. zoom=10 tends to include county/state_district.
      const query = new URLSearchParams({
        format: 'jsonv2',
        zoom: '10',
        addressdetails: '1',
        lat: String(lat),
        lon: String(lon)
      });

      const payload = await fetchJsonHttps(`https://nominatim.openstreetmap.org/reverse?${query.toString()}`, {
        timeoutMs: 6500,
        headers: {
          // Nominatim usage policy asks for a valid UA identifying your app.
          'User-Agent': 'PlanetPatrolDashboard/1.0 (self-hosted)',
          'Accept': 'application/json'
        }
      });

      // Basic LRU-ish eviction by clearing oldest insertion order when too large.
      if (locationCache.size >= LOCATION_CACHE_MAX_SIZE) {
        const firstKey = locationCache.keys().next().value;
        if (firstKey) locationCache.delete(firstKey);
      }
      locationCache.set(key, { payload, expiresAt: now + LOCATION_CACHE_TTL_MS });
      return payload;
    } finally {
      inflightLocationFetch.delete(key);
    }
  })();

  inflightLocationFetch.set(key, p);
  return p;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function resolveStaticPath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || '/').split('?')[0]);
  const requested = cleanPath === '/' ? '/index.html' : cleanPath;
  const safeRelative = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  return path.join(ROOT_DIR, safeRelative);
}

const server = http.createServer(async (req, res) => {
  if (req.url && req.url.startsWith('/api/photos')) {
    try {
      const payload = await getPhotosWithCache();
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, { error: `Firestore read failed: ${error.message}` });
    }
    return;
  }

  if (req.url && req.url.startsWith('/api/missions')) {
    try {
      const payload = await getMissionsWithCache();
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, { error: `Firestore read failed: ${error.message}` });
    }
    return;
  }

  if (req.url && req.url.startsWith('/api/water-tests')) {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const type = url.searchParams.get('type') || '';
      const limit = url.searchParams.get('limit') || '';
      const payload = await getWaterTestsWithCache(type, limit);
      if (payload?.error) {
        sendJson(res, 400, payload);
        return;
      }
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, { error: `Firestore read failed: ${error.message}` });
    }
    return;
  }

  if (req.url && req.url.startsWith('/api/location-name')) {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        sendJson(res, 400, { error: 'Missing or invalid lat/lon.' });
        return;
      }
      const safeLat = clamp(lat, -90, 90);
      const safeLon = clamp(lon, -180, 180);
      const payload = await reverseGeocodeWithCache(safeLat, safeLon);
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 502, { error: `Reverse geocode failed: ${error.message}` });
    }
    return;
  }

  const filePath = resolveStaticPath(req.url || '/');
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  console.log(`PlanetPatrol server running at http://${HOST}:${PORT}`);
});
