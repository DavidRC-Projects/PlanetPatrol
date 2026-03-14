/**
 * Renders the dashboard UI from filtered photo data.
 */

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Updates summary cards. */
function renderCards(filtered) {
  filtered = filtered || {};
  const ids = [
    DOM_IDS.totalPieces,
    DOM_IDS.unmoderatedPieces,
    DOM_IDS.moderated,
    DOM_IDS.unmoderated,
    DOM_IDS.totalPhotos,
    DOM_IDS.totalSurveys,
    DOM_IDS.totalIncidents
  ];
  const els = getElements(ids);
  if (!ids.every((id) => els[id])) return;

  els[DOM_IDS.totalPieces].textContent = sumTotalPieces(filtered);
  els[DOM_IDS.unmoderatedPieces].textContent = sumUnmoderatedPieces(filtered);
  els[DOM_IDS.moderated].textContent = countModerated(filtered);
  els[DOM_IDS.unmoderated].textContent = countUnmoderated(filtered);
  els[DOM_IDS.totalPhotos].textContent = Object.keys(filtered).length;
  els[DOM_IDS.totalSurveys].textContent = Object.keys(appState?.surveys || {}).length;
  els[DOM_IDS.totalIncidents].textContent = Object.keys(appState?.incidents || {}).length;
}

function buildTopListItems(items) {
  if (!items.length) return '<li class="empty">No data for current filters</li>';
  return items
    .map(({ name, count }) => `<li><span class="item-name">${escapeHtml(name)}</span><span class="item-count">${count}</span></li>`)
    .join('');
}

function formatCount(value) {
  const n = Number(value) || 0;
  try {
    return n.toLocaleString();
  } catch (_) {
    return String(n);
  }
}

