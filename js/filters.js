/** Filter logic and UI state extraction. */
function filterPhotos(photos, locationDictionary, country, status, minPieces, year, month, brandLabelSearch) {
  photos = photos || {};
  const normalizedBrandLabelSearch = normalizeBrandLabelSearch(brandLabelSearch);
  const out = {};
  for (const id of Object.keys(photos)) {
    const photo = photos[id];
    const countryInfo = getCountryInfoForPhoto(photo, locationDictionary);
    if (country && countryInfo.countryKey !== country) continue;
    if (!passesStatusFilter(photo, status)) continue;
    if (!passesPiecesFilter(photo, minPieces)) continue;
    if (!passesDateFilter(photo, year, month)) continue;
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
    DOM_IDS.filterStatus,
    DOM_IDS.filterMinPieces,
    DOM_IDS.filterYear,
    DOM_IDS.filterMonth,
    DOM_IDS.filterCountry,
    DOM_IDS.filterBrandLabelSearch
  ];
  const els = getElements(ids);
  if (!ids.every((id) => els[id])) return null;
  return {
    status: els[DOM_IDS.filterStatus].value,
    minPieces: Math.max(0, parseInt(els[DOM_IDS.filterMinPieces].value, 10) || 0),
    year: els[DOM_IDS.filterYear].value,
    month: els[DOM_IDS.filterMonth].value,
    country: els[DOM_IDS.filterCountry].value,
    brandLabelSearch: els[DOM_IDS.filterBrandLabelSearch].value
  };
}

/** Populates year dropdown from unique photo years. */
function populateYearOptions(photos) {
  photos = photos || {};
  const years = new Set();
  for (const id of Object.keys(photos)) {
    const d = getPhotoDate(photos[id]);
    if (d) years.add(d.getFullYear());
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

/** Applies active filters and renders all dashboard sections. */
async function applyFilters(photos, locationDictionary) {
  const values = getFilterValues();
  if (!values) return;
  values.country = populateCountryOptions(photos, locationDictionary, values.country);
  const filtered = filterPhotos(
    photos,
    locationDictionary,
    values.country,
    values.status,
    values.minPieces,
    values.year,
    values.month,
    values.brandLabelSearch
  );
  await renderFilteredView(filtered);
}
