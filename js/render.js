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
    DOM_IDS.totalPhotos
  ];
  const els = getElements(ids);
  if (!ids.every((id) => els[id])) return;

  els[DOM_IDS.totalPieces].textContent = sumTotalPieces(filtered);
  els[DOM_IDS.unmoderatedPieces].textContent = sumUnmoderatedPieces(filtered);
  els[DOM_IDS.moderated].textContent = countModerated(filtered);
  els[DOM_IDS.unmoderated].textContent = countUnmoderated(filtered);
  els[DOM_IDS.totalPhotos].textContent = Object.keys(filtered).length;
}

function buildTopListItems(items) {
  if (!items.length) return '<li class="empty">No data for current filters</li>';
  return items
    .map(({ name, count }) => `<li><span class="item-name">${escapeHtml(name)}</span><span class="item-count">${count}</span></li>`)
    .join('');
}

function renderTopCollections(filtered) {
  const brandEl = getElement(DOM_IDS.topBrandsList);
  const labelEl = getElement(DOM_IDS.topLabelsList);
  if (!brandEl || !labelEl) return;
  brandEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'brand', 50));
  labelEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'label', 50));
}

/** Renders all filtered dashboard sections. */
async function renderFilteredView(filtered) {
  renderCards(filtered);
  renderTopCollections(filtered);
}
