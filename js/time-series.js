/**
 * Time series chart: total litter pieces collected over time, derived from the filtered photo set.
 * Implemented as lightweight SVG (no external chart library).
 */

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCompactNumber(n) {
  const num = Number(n) || 0;
  if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(num));
}

function monthShortName(monthIndex) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthIndex] || '';
}

function chooseTimeGranularity(filters) {
  const year = String(filters?.year || '').trim();
  const month = String(filters?.month || '').trim();
  if (year && month) return 'day';
  if (year) return 'month';
  return 'year';
}

function bucketKey(d, granularity) {
  if (!d) return '';
  const y = d.getFullYear();
  if (granularity === 'year') return String(y);
  const m = pad2(d.getMonth() + 1);
  if (granularity === 'month') return `${y}-${m}`;
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function parseBucketKeyToDate(key, granularity) {
  const parts = String(key || '').split('-').map((p) => parseInt(p, 10));
  if (granularity === 'year') {
    const y = parts[0];
    return Number.isFinite(y) ? new Date(y, 0, 1) : null;
  }
  if (granularity === 'month') {
    const [y, m] = parts;
    if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
    return new Date(y, Math.max(0, m - 1), 1);
  }
  const [y, m, d] = parts;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, Math.max(0, m - 1), Math.max(1, d));
}

function formatTickLabel(point, granularity) {
  const d = point?.date;
  if (!d) return point?.key || '';
  if (granularity === 'year') return String(d.getFullYear());
  if (granularity === 'month') return monthShortName(d.getMonth());
  return String(d.getDate());
}

function formatTooltipLabel(point, granularity) {
  const d = point?.date;
  if (!d) return point?.key || '';
  if (granularity === 'year') return String(d.getFullYear());
  if (granularity === 'month') return `${monthShortName(d.getMonth())} ${d.getFullYear()}`;
  return `${monthShortName(d.getMonth())} ${d.getDate()}, ${d.getFullYear()}`;
}

