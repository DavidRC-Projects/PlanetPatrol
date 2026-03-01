const WATER_TEST_TYPES = [
  { key: 'coliforms', label: 'Coliforms' },
  { key: 'nitrate', label: 'Nitrate' },
  { key: 'nitrite', label: 'Nitrite' },
  { key: 'ph', label: 'pH' },
  { key: 'phosphate', label: 'Phosphate' },
  { key: 'temperature', label: 'Temperature' }
];

const WATER_TESTS_FETCH_TIMEOUT_MS = 30000;

const WATER_TEST_RESULT_FIELDS = {
  coliforms: { valueKey: 'coliforms' },
  nitrate: { valueKey: 'nitrateReading', unitsKey: 'nitrateUnits' },
  nitrite: { valueKey: 'nitriteReading', unitsKey: 'nitriteUnits' },
  ph: { valueKey: 'ph' },
  phosphate: { valueKey: 'phosphateReading', unitsKey: 'phosphateUnits' },
  temperature: { valueKey: 'temperature' }
};

function safeJsonStringify(value, maxLen = 180) {
  let out = '';
  try {
    out = typeof value === 'string' ? value : JSON.stringify(value);
  } catch (_) {
    out = String(value);
  }
  if (out.length <= maxLen) return out;
  return `${out.slice(0, Math.max(0, maxLen - 1))}…`;
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return safeJsonStringify(value);
}

function formatResultValue(type, value) {
  if (type === 'coliforms' && typeof value === 'boolean') {
    return value ? 'Positive' : 'Negative';
  }
  return formatCellValue(value);
}

function setWaterTestsStatus(text) {
  const el = getElement(DOM_IDS.waterTestsStatus);
  if (el) el.textContent = text;
}

function formatDateTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString();
  } catch (_) {
    return d.toISOString();
  }
}