function rankIcon(rank) {
  if (rank === 1) return '🏆';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

function buildMissionSummary(items) {
  if (!items.length) return '<span class="empty">No mission data</span>';
  const top = items.slice(0, 3);
  return top
    .map((row, idx) => {
      const rank = idx + 1;
      const icon = rankIcon(rank);
      const iconLabel = rank === 1 ? 'Trophy' : 'Medal';
      return `
        <span class="podium-chip podium-chip--${rank}">
          <span class="podium-icon" aria-label="${iconLabel} for rank ${rank}">${icon}</span>
          <span class="podium-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
          <span class="podium-count">${formatCount(row.count)} pieces</span>
        </span>
      `;
    })
    .join('');
}

function buildMissionTableRows(items) {
  if (!items.length) {
    return '<tr><td class="leaderboard-empty" colspan="3">No data for current filters</td></tr>';
  }

  return items
    .map((row, idx) => {
      const rank = idx + 1;
      const icon = rankIcon(rank);
      const iconCell = icon
        ? `<span class="rank-badge rank-badge--${rank}" aria-hidden="true">${icon}</span>`
        : '';
      return `
        <tr>
          <td class="leaderboard-rank">
            ${iconCell}
            <span class="leaderboard-rank-num">${rank}</span>
          </td>
          <td class="leaderboard-mission">${escapeHtml(row.name)}</td>
          <td class="leaderboard-num">${formatCount(row.count)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderTopCollections(filtered) {
  /* Top 50 brands/labels now rendered in modal on open */
}

function renderMissionLeaderboard(missions, photos) {
  const tableEl = getElement(DOM_IDS.topMissionsList);
  if (!tableEl) return;
  const items = topMissionTotals(missions, photos, 20);
  tableEl.innerHTML = buildMissionTableRows(items);

  const summaryEl = getElement(DOM_IDS.topMissionsSummary);
  if (summaryEl) summaryEl.innerHTML = buildMissionSummary(items);
}

function renderMissionPartnerSnapshot(filtered, filters, missions) {
  const openBtn = getElement(DOM_IDS.missionPartnerOpen);
  const modalTitleEl = getElement(DOM_IDS.missionPartnerModalTitle);
  const brandsTitleEl = getElement(DOM_IDS.missionPartnerTopBrandsTitle);
  const labelsTitleEl = getElement(DOM_IDS.missionPartnerTopLabelsTitle);
  const brandEl = getElement(DOM_IDS.missionPartnerTopBrands);
  const labelEl = getElement(DOM_IDS.missionPartnerTopLabels);
  if (!brandEl || !labelEl) return;

  const selectedMission = String(filters?.mission || '').trim();
  const missionName = selectedMission ? getMissionNameByFilterKey(missions, selectedMission) : '';
  const contextLabel = missionName || 'all missions';
  if (openBtn) {
    openBtn.textContent = missionName
      ? `View top 10 brands and labels for ${missionName}`
      : 'View top 10 brands and labels for all missions';
  }
  if (modalTitleEl) modalTitleEl.textContent = `Top brands and labels for ${contextLabel}`;
  if (brandsTitleEl) brandsTitleEl.textContent = `Top 10 brands for ${contextLabel}`;
  if (labelsTitleEl) labelsTitleEl.textContent = `Top 10 labels for ${contextLabel}`;

  brandEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'brand', 10));
  labelEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'label', 10));
}

function bindTopBrandsLabelsModal() {
  const brandsBtn = getElement(DOM_IDS.topBrandsOpen);
  const labelsBtn = getElement(DOM_IDS.topLabelsOpen);
  const modal = getElement(DOM_IDS.topBrandsLabelsModal);
  const closeBtn = getElement(DOM_IDS.topBrandsLabelsModalClose);
  const titleEl = getElement(DOM_IDS.topBrandsLabelsModalTitle);
  const listEl = getElement(DOM_IDS.topBrandsLabelsModalList);
  if (!brandsBtn || !labelsBtn || !modal || !closeBtn || !titleEl || !listEl || modal.dataset.bound === '1') return;

  let lastFocused = null;
  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  const openModal = (type) => {
    const filtered = typeof appState !== 'undefined' && appState ? appState.filteredPhotos : {};
    const isBrand = type === 'brand';
    const items = topCategoryTotals(filtered, type, 50);
    titleEl.textContent = isBrand ? 'Top 50 Brands' : 'Top 50 Labels';
    listEl.innerHTML = buildTopListItems(items);
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeBtn.focus();
  };

  brandsBtn.addEventListener('click', () => openModal('brand'));
  labelsBtn.addEventListener('click', () => openModal('label'));
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  modal.dataset.bound = '1';
}

function bindMissionPartnerModal() {
  const openBtn = getElement(DOM_IDS.missionPartnerOpen);
  const modal = getElement(DOM_IDS.missionPartnerModal);
  const closeBtn = getElement(DOM_IDS.missionPartnerModalClose);
  if (!openBtn || !modal || !closeBtn || modal.dataset.bound === '1') return;

  let lastFocused = null;
  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  const openModal = () => {
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeBtn.focus();
  };

  const handleOpen = (event) => {
    // Button lives inside <summary>; prevent toggling the accordion when opening modal.
    event.preventDefault();
    event.stopPropagation();
    openModal();
  };
  openBtn.addEventListener('click', handleOpen);
  openBtn.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleOpen(event);
  });
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  modal.dataset.bound = '1';
}

function bindFieldReportCardsToModals() {
  const incidentOpen = getElement(DOM_IDS.totalIncidentsOpen);
  const surveyOpen = getElement(DOM_IDS.totalSurveysOpen);
  const incidentModal = getElement(DOM_IDS.incidentReportsModal);
  const surveyModal = getElement(DOM_IDS.surveyReportsModal);
  const incidentClose = getElement(DOM_IDS.incidentReportsModalClose);
  const surveyClose = getElement(DOM_IDS.surveyReportsModalClose);
  if (!incidentOpen || !surveyOpen || !incidentModal || !surveyModal || !incidentClose || !surveyClose) return;
  if (incidentModal.dataset.bound === '1' && surveyModal.dataset.bound === '1') return;

  let lastFocused = null;
  const openModal = (modal) => {
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  };
  const closeModal = (modal) => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (incidentModal.hidden && surveyModal.hidden) {
      document.body.classList.remove('modal-open');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }
  };

  incidentOpen.addEventListener('click', () => openModal(incidentModal));
  surveyOpen.addEventListener('click', () => openModal(surveyModal));
  incidentClose.addEventListener('click', () => closeModal(incidentModal));
  surveyClose.addEventListener('click', () => closeModal(surveyModal));

  incidentModal.addEventListener('click', (event) => {
    if (event.target === incidentModal) closeModal(incidentModal);
  });
  surveyModal.addEventListener('click', (event) => {
    if (event.target === surveyModal) closeModal(surveyModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!incidentModal.hidden) closeModal(incidentModal);
    if (!surveyModal.hidden) closeModal(surveyModal);
  });

  incidentModal.dataset.bound = '1';
  surveyModal.dataset.bound = '1';
}

function getRecordImageUrl(kind, id) {
  const safeId = encodeURIComponent(String(id || '').trim());
  if (!safeId) return '';
  const folder = kind === 'incident' ? 'incidents' : 'surveys';
  return `${STORAGE_BUCKET_PUBLIC_BASE_URL}/${folder}/${safeId}/1024.jpg`;
}

function formatRecordDateTime(value) {
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

function summarizeRecord(kind, record) {
  if (kind === 'incident') {
    return String(record?.waterwayName || record?.description || 'Incident report').trim();
  }
  return String(record?.name_of_waterway || record?.surveyId || 'Observational survey').trim();
}

function sortedRecordEntries(records) {
  return Object.entries(records || {}).sort((a, b) => {
    const at = Number(a?.[1]?.dateTime) || 0;
    const bt = Number(b?.[1]?.dateTime) || 0;
    if (bt !== at) return bt - at;
    return String(b[0]).localeCompare(String(a[0]));
  });
}

function buildRecordGalleryMarkup(records, kind, limit = 24) {
  const entries = sortedRecordEntries(records).slice(0, limit);
  if (!entries.length) return '<p class="empty">No records available.</p>';
  return entries.map(([id, record]) => {
    const imageUrl = getRecordImageUrl(kind, id);
    const summary = summarizeRecord(kind, record) || (kind === 'incident' ? 'Incident report' : 'Observational survey');
    const dateTime = formatRecordDateTime(record?.dateTime);
    const typeLabel = kind === 'incident' ? 'Incident' : 'Survey';
    const title = `${typeLabel}: ${summary}`;
    return `
      <button
        type="button"
        class="record-card-btn"
        data-record-kind="${kind}"
        data-record-id="${escapeHtml(id)}"
        aria-label="${escapeHtml(title)}"
      >
        <img class="record-thumb" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy">
        <span class="record-card-meta">
          <span class="record-card-title">${escapeHtml(summary)}</span>
          <span class="record-card-sub">${escapeHtml(dateTime || 'Date unavailable')}</span>
        </span>
      </button>
    `;
  }).join('');
}

function wireRecordThumbFallbacks(container) {
  if (!container) return;
  const images = container.querySelectorAll('.record-thumb');
  for (const img of images) {
    if (img.dataset.boundError === '1') continue;
    img.addEventListener('error', () => {
      img.classList.add('record-thumb--broken');
      img.alt = 'Image unavailable';
    });
    img.dataset.boundError = '1';
  }
}

function renderRecordGalleries() {
  const incidentEl = getElement(DOM_IDS.incidentGalleryList);
  const surveyEl = getElement(DOM_IDS.surveyGalleryList);
  if (!incidentEl || !surveyEl) return;

  incidentEl.innerHTML = buildRecordGalleryMarkup(appState?.incidents || {}, 'incident');
  surveyEl.innerHTML = buildRecordGalleryMarkup(appState?.surveys || {}, 'survey');
  wireRecordThumbFallbacks(incidentEl);
  wireRecordThumbFallbacks(surveyEl);
}

function stringifyRecordValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function buildRecordDetailRows(record) {
  const entries = Object.entries(record || {});
  if (!entries.length) return '<p class="empty">No details available.</p>';
  const sorted = entries.sort(([a], [b]) => {
    if (a === 'dateTime') return -1;
    if (b === 'dateTime') return 1;
    return a.localeCompare(b);
  });
  return sorted.map(([key, value]) => {
    const display = key === 'dateTime'
      ? (formatRecordDateTime(value) || stringifyRecordValue(value))
      : stringifyRecordValue(value);
    return `
      <div class="record-detail-row">
        <div class="record-detail-key">${escapeHtml(key)}</div>
        <div class="record-detail-value">${escapeHtml(display)}</div>
      </div>
    `;
  }).join('');
}

function bindRecordDetailModal() {
  const modal = getElement(DOM_IDS.recordDetailModal);
  const closeBtn = getElement(DOM_IDS.recordDetailModalClose);
  const titleEl = getElement(DOM_IDS.recordDetailModalTitle);
  const imageEl = getElement(DOM_IDS.recordDetailModalImage);
  const imageWrapEl = getElement(DOM_IDS.recordDetailModalImageWrap);
  const imageEmptyEl = getElement(DOM_IDS.recordDetailModalImageEmpty);
  const bodyEl = getElement(DOM_IDS.recordDetailModalBody);
  if (!modal || !closeBtn || !titleEl || !imageEl || !imageWrapEl || !imageEmptyEl || !bodyEl || modal.dataset.bound === '1') return;

  let lastFocused = null;
  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  const openModal = (kind, id) => {
    const map = kind === 'incident' ? (appState?.incidents || {}) : (appState?.surveys || {});
    const record = map[id];
    if (!record) return;
    const summary = summarizeRecord(kind, record) || id;
    const kindLabel = kind === 'incident' ? 'Incident report' : 'Observational survey';
    titleEl.textContent = `${kindLabel}: ${summary}`;

    const imageUrl = getRecordImageUrl(kind, id);
    imageEl.src = imageUrl;
    imageEl.alt = `${kindLabel} image`;
    imageEl.hidden = false;
    imageEl.classList.remove('hidden', 'record-thumb--broken');
    imageEmptyEl.hidden = true;
    imageEmptyEl.classList.add('hidden');
    imageEl.onerror = () => {
      imageEl.hidden = true;
      imageEl.classList.add('hidden');
      imageEmptyEl.hidden = false;
      imageEmptyEl.classList.remove('hidden');
    };
    imageEl.onload = () => {
      imageEl.hidden = false;
      imageEl.classList.remove('hidden');
      imageEmptyEl.hidden = true;
      imageEmptyEl.classList.add('hidden');
    };

    bodyEl.innerHTML = buildRecordDetailRows(record);
    lastFocused = document.activeElement;
    modal.hidden = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeBtn.focus();
  };

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.record-card-btn') : null;
    if (!target) return;
    const kind = String(target.getAttribute('data-record-kind') || '').trim();
    const id = String(target.getAttribute('data-record-id') || '').trim();
    if (!kind || !id) return;
    openModal(kind, id);
  });

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  modal.dataset.bound = '1';
}

/** Renders all filtered dashboard sections. */
async function renderFilteredView(filtered, filters, missions, allPhotos) {
  renderCards(filtered);
  renderTimeSeries(filtered, filters);
  renderMissionLeaderboard(missions, allPhotos || filtered);
  renderMissionPartnerSnapshot(filtered, filters, missions);
  renderTopCollections(filtered);
  renderRecordGalleries();
}
