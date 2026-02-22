/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(ROOT_DIR, 'exports', 'location-resolutions.json');
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.SERVICE_ACCOUNT_PATH)
  : path.join(ROOT_DIR, 'plastic-patrol-fd3b3-firebase-adminsdk-wzxjy-d21b2320fa.json');

const REQUEST_DELAY_MS = Number(process.env.GEOCODE_DELAY_MS || 150);
const SAVE_EVERY = Number(process.env.SAVE_EVERY || 50);

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--output' && argv[i + 1]) {
      args.output = path.resolve(argv[++i]);
    } else if (token === '--limit' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) args.limit = n;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyFromCoord(lat, lon) {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function buildBuckets(photos) {
  const buckets = new Map();
  let missingCoords = 0;
  let zeroZeroCoords = 0;

  for (const id of Object.keys(photos || {})) {
    const photo = photos[id] || {};
    const lat = Number(photo?.location?._latitude);
    const lon = Number(photo?.location?._longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      missingCoords++;
      continue;
    }
    if (lat === 0 && lon === 0) {
      zeroZeroCoords++;
      continue;
    }

    const key = keyFromCoord(lat, lon);
    const existing = buckets.get(key) || { key, lat, lon, count: 0 };
    existing.count += 1;
    buckets.set(key, existing);
  }

  return {
    buckets: [...buckets.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    missingCoords,
    zeroZeroCoords
  };
}

async function geocodeCountry(lat, lon) {
  const query = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const url = `https://photon.komoot.io/reverse?${query}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return { status: 'http_error', country: null, detail: `status_${response.status}` };
  }
  const payload = await response.json();
  const props = payload?.features?.[0]?.properties || {};
  const country = props.country || null;
  if (!country) return { status: 'no_country', country: null, detail: null };
  return { status: 'ok', country, detail: null };
}

function loadExisting(outputPath) {
  if (!fs.existsSync(outputPath)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const entries = Array.isArray(raw?.locations) ? raw.locations : [];
    const map = new Map();
    for (const item of entries) {
      if (item?.key) map.set(item.key, item);
    }
    return map;
  } catch (_) {
    return new Map();
  }
}

function writeOutput(outputPath, payload) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

async function main() {
  const { output, limit } = parseArgs(process.argv);

  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Missing Firebase service account file: ${SERVICE_ACCOUNT_PATH}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
  });
  const db = admin.firestore();

  console.log('Reading photos from Firestore...');
  const snapshot = await db.collection('photos').get();
  const photos = {};
  snapshot.forEach((doc) => {
    photos[doc.id] = doc.data();
  });

  const { buckets, missingCoords, zeroZeroCoords } = buildBuckets(photos);
  const limitedBuckets = limit ? buckets.slice(0, limit) : buckets;
  const existing = loadExisting(output);
  const cacheByKey = new Map(existing);

  console.log(`Total photos: ${Object.keys(photos).length}`);
  console.log(`Unique rounded coordinates: ${buckets.length}`);
  console.log(`Missing coords: ${missingCoords}, zero/zero coords: ${zeroZeroCoords}`);
  if (limit) console.log(`Processing first ${limitedBuckets.length} coordinate buckets (limit=${limit})`);

  let processed = 0;
  for (const bucket of limitedBuckets) {
    const cached = cacheByKey.get(bucket.key);
    if (cached && cached.status === 'ok') continue;

    const result = await geocodeCountry(bucket.lat, bucket.lon);
    cacheByKey.set(bucket.key, {
      key: bucket.key,
      lat: bucket.lat,
      lon: bucket.lon,
      count: bucket.count,
      country: result.country,
      status: result.status,
      detail: result.detail
    });

    processed += 1;
    if (processed % SAVE_EVERY === 0) {
      const partial = {
        generatedAt: new Date().toISOString(),
        photosTotal: Object.keys(photos).length,
        uniqueRoundedCoordinates: buckets.length,
        missingCoords,
        zeroZeroCoords,
        locations: [...cacheByKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      };
      writeOutput(output, partial);
      console.log(`Saved progress: ${processed} new lookups`);
    }

    if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);
  }

  const finalPayload = {
    generatedAt: new Date().toISOString(),
    photosTotal: Object.keys(photos).length,
    uniqueRoundedCoordinates: buckets.length,
    missingCoords,
    zeroZeroCoords,
    locations: [...cacheByKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
  };

  writeOutput(output, finalPayload);
  console.log(`Wrote location resolution file: ${output}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