function formatDateOnly(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString();
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

function getPrimaryResult(type, record) {
  const rule = WATER_TEST_RESULT_FIELDS[type] || {};
  const valueKey = rule.valueKey;
  const unitsKey = rule.unitsKey;
  const value = valueKey ? record?.[valueKey] : undefined;
  const units = unitsKey ? record?.[unitsKey] : undefined;

  if (value !== undefined) return { value, units };

  // Fallback: look for "*Reading" or a direct type key if schemas vary.
  const keys = Object.keys(record || {});
  const readingKey = keys.find((k) => /reading$/i.test(k)) || keys.find((k) => /reading/i.test(k));
  if (readingKey) return { value: record?.[readingKey], units: undefined };
  if (type && record && Object.prototype.hasOwnProperty.call(record, type)) return { value: record[type], units: undefined };
  return { value: undefined, units: undefined };
}

function getActiveLocationDictionary() {
  // Prefer the warmed dictionary from app.js, but fallback to localStorage.
  if (typeof appState !== 'undefined' && appState?.locationDictionary) return appState.locationDictionary;
  if (typeof loadLocationDictionary === 'function') return loadLocationDictionary();
  return {};
}

function getSortedRecordIdsByNewest(records) {
  records = records || {};
  return Object.keys(records).sort((a, b) => {
    const bt = Number(records[b]?.dateTime) || 0;
    const at = Number(records[a]?.dateTime) || 0;
    if (bt !== at) return bt - at; // newest first
    // Stable-ish fallback for missing/identical timestamps.
    return String(b).localeCompare(String(a));
  });
}

function renderColiformsTable(records, dictionary) {
  const table = getElement(DOM_IDS.waterTestsTable);
  if (!table) return;
  table.classList.add('water-tests-table--coliforms');
  table.classList.remove('water-tests-table--numeric');

  const ids = getSortedRecordIdsByNewest(records);
  if (!ids.length) {
    table.innerHTML = '<tbody><tr><td class="water-tests-empty">No results found.</td></tr></tbody>';
    return;
  }

  const headerCells = [
    'Date/time',
    'Waterway',
    'Result',
    'County, Country'
  ].map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join('');

  const rows = ids.slice(0, 200).map((id) => {
    const data = records[id] || {};
    const { value } = getPrimaryResult('coliforms', data);
    const date = formatDateTime(data.dateTime);
    const waterway = data?.waterwayName || '';

    const countryInfo = typeof getCountryInfoForPhoto === 'function'
      ? getCountryInfoForPhoto(data, dictionary)
      : { country: '', label: '', constituency: '' };
    const constituencyInfo = typeof getConstituencyInfoForPhoto === 'function'
      ? getConstituencyInfoForPhoto(data, dictionary)
      : { constituency: '' };

    const countryRaw = String(countryInfo?.country || '').trim();
    const country = !countryRaw || countryRaw.toLowerCase() === 'unknown country'
      ? 'undefined'
      : countryRaw;
    const constituency = String(constituencyInfo?.constituency || '').trim();
    const locationLabel = constituency
      ? `${constituency}, ${country}`
      : (country || 'undefined');

    const cells = [
      `<td title="${escapeHtml(date)}">${escapeHtml(date)}</td>`,
      `<td title="${escapeHtml(formatCellValue(waterway))}">${escapeHtml(formatCellValue(waterway))}</td>`,
      `<td class="water-tests-result" title="${escapeHtml(formatResultValue('coliforms', value))}">${escapeHtml(formatResultValue('coliforms', value))}</td>`,
      `<td title="${escapeHtml(formatCellValue(locationLabel))}">${escapeHtml(formatCellValue(locationLabel))}</td>`
    ].join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  table.innerHTML = `
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  `;
}

function renderNumericTestsTable(type, records) {
  const table = getElement(DOM_IDS.waterTestsTable);
  if (!table) return;
  table.classList.add('water-tests-table--numeric');
  table.classList.remove('water-tests-table--coliforms');

  const ids = getSortedRecordIdsByNewest(records);
  if (!type) {
    table.innerHTML = '';
    return;
  }
  if (!ids.length) {
    table.innerHTML = '<tbody><tr><td class="water-tests-empty">No results found.</td></tr></tbody>';
    return;
  }

  const showUnits = type !== 'temperature' && type !== 'ph';
  const headerCells = [
    'Date/time',
    'Waterway',
    'Result',
    ...(showUnits ? ['Units'] : [])
  ].map((label) => `<th scope="col">${escapeHtml(label)}</th>`).join('');

  const rows = ids.slice(0, 200).map((id) => {
    const data = records[id] || {};
    const { value, units } = getPrimaryResult(type, data);
    const dt = formatDateTime(data.dateTime);
    const lat = data?.location?.latitude;
    const lng = data?.location?.longitude;
    const waterway = data?.waterwayName || '';
    const doubleChecked = data?.doubleChecked;
    const waterwayTitle = [
      waterway,
      doubleChecked === true ? 'doubleChecked: true' : (doubleChecked === false ? 'doubleChecked: false' : ''),
      lat != null && lng != null ? `(${lat}, ${lng})` : ''
    ].filter(Boolean).join(' • ');

    const cells = [
      `<td title="${escapeHtml(dt)}">${escapeHtml(dt)}</td>`,
      `<td title="${escapeHtml(formatCellValue(waterwayTitle))}">${escapeHtml(formatCellValue(waterway))}</td>`,
      `<td class="water-tests-result" title="${escapeHtml(formatResultValue(type, value))}">${escapeHtml(formatResultValue(type, value))}</td>`
    ].join('');
    const unitsCell = showUnits
      ? `<td title="${escapeHtml(formatCellValue(units))}">${escapeHtml(formatCellValue(units))}</td>`
      : '';
    return `<tr>${cells}${unitsCell}</tr>`;
  }).join('');

  table.innerHTML = `
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  `;
}

function renderWaterTestsTable(type, records, dictionary) {
  if (!type) {
    const table = getElement(DOM_IDS.waterTestsTable);
    if (table) table.innerHTML = '';
    return;
  }
  if (type === 'coliforms') {
    renderColiformsTable(records, dictionary || {});
    return;
  }
  renderNumericTestsTable(type, records);
}

async function fetchWaterTests(type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WATER_TESTS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${WATER_TESTS_PROXY_URL}?type=${encodeURIComponent(type)}&limit=500`, { signal: controller.signal });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = payload?.error || payload?.message || `Water tests API request failed (${res.status}).`;
      throw new Error(msg);
    }
    if (!payload || typeof payload !== 'object' || !payload.records || typeof payload.records !== 'object') {
      throw new Error('Unexpected water tests API response format. Expected { type, records }.');
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Water tests API request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getWaterTestLabel(type) {
  const found = WATER_TEST_TYPES.find((t) => t.key === type);
  return found ? found.label : type;
}

function bindWaterTestFilters() {
  const select = getElement(DOM_IDS.filterWaterTestType);
  if (!select || select.dataset.bound === '1') return;

  const modal = getElement(DOM_IDS.waterTestsModal);
  const closeBtn = getElement(DOM_IDS.waterTestsModalClose);

  const closeModal = () => {
    if (!modal) return;
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');

    // Reset filter + UI when closing.
    select.value = '';
    setWaterTestsStatus('Select a water test to load results.');
    renderWaterTestsTable('', {});
  };

  const openModal = () => {
    if (!modal) return;
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  };

  if (modal && closeBtn && modal.dataset.bound !== '1') {
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });
    modal.dataset.bound = '1';
  }

  let lastRequestId = 0;
  const cache = new Map(); // type -> payload

  const run = async () => {
    const type = String(select.value || '').trim();
    if (!type) {
      closeModal();
      return;
    }

    openModal();
    const label = getWaterTestLabel(type);
    setWaterTestsStatus(`Loading ${label}…`);

    const requestId = ++lastRequestId;
    try {
      const cached = cache.get(type);
      const payload = cached || await fetchWaterTests(type);
      cache.set(type, payload);
      if (requestId !== lastRequestId) return;

      const count = Object.keys(payload.records || {}).length;
      const dictionary = getActiveLocationDictionary();
      setWaterTestsStatus(`Showing ${count.toLocaleString()} ${label} results (up to 500).`);
      renderWaterTestsTable(type, payload.records, dictionary);

      // Coliforms needs country/constituency. Kick off enrichment (cached in localStorage).
      if (type === 'coliforms' && typeof getOrBuildLocationDictionary === 'function') {
        setWaterTestsStatus(`Showing ${count.toLocaleString()} ${label} results (up to 500). Resolving locations…`);
        void getOrBuildLocationDictionary(payload.records)
          .then((nextDictionary) => {
            if (requestId !== lastRequestId) return;
            if (typeof appState !== 'undefined' && appState) appState.locationDictionary = nextDictionary;
            setWaterTestsStatus(`Showing ${count.toLocaleString()} ${label} results (up to 500).`);
            renderWaterTestsTable(type, payload.records, nextDictionary);
          })
          .catch(() => {
            // Keep current render even if geocoding fails.
            if (requestId !== lastRequestId) return;
            setWaterTestsStatus(`Showing ${count.toLocaleString()} ${label} results (up to 500).`);
          });
      }
    } catch (error) {
      if (requestId !== lastRequestId) return;
      setWaterTestsStatus(error.message || 'Unable to load water testing results.');
      renderWaterTestsTable(type, {});
    }
  };

  select.addEventListener('change', () => { void run(); });
  select.dataset.bound = '1';

  // Render initial state.
  void run();
}

