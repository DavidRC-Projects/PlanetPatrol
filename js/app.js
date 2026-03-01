/** App entry point. Loads data and wires UI controls. */
const appState = { photos: {}, missions: {}, locationDictionary: {} };

/**
 * Sets section visibility in a way that works for layout + accessibility.
 * Uses the `hidden` attribute and `.hidden` utility class, and also sets inline display
 * as a fallback for existing behavior.
 */
function setDisplay(id, value) {
  const el = getElement(id);
  if (!el) return;
  const isVisible = value !== 'none';
  el.hidden = !isVisible;
  el.classList.toggle('hidden', !isVisible);
  el.setAttribute('aria-hidden', String(!isVisible));
  el.style.display = isVisible ? '' : 'none';
}

/** Sets loading/dashboard/error sections. */
function setViewState({ loading, dashboard, error, errorMessage = '' }) {
  setDisplay(DOM_IDS.loading, loading);
  setDisplay(DOM_IDS.dashboard, dashboard);
  setDisplay(DOM_IDS.error, error);
  const errorEl = getElement(DOM_IDS.errorMessage);
  if (errorEl) errorEl.textContent = errorMessage;
}

function showDashboard() {
  setViewState({ loading: 'none', dashboard: 'block', error: 'none' });
}

function showError(message) {
  setViewState({ loading: 'none', dashboard: 'none', error: 'block', errorMessage: message });
}

function bindFilterAutoRefresh() {
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
  for (const id of ids) {
    const el = els[id];
    if (!el) continue;
    const isTextSearch = id === DOM_IDS.filterBrandLabelSearch;
    const eventName = isTextSearch ? 'input' : 'change';
    el.addEventListener(eventName, () => { void applyFilters(appState.photos, appState.locationDictionary, appState.missions); });
  }
}

function warmLocationDictionary(photos) {
  try {
    appState.locationDictionary = loadLocationDictionary();
  } catch (_) {
    appState.locationDictionary = {};
  }

  // Build missing coordinate labels in background without blocking dashboard render.
  void getOrBuildLocationDictionary(photos)
    .then((dictionary) => {
      appState.locationDictionary = dictionary;
      void applyFilters(appState.photos, appState.locationDictionary, appState.missions);
    })
    .catch(() => {
      // Keep app usable even if reverse geocoding fails.
    });
}

async function init() {
  const required = [DOM_IDS.loading, DOM_IDS.dashboard, DOM_IDS.error];
  if (!hasRequiredElements(required)) return;

  // Water testing queries do not depend on the photo dataset, so bind immediately.
  bindWaterTestFilters();

  try {
    const [photoPayload, missionPayload] = await Promise.all([
      fetchData(),
      fetchMissions().catch(() => ({ missions: {} }))
    ]);
    appState.photos = photoPayload.photos;
    appState.missions = missionPayload.missions || {};
    warmLocationDictionary(appState.photos);
    showDashboard();
    populateYearOptions(appState.photos);
    bindFilterAutoRefresh();
    bindTimeSeriesModal();
    bindMissionPartnerModal();
    void applyFilters(appState.photos, appState.locationDictionary, appState.missions);
  } catch (error) {
    showError(error.message || 'We could not load data from the API. Please try again shortly.');
  }
}

init();
