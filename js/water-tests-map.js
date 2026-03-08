/**
 * Water tests map using Leaflet. Circle markers for clarity; focused on UK.
 */

const HEATMAP_DICTIONARY_STORAGE_KEY = 'planetpatrol.waterTestsLocationDictionary.v1';

const UK_BOUNDS = [[49.5, -8.2], [60.9, 2.1]];
const UK_CENTER = [54.5, -2.5];
const UK_ZOOM = 6;

let waterTestsMapInstance = null;
let waterTestsMarkerLayer = null;

function getRecordCoordinates(record) {
  const loc = record?.location;
  if (!loc) return null;
  const lat = Number(loc._latitude ?? loc.latitude);
  const lng = Number(loc._longitude ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Returns { lat, lng, color, radius, tooltip } for each point. Green = low/safe, red = concerning. */
function buildMarkerData(records, type) {
  const points = [];
  records = records || {};
  const getResult = typeof getPrimaryResult === 'function' ? getPrimaryResult : () => ({ value: undefined });

  if (type === 'coliforms') {
    for (const rec of Object.values(records)) {
      const coords = getRecordCoordinates(rec);
      if (!coords) continue;
      const { value } = getResult(type, rec);
      const isPositive = value === true;
      points.push({
        lat: coords.lat,
        lng: coords.lng,
        color: isPositive ? '#dc2626' : '#16a34a',
        radius: 12,
        tooltip: isPositive ? 'Coliforms: Positive' : 'Coliforms: Negative'
      });
    }
    return points;
  }

  if (type === 'ph') {
    for (const rec of Object.values(records)) {
      const coords = getRecordCoordinates(rec);
      if (!coords) continue;
      const { value } = getResult(type, rec);
      const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (num === null) continue;
      let color = '#94a3b8';
      if (num === 7) color = '#16a34a';
      else if (num <= 6 || num >= 8) color = '#dc2626';
      else color = '#ea580c';
      points.push({
        lat: coords.lat,
        lng: coords.lng,
        color,
        radius: 10,
        tooltip: `pH: ${num}`
      });
    }
    return points;
  }

  if (type === 'phosphate') {
    for (const rec of Object.values(records)) {
      const coords = getRecordCoordinates(rec);
      if (!coords) continue;
      const { value, units } = getResult(type, rec);
      const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (num === null) continue;
      let color = '#94a3b8';
      if (num <= 20) color = '#16a34a';
      else if (num <= 50) color = '#22c55e';
      else if (num <= 100) color = '#eab308';
      else if (num <= 200) color = '#ea580c';
      else if (num <= 500) color = '#dc2626';
      else color = '#b91c1c';
      const unitStr = units ? ` ${units}` : ' ppb';
      points.push({
        lat: coords.lat,
        lng: coords.lng,
        color,
        radius: 10,
        tooltip: `Phosphate: ${num}${unitStr}`
      });
    }
    return points;
  }

  if (type === 'temperature') {
    for (const rec of Object.values(records)) {
      const coords = getRecordCoordinates(rec);
      if (!coords) continue;
      const { value } = getResult(type, rec);
      const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (num === null) continue;
      let color = '#94a3b8';
      if (num <= 19) color = '#16a34a';
      else if (num < 25) color = '#ea580c';
      else color = '#dc2626';
      points.push({
        lat: coords.lat,
        lng: coords.lng,
        color,
        radius: 10,
        tooltip: `Temperature: ${num} °C`
      });
    }
    return points;
  }

  if (type === 'nitrate') {
    for (const rec of Object.values(records)) {
      const coords = getRecordCoordinates(rec);
      if (!coords) continue;
      const { value, units } = getResult(type, rec);
      const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (num === null) continue;
      let color = '#94a3b8';
      if (num <= 1) color = '#16a34a';
      else if (num <= 5) color = '#22c55e';
      else if (num <= 10) color = '#eab308';
      else if (num <= 25) color = '#ea580c';
      else color = '#dc2626';
      const unitStr = units ? ` ${units}` : ' mg/L';
      points.push({
        lat: coords.lat,
        lng: coords.lng,
        color,
        radius: 10,
        tooltip: `Nitrate: ${num}${unitStr}`
      });
    }
    return points;
  }

  const entriesWithCoords = [];
  for (const rec of Object.values(records)) {
    const coords = getRecordCoordinates(rec);
    if (!coords) continue;
    const { value } = getResult(type, rec);
    const num = typeof value === 'number' && Number.isFinite(value) ? value : null;
    entriesWithCoords.push({ coords, num: num !== null ? num : 0 });
  }

  const values = entriesWithCoords.map((e) => e.num);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;

  const typeLabel = type === 'nitrite' ? 'Nitrite' : type;

  for (const { coords, num } of entriesWithCoords) {
    const t = range > 0 ? (num - min) / range : 0;
    const color = t < 0.33 ? '#16a34a' : t < 0.66 ? '#eab308' : '#dc2626';
    points.push({
      lat: coords.lat,
      lng: coords.lng,
      color,
      radius: 10,
      tooltip: `${typeLabel}: ${num}`
    });
  }

  return points;
}

function initWaterTestsMap(containerId) {
  const el = getElement(containerId);
  if (!el || waterTestsMapInstance) return waterTestsMapInstance;

  waterTestsMapInstance = L.map(el).setView(UK_CENTER, UK_ZOOM);
  waterTestsMapInstance.setMaxBounds(L.latLngBounds(UK_BOUNDS));
  waterTestsMapInstance.setMinZoom(5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(waterTestsMapInstance);

  return waterTestsMapInstance;
}

function clearWaterTestsMarkers() {
  if (waterTestsMapInstance && waterTestsMarkerLayer) {
    waterTestsMapInstance.removeLayer(waterTestsMarkerLayer);
    waterTestsMarkerLayer = null;
  }
}

function renderWaterTestsHeatmap(records, type) {
  const mapEl = getElement(DOM_IDS.waterTestsMap);
  const emptyEl = getElement(DOM_IDS.waterTestsMapEmpty);
  if (!mapEl) return;

  const map = initWaterTestsMap(DOM_IDS.waterTestsMap);
  if (!map) return;

  clearWaterTestsMarkers();

  const points = buildMarkerData(records, type);

  if (!points.length) {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.classList.remove('hidden');
    }
    map.setView(UK_CENTER, UK_ZOOM);
    return;
  }

  if (emptyEl) {
    emptyEl.hidden = true;
    emptyEl.classList.add('hidden');
  }

  const markerGroup = L.layerGroup();
  const lats = [];
  const lngs = [];

  for (const p of points) {
    lats.push(p.lat);
    lngs.push(p.lng);
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: p.radius || 10,
      fillColor: p.color,
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    });
    marker.bindTooltip(p.tooltip, {
      permanent: false,
      direction: 'top',
      className: 'water-tests-map-tooltip'
    });
    marker.addTo(markerGroup);
  }

  markerGroup.addTo(waterTestsMapInstance);
  waterTestsMarkerLayer = markerGroup;

  if (lats.length && lngs.length) {
    const bounds = L.latLngBounds(
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }
}

function invalidateWaterTestsMapSize() {
  if (waterTestsMapInstance) {
    waterTestsMapInstance.invalidateSize();
  }
}

function getYearsFromRecords(records) {
  records = records || {};
  const years = new Set();
  for (const rec of Object.values(records)) {
    const dt = Number(rec?.dateTime);
    if (!Number.isFinite(dt)) continue;
    const year = new Date(dt).getFullYear();
    if (year === 1970) continue;
    years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}

function filterRecordsByTime(records, year, month) {
  records = records || {};
  const y = String(year || '').trim();
  const m = String(month || '').trim();
  if (!y && !m) return records;
  const filtered = {};
  for (const [id, rec] of Object.entries(records)) {
    const dt = Number(rec?.dateTime);
    if (!Number.isFinite(dt)) continue;
    const d = new Date(dt);
    if (y && d.getFullYear() !== Number(y)) continue;
    if (m && d.getMonth() + 1 !== Number(m)) continue;
    filtered[id] = rec;
  }
  return filtered;
}

function filterRecordsByCountry(records, dictionary, selectedCountryKey) {
  if (!records || !selectedCountryKey) return records || {};
  const out = {};
  for (const id of Object.keys(records)) {
    const info = typeof getCountryInfoForPhoto === 'function'
      ? getCountryInfoForPhoto(records[id], dictionary)
      : { countryKey: '' };
    if (info.countryKey === selectedCountryKey) out[id] = records[id];
  }
  return out;
}

function populateHeatmapFilterCountry(records, dictionary) {
  const el = getElement(DOM_IDS.heatmapFilterCountry);
  if (!el) return;
  const countries = typeof buildCountryCounts === 'function'
    ? buildCountryCounts(records || {}, dictionary || {})
    : [];
  el.innerHTML = '<option value="">All countries</option>';
  for (const item of countries) {
    const flag = typeof countryCodeToFlag === 'function' ? countryCodeToFlag(item.countryCode) : '🌍';
    el.appendChild(new Option(`${flag} ${item.country} (${item.count})`, item.key));
  }
  el.value = '';
}

function populateHeatmapFilterYear(records) {
  const el = getElement(DOM_IDS.heatmapFilterYear);
  if (!el) return;
  const years = getYearsFromRecords(records);
  el.innerHTML = '<option value="">All</option>';
  for (const y of years) {
    el.appendChild(new Option(y, y));
  }
  el.value = '';
}

function bindHeatMapModal() {
  const btn = getElement(DOM_IDS.waterTestsHeatmapBtn);
  const modal = getElement(DOM_IDS.waterTestsHeatmapModal);
  const closeBtn = getElement(DOM_IDS.waterTestsHeatmapModalClose);
  const typeEl = getElement(DOM_IDS.heatmapFilterType);
  const yearEl = getElement(DOM_IDS.heatmapFilterYear);
  const monthEl = getElement(DOM_IDS.heatmapFilterMonth);
  const countryEl = getElement(DOM_IDS.heatmapFilterCountry);

  if (!btn || !modal || !closeBtn || modal.dataset.bound === '1') return;

  const cache = new Map();
  const dictionaryCache = new Map();
  let currentPayload = null;
  let currentDictionary = {};

  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    clearWaterTestsMarkers();
  };

  const applyFiltersAndRender = () => {
    if (!currentPayload || !typeEl) return;
    const type = String(typeEl.value || '').trim();
    if (!type) return;
    const year = yearEl ? yearEl.value : '';
    const month = monthEl ? monthEl.value : '';
    const country = countryEl ? countryEl.value : '';
    let filtered = filterRecordsByTime(currentPayload.records, year, month);
    if (country) filtered = filterRecordsByCountry(filtered, currentDictionary, country);
    renderWaterTestsHeatmap(filtered, type);
  };

  const loadAndRender = async () => {
    const type = String(typeEl?.value || '').trim();
    if (!type) {
      currentPayload = null;
      currentDictionary = {};
      clearWaterTestsMarkers();
      const emptyEl = getElement(DOM_IDS.waterTestsMapEmpty);
      if (emptyEl) {
        emptyEl.hidden = true;
        emptyEl.classList.add('hidden');
      }
      return;
    }

    try {
      const cached = cache.get(type);
      const payload = cached || await fetchWaterTests(type);
      cache.set(type, payload);
      currentPayload = payload;
      populateHeatmapFilterYear(payload.records);
      if (yearEl) yearEl.value = '';
      if (monthEl) monthEl.value = '';
      if (countryEl) countryEl.value = '';

      let dict = typeof loadLocationDictionary === 'function'
        ? loadLocationDictionary(HEATMAP_DICTIONARY_STORAGE_KEY)
        : {};
      populateHeatmapFilterCountry(payload.records, dict);
      currentDictionary = dict;
      applyFiltersAndRender();

      if (typeof getOrBuildLocationDictionary === 'function' && payload.records && Object.keys(payload.records).length > 0) {
        void getOrBuildLocationDictionary(payload.records, {
          storageKey: HEATMAP_DICTIONARY_STORAGE_KEY
        }).then((nextDict) => {
          currentDictionary = nextDict;
          populateHeatmapFilterCountry(payload.records, nextDict);
          applyFiltersAndRender();
        });
      }
      setTimeout(invalidateWaterTestsMapSize, 150);
    } catch (err) {
      currentPayload = null;
      currentDictionary = {};
      clearWaterTestsMarkers();
    }
  };

  btn.addEventListener('click', () => {
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    const type = String(typeEl?.value || '').trim();
    if (type) {
      void loadAndRender();
    } else {
      setTimeout(invalidateWaterTestsMapSize, 100);
    }
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  typeEl.addEventListener('change', () => { void loadAndRender(); });
  if (yearEl) yearEl.addEventListener('change', applyFiltersAndRender);
  if (monthEl) monthEl.addEventListener('change', applyFiltersAndRender);
  if (countryEl) countryEl.addEventListener('change', applyFiltersAndRender);

  modal.dataset.bound = '1';
}
