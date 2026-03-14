/** App entry point. Loads data and wires UI controls. */
const appState = { photos: {}, missions: {}, surveys: {}, incidents: {}, locationDictionary: {} };

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

async function warmLocationDictionary(photos) {
  try {
    appState.locationDictionary = loadLocationDictionary();
  } catch (_) {
    appState.locationDictionary = {};
  }
  const dict = appState.locationDictionary || {};
  const keyCount = Object.keys(dict).length;
  if (keyCount === 0 && photos && Object.keys(photos).length > 0) {
    const bootstrap = await buildDictionaryFromResolutionDataOnly(photos);
    if (Object.keys(bootstrap).length > 0) {
      appState.locationDictionary = bootstrap;
    }
    void getOrBuildLocationDictionary(photos).then((next) => {
      appState.locationDictionary = next;
      void applyFilters(appState.photos, appState.locationDictionary, appState.missions);
    });
  }
}

async function loadData() {
  const required = [DOM_IDS.loading, DOM_IDS.dashboard, DOM_IDS.error];
  if (!hasRequiredElements(required)) return;

  setViewState({ loading: 'block', dashboard: 'none', error: 'none' });

  try {
    const [photoPayload, missionPayload, surveyPayload, incidentPayload] = await Promise.all([
      fetchData(),
      fetchMissions().catch(() => ({ missions: {} })),
      fetchSurveys().catch(() => ({ surveys: {} })),
      fetchIncidents().catch(() => ({ incidents: {} }))
    ]);
    appState.photos = photoPayload.photos;
    appState.missions = missionPayload.missions || {};
    appState.surveys = surveyPayload.surveys || {};
    appState.incidents = incidentPayload.incidents || {};
    await warmLocationDictionary(appState.photos);
    showDashboard();
    populateYearOptions(appState.photos);
    void applyFilters(appState.photos, appState.locationDictionary, appState.missions);
  } catch (error) {
    showError(error.message || 'We could not load data from the API. Please try again shortly.');
  }
}

function init() {
  const required = [DOM_IDS.loading, DOM_IDS.dashboard, DOM_IDS.error];
  if (!hasRequiredElements(required)) return;

  bindWaterTestFilters();
  bindHeatMapModal();
  bindFilterAutoRefresh();
  bindTimeSeriesModal();
  bindPieChartModals();
  bindMissionPartnerModal();
  bindTopBrandsLabelsModal();
  bindFieldReportCardsToModals();
  bindRecordDetailModal();

  const retryEl = getElement(DOM_IDS.errorRetry);
  if (retryEl) retryEl.addEventListener('click', () => void loadData());

  void loadData();
}

init();
