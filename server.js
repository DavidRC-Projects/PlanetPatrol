const http = require('http');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PORT = Number(process.env.PORT) || 8787;
const ROOT_DIR = __dirname;
const PHOTOS_CACHE_TTL_MS = Number(process.env.PHOTOS_CACHE_TTL_MS) || 5 * 60 * 1000;
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

async function fetchFirestorePhotos() {
  const snapshot = await db.collection('photos').get();
  const photos = {};
  snapshot.forEach((doc) => {
    photos[doc.id] = serializeFirestoreValue(doc.data());
  });
  return { photos };
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

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
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

  const filePath = resolveStaticPath(req.url || '/');
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`PlanetPatrol server running at http://localhost:${PORT}`);
});