function niceCeilStep(maxValue, targetTicks) {
  const v = Math.max(1, Number(maxValue) || 1);
  const ticks = Math.max(2, Number(targetTicks) || 5);
  const raw = v / (ticks - 1);
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const frac = raw / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

function smoothPathD(points) {
  // Catmull-Rom to Bezier-ish smoothing.
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  const d = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
}

function buildTimeSeriesPoints(filtered, filters) {
  filtered = filtered || {};
  const granularity = chooseTimeGranularity(filters);
  const byKey = new Map();

  for (const id of Object.keys(filtered)) {
    const photo = filtered[id];
    const d = getPhotoDate(photo);
    if (!d) continue;
    // Exclude Unix epoch fallbacks that usually indicate missing/invalid timestamps.
    if (d.getFullYear() === 1970) continue;
    const key = bucketKey(d, granularity);
    if (!key) continue;
    const current = byKey.get(key) || { key, pieces: 0, photos: 0 };
    current.pieces += getPieces(photo);
    current.photos += 1;
    byKey.set(key, current);
  }

  const points = [...byKey.values()]
    .map((row) => ({ ...row, date: parseBucketKeyToDate(row.key, granularity) }))
    .filter((row) => row.date)
    .sort((a, b) => a.date - b.date);
  return { granularity, points };
}

function setChartEmptyState({ isEmpty, chart, emptyEl }) {
  if (chart) {
    chart.classList.toggle('hidden', isEmpty);
    chart.hidden = isEmpty;
    chart.setAttribute('aria-hidden', String(isEmpty));
  }
  if (emptyEl) {
    emptyEl.classList.toggle('hidden', !isEmpty);
    emptyEl.hidden = !isEmpty;
    emptyEl.setAttribute('aria-hidden', String(!isEmpty));
  }
}

function hideTooltip(tooltip) {
  tooltip = tooltip || getElement(DOM_IDS.timeSeriesTooltip);
  if (!tooltip) return;
  tooltip.hidden = true;
  tooltip.classList.add('hidden');
  tooltip.innerHTML = '';
}

function showTooltipAt({ left, top, contentHtml, tooltip }) {
  if (!tooltip) return;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.innerHTML = contentHtml;
  tooltip.hidden = false;
  tooltip.classList.remove('hidden');
}

function clientPointToSvg(svg, clientX, clientY) {
  if (!svg || typeof svg.getScreenCTM !== 'function') return null;
  const ctm = svg.getScreenCTM();
  if (!ctm || typeof DOMPoint !== 'function') return null;
  try {
    return new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  } catch (_) {
    return null;
  }
}

function svgPointToClient(svg, x, y) {
  if (!svg || typeof svg.getScreenCTM !== 'function') return null;
  const ctm = svg.getScreenCTM();
  if (!ctm || typeof DOMPoint !== 'function') return null;
  return new DOMPoint(x, y).matrixTransform(ctm);
}

function ensureTimeSeriesInteractivity(svg, tooltip) {
  if (!svg || svg.dataset.tsBound === '1') return;
  svg.dataset.tsBound = '1';

  svg.addEventListener('mouseleave', () => {
    hideTooltip(tooltip);
    const hoverLine = svg.querySelector('.ts-hover-line');
    const hoverPoint = svg.querySelector('.ts-hover-point');
    if (hoverLine) hoverLine.setAttribute('opacity', '0');
    if (hoverPoint) hoverPoint.setAttribute('opacity', '0');
  });

  svg.addEventListener('mousemove', (event) => {
    const state = svg._tsState;
    if (!state || !state.points || !state.points.length) return;
    const svgPoint = clientPointToSvg(svg, event.clientX, event.clientY);
    const xInViewBox = Math.min(Math.max(0, Number(svgPoint?.x) || 0), state.W);

    // Find nearest point by x.
    let nearest = state.points[0];
    let bestDist = Infinity;
    for (const p of state.points) {
      const dist = Math.abs(p.x - xInViewBox);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = p;
      }
    }

    const hoverLine = svg.querySelector('.ts-hover-line');
    const hoverPoint = svg.querySelector('.ts-hover-point');
    if (hoverLine) {
      hoverLine.setAttribute('x1', String(nearest.x));
      hoverLine.setAttribute('x2', String(nearest.x));
      hoverLine.setAttribute('opacity', '1');
    }
    if (hoverPoint) {
      hoverPoint.setAttribute('cx', String(nearest.x));
      hoverPoint.setAttribute('cy', String(nearest.y));
      hoverPoint.setAttribute('opacity', '1');
    }

    // Position tooltip inside the wrapper.
    const wrapper = svg.parentElement;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const nearestClient = svgPointToClient(svg, nearest.x, nearest.y);
    const tooltipX = Number(nearestClient?.x) - wrapperRect.left;
    const tooltipY = Number(nearestClient?.y) - wrapperRect.top;

    const title = escapeHtml(nearest.tooltipLabel);
    const pieces = escapeHtml(formatNumber(nearest.pieces));
    const photos = escapeHtml(formatNumber(nearest.photos));
    const content = `<div class="ts-tooltip-title">${title}</div><div><strong>${pieces}</strong> pieces</div><div class="ts-tooltip-sub">${photos} photos</div>`;

    // Keep tooltip within bounds.
    const left = Math.min(Math.max(8, tooltipX + 12), wrapperRect.width - 180);
    const top = Math.min(Math.max(8, tooltipY - 50), wrapperRect.height - 70);
    showTooltipAt({ left, top, contentHtml: content, tooltip });
  });
}

