/** Filter logic and UI state extraction. */
function filterPhotos(photos, locationDictionary, missions, country, constituency, mission, status, minPieces, year, month, day, brandLabelSearch) {
  photos = photos || {};
  const normalizedBrandLabelSearch = normalizeBrandLabelSearch(brandLabelSearch);
  const out = {};
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const countryInfo = getCountryInfoForPhoto(photo, locationDictionary);
    const constituencyInfo = getConstituencyInfoForPhoto(photo, locationDictionary);
    if (country && countryInfo.countryKey !== country) continue;
    if (constituency && constituencyInfo.key !== constituency) continue;
    if (!photoMatchesMissionKey(photo, mission, missions)) continue;
    if (!passesStatusFilter(photo, status)) continue;
    if (!passesPiecesFilter(photo, minPieces)) continue;
    if (!passesDateFilter(photo, year, month, day)) continue;
    if (!passesBrandLabelFilter(photo, brandLabelSearch)) continue;
    if (!normalizedBrandLabelSearch) {
      out[id] = photo;
      continue;
    }

    // Keep only exact brand/label matches so output lists stay specific.
    const matchingCategories = getPhotoCategories(photo).filter((category) =>
      categoryMatchesBrandLabelSearch(category, normalizedBrandLabelSearch)
    );
    if (!matchingCategories.length) continue;
    out[id] = { ...photo, categories: matchingCategories };
  }
  return out;
}

/** Reads current filter values from the filter controls. */
function getFilterValues() {
  const ids = [
    DOM_IDS.filterMission,
    DOM_IDS.filterStatus,
    DOM_IDS.filterMinPieces,
    DOM_IDS.filterYear,
    DOM_IDS.filterMonth,
    DOM_IDS.filterDay,
    DOM_IDS.filterCountry,
    DOM_IDS.filterConstituency,
    DOM_IDS.filterBrandLabelSearch
  ];
  const els = getElements(ids);
  if (!ids.every((id) => els[id])) return null;
  return {
    mission: els[DOM_IDS.filterMission].value,
    status: els[DOM_IDS.filterStatus].value,
    minPieces: Math.max(0, parseInt(els[DOM_IDS.filterMinPieces].value, 10) || 0),
    year: els[DOM_IDS.filterYear].value,
    month: els[DOM_IDS.filterMonth].value,
    day: els[DOM_IDS.filterDay].value,
    country: els[DOM_IDS.filterCountry].value,
    constituency: els[DOM_IDS.filterConstituency].value,
    brandLabelSearch: els[DOM_IDS.filterBrandLabelSearch].value
  };
}

function populateMissionOptions(photos, missions, selectedMission = '') {
  const el = getElement(DOM_IDS.filterMission);
  if (!el) return '';
  const options = buildMissionFilterOptions(photos, missions);
  el.innerHTML = '<option value="">All missions</option>';
  for (const item of options) {
    el.appendChild(new Option(`${item.name} (${formatCount(item.pieces)})`, item.key));
  }
  const stillValid = options.some((item) => item.key === selectedMission);
  el.value = stillValid ? selectedMission : '';
  return el.value;
}

/** Populates year dropdown from unique photo years. */
function populateYearOptions(photos) {
  photos = photos || {};
  const years = new Set();
  for (const id of Object.keys(photos)) {
    const d = getPhotoDate(photos[id]);
    if (!d) continue;
    const year = d.getFullYear();
    // Hide 1970 in the dropdown: this typically comes from missing/invalid timestamps that
    // parse to the Unix epoch, and it clutters the filter UI.
    if (year === 1970) continue;
    years.add(year);
  }
  const el = getElement(DOM_IDS.filterYear);
  if (!el) return;
  el.innerHTML = '<option value="">All</option>';
  const sortedYears = [...years].sort((a, b) => a - b);
  for (const year of sortedYears) {
    el.appendChild(new Option(year, year));
  }
}

function updateCountryHeader(selectedCountry, countries) {
  const flagEl = getElement(DOM_IDS.countryFlag);
  const nameEl = getElement(DOM_IDS.countryName);
  if (!flagEl || !nameEl) return;
  if (!selectedCountry) {
    flagEl.textContent = '🌍';
    nameEl.textContent = 'All countries';
    return;
  }
  const selected = countries.find((item) => item.key === selectedCountry);
  if (!selected) {
    flagEl.textContent = '🌍';
    nameEl.textContent = 'All countries';
    return;
  }
  flagEl.textContent = countryCodeToFlag(selected.countryCode);
  nameEl.textContent = selected.country;
}

function populateCountryOptions(photos, dictionary, selectedCountry = '') {
  const el = getElement(DOM_IDS.filterCountry);
  if (!el) return '';
  const countries = buildCountryCounts(photos, dictionary);
  el.innerHTML = '<option value="">All countries</option>';
  for (const item of countries) {
    const flag = countryCodeToFlag(item.countryCode);
    el.appendChild(new Option(`${flag} ${item.country} (${item.count})`, item.key));
  }
  const stillValid = countries.some((item) => item.key === selectedCountry);
  el.value = stillValid ? selectedCountry : '';
  updateCountryHeader(el.value, countries);
  return el.value;
}

function populateConstituencyOptions(photos, dictionary, selectedCountry = '', selectedConstituency = '') {
  const el = getElement(DOM_IDS.filterConstituency);
  const labelEl = getElement(DOM_IDS.filterConstituencyLabel);
  if (!el) return '';
  if (!selectedCountry) {
    if (labelEl) labelEl.textContent = 'County / location';
    el.innerHTML = '<option value="">Select a country first</option>';
    el.value = '';
    return '';
  }
  if (labelEl) labelEl.textContent = 'County / location';
  const constituencies = buildConstituencyCounts(photos, dictionary, selectedCountry);
  el.innerHTML = '<option value="">All counties / locations</option>';
  for (const item of constituencies) {
    el.appendChild(new Option(`${item.constituency} (${item.count})`, item.key));
  }
  const stillValid = constituencies.some((item) => item.key === selectedConstituency);
  el.value = stillValid ? selectedConstituency : '';
  return el.value;
}

function applyMissionCountryExclusivity(values) {
  const countryEl = getElement(DOM_IDS.filterCountry);
  const constituencyEl = getElement(DOM_IDS.filterConstituency);
  if (!countryEl || !constituencyEl) return values;

  const missionSelected = !!values.mission;
  countryEl.disabled = missionSelected;
  constituencyEl.disabled = missionSelected;

  if (missionSelected) {
    // Mission mode: force location filters off to avoid mixed scopes.
    values.country = '';
    values.constituency = '';
    countryEl.value = '';
    constituencyEl.value = '';
  }
  return values;
}

/** Applies active filters and renders all dashboard sections. */
async function applyFilters(photos, locationDictionary, missions) {
  const values = getFilterValues();
  if (!values) return;
  applyMissionCountryExclusivity(values);
  values.mission = populateMissionOptions(photos, missions, values.mission);
  values.country = populateCountryOptions(photos, locationDictionary, values.country);
  values.constituency = populateConstituencyOptions(
    photos,
    locationDictionary,
    values.country,
    values.constituency
  );
  const filtered = filterPhotos(
    photos,
    locationDictionary,
    missions,
    values.country,
    values.constituency,
    values.mission,
    values.status,
    values.minPieces,
    values.year,
    values.month,
    values.day,
    values.brandLabelSearch
  );
  await renderFilteredView(filtered, values, missions, photos);
}
