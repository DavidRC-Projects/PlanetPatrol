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
  const brandEl = getElement(DOM_IDS.topBrandsList);
  const labelEl = getElement(DOM_IDS.topLabelsList);
  if (!brandEl || !labelEl) return;
  brandEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'brand', 50));
  labelEl.innerHTML = buildTopListItems(topCategoryTotals(filtered, 'label', 50));
}

function renderMissionLeaderboard(missions) {
  const tableEl = getElement(DOM_IDS.topMissionsList);
  if (!tableEl) return;
  const items = topMissionTotals(missions, 20);
  tableEl.innerHTML = buildMissionTableRows(items);

  const summaryEl = getElement(DOM_IDS.topMissionsSummary);
  if (summaryEl) summaryEl.innerHTML = buildMissionSummary(items);
}

/** Renders all filtered dashboard sections. */
async function renderFilteredView(filtered, filters, missions) {
  renderCards(filtered);
  renderTimeSeries(filtered, filters);
  renderMissionLeaderboard(missions);
  renderTopCollections(filtered);
}