function renderTimeSeriesInto({ svg, emptyEl, tooltip, subtitleEl, points, granularity }) {
  if (!svg) return;
  ensureTimeSeriesInteractivity(svg, tooltip);
  if (!points.length) {
    if (subtitleEl) subtitleEl.textContent = '';
    svg.innerHTML = '';
    svg.setAttribute('aria-label', 'Collected over time (no data for current filters).');
    hideTooltip(tooltip);
    setChartEmptyState({ isEmpty: true, chart: svg, emptyEl });
    return;
  }
  setChartEmptyState({ isEmpty: false, chart: svg, emptyEl });

  const bucketLabel =
    granularity === 'day' ? 'day' :
      granularity === 'month' ? 'month' :
        'year';
  if (subtitleEl) subtitleEl.textContent = '';
  svg.setAttribute('aria-label', `Collected over time (grouped by ${bucketLabel}).`);

  const W = 900;
  const H = 280;
  const pad = { l: 52, r: 16, t: 16, b: 40 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const maxY = Math.max(1, ...points.map((p) => p.pieces));
  const step = niceCeilStep(maxY, 5);
  const niceMaxY = Math.ceil(maxY / step) * step;

  const xForIndex = (i) => {
    if (points.length <= 1) return pad.l + plotW / 2;
    return pad.l + (i / (points.length - 1)) * plotW;
  };
  const yForValue = (v) => {
    const clamped = Math.max(0, Number(v) || 0);
    const t = clamped / niceMaxY;
    return pad.t + (1 - t) * plotH;
  };

  const yTicks = [];
  for (let v = 0; v <= niceMaxY + 0.0001; v += step) yTicks.push(v);

  const gridLines = yTicks
    .map((v) => {
      const y = yForValue(v);
      return `<line class="ts-grid" x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" />`;
    })
    .join('');

  const yLabels = yTicks
    .map((v) => {
      const y = yForValue(v);
      return `<text class="ts-axis" x="${pad.l - 10}" y="${y + 4}" text-anchor="end">${escapeHtml(formatCompactNumber(v))}</text>`;
    })
    .join('');

  const xy = points.map((p, i) => ({
    x: Number(xForIndex(i).toFixed(2)),
    y: Number(yForValue(p.pieces).toFixed(2)),
    pieces: p.pieces,
    photos: p.photos,
    tickLabel: formatTickLabel(p, granularity),
    tooltipLabel: formatTooltipLabel(p, granularity)
  }));
  const linePath = smoothPathD(xy);

  const areaPath = `${linePath} L ${(pad.l + plotW).toFixed(2)} ${(pad.t + plotH).toFixed(2)} L ${pad.l.toFixed(2)} ${(pad.t + plotH).toFixed(2)} Z`;

  const maxXTicks = granularity === 'day' ? 8 : 6;
  const tickEvery = Math.max(1, Math.ceil(points.length / maxXTicks));
  const xTicks = xy
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i === 0 || i === xy.length - 1 || i % tickEvery === 0)
    .map(({ p }) => `<text class="ts-axis" x="${p.x}" y="${pad.t + plotH + 22}" text-anchor="middle">${escapeHtml(p.tickLabel)}</text>`)
    .join('');

  const latest = xy[xy.length - 1];
  const markerLatest = latest
    ? `<circle class="ts-point ts-point--latest" cx="${latest.x}" cy="${latest.y}" r="4.2"></circle>`
    : '';

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg._tsState = { W, H, pad, points: xy };
  svg.innerHTML = `
    <defs>
      <linearGradient id="tsGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(14, 165, 233, 0.22)"></stop>
        <stop offset="100%" stop-color="rgba(14, 165, 233, 0.03)"></stop>
      </linearGradient>
    </defs>
    <rect class="ts-bg" x="0" y="0" width="${W}" height="${H}" rx="12" ry="12"></rect>
    ${gridLines}
    ${yLabels}
    <path class="ts-area" d="${areaPath}"></path>
    <path class="ts-line" d="${linePath}"></path>
    ${markerLatest}
    <line class="ts-hover-line" x1="${latest?.x || 0}" y1="${pad.t}" x2="${latest?.x || 0}" y2="${pad.t + plotH}" opacity="0"></line>
    <circle class="ts-hover-point ts-point" cx="${latest?.x || 0}" cy="${latest?.y || 0}" r="4" opacity="0"></circle>
    ${xTicks}
  `.trim();
}

function renderTimeSeries(filtered, filters) {
  const subtitleEl = getElement(DOM_IDS.timeSeriesSubtitle);
  const primarySvg = getElement(DOM_IDS.timeSeriesChart);
  const primaryEmptyEl = getElement(DOM_IDS.timeSeriesEmpty);
  const primaryTooltip = getElement(DOM_IDS.timeSeriesTooltip);
  const modalSvg = getElement(DOM_IDS.timeSeriesChartModal);
  const modalEmptyEl = getElement(DOM_IDS.timeSeriesEmptyModal);
  const modalTooltip = getElement(DOM_IDS.timeSeriesTooltipModal);

  if (!primarySvg) return;
  const { granularity, points } = buildTimeSeriesPoints(filtered, filters);
  renderTimeSeriesInto({
    svg: primarySvg,
    emptyEl: primaryEmptyEl,
    tooltip: primaryTooltip,
    subtitleEl,
    points,
    granularity
  });
  renderTimeSeriesInto({
    svg: modalSvg,
    emptyEl: modalEmptyEl,
    tooltip: modalTooltip,
    subtitleEl: null,
    points,
    granularity
  });
}

function bindTimeSeriesModal() {
  const chart = getElement(DOM_IDS.timeSeriesChart);
  const modal = getElement(DOM_IDS.timeSeriesModal);
  const closeBtn = getElement(DOM_IDS.timeSeriesModalClose);
  if (!chart || !modal || !closeBtn || modal.dataset.bound === '1') return;

  let lastFocused = null;
  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    hideTooltip(getElement(DOM_IDS.timeSeriesTooltipModal));
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

  chart.addEventListener('click', openModal);
  chart.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openModal();
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
