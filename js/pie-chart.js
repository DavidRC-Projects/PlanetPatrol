/**
 * Pie chart for brands and labels distribution.
 * Implemented as lightweight SVG (no external chart library).
 */

const PIE_CHART_COLORS = [
  '#0f766e',
  '#15803d',
  '#0ea5e9',
  '#0284c7',
  '#0d9488',
  '#059669',
  '#2563eb',
  '#0891b2',
  '#1d4ed8',
  '#047857',
  '#0369a1',
  '#0c4a6e',
  '#164e63',
  '#1e40af',
  '#14532d',
  '#64748b'
];

const PIE_SLICE_LIMIT = 15;

function formatPieCount(n) {
  const num = Number(n) || 0;
  try {
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch (_) {
    return String(num);
  }
}

/** Creates SVG arc path for a pie slice. Angles in radians. */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const startX = cx + r * Math.cos(startAngle);
  const startY = cy + r * Math.sin(startAngle);
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

/** Renders pie chart into SVG element. items: { name, count }[] */
function renderPieChart(svgElement, items, options = {}) {
  if (!svgElement) return;

  const { showTooltip = true } = options;

  if (!items || !items.length) {
    svgElement.innerHTML = '';
    return false;
  }

  const total = items.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  if (total <= 0) {
    svgElement.innerHTML = '';
    return false;
  }

  const viewBoxW = 400;
  const viewBoxH = 400;
  const cx = viewBoxW / 2;
  const cy = viewBoxH / 2;
  const r = Math.min(cx, cy) * 0.85;

  let angle = -Math.PI / 2;
  const slices = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const count = Number(item.count) || 0;
    const ratio = count / total;
    const sliceAngle = ratio * 2 * Math.PI;
    const endAngle = angle + sliceAngle;
    const color = PIE_CHART_COLORS[i % PIE_CHART_COLORS.length];

    const pathD = describeArc(cx, cy, r, angle, endAngle);

    slices.push({
      pathD,
      color,
      name: String(item.name || ''),
      count,
      ratio,
      startAngle: angle,
      endAngle
    });

    angle = endAngle;
  }

  const pathEls = slices
    .map(
      (s, i) =>
        `<path class="pie-slice" data-index="${i}" d="${s.pathD}" fill="${s.color}" stroke="white" stroke-width="1.5" />`
    )
    .join('');

  svgElement.setAttribute('viewBox', `0 0 ${viewBoxW} ${viewBoxH}`);
  svgElement.innerHTML = pathEls;
  svgElement._pieState = { slices, showTooltip };
  return true;
}

function showPieTooltip(tooltipEl, text, clientX, clientY) {
  if (!tooltipEl) return;
  tooltipEl.textContent = text;
  tooltipEl.hidden = false;
  tooltipEl.classList.remove('hidden');
  const offset = 14;
  const rect = tooltipEl.getBoundingClientRect();
  const pad = 8;
  let left = clientX + offset;
  let top = clientY - 10;
  if (left + rect.width > window.innerWidth - pad) left = clientX - rect.width - offset;
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  if (top + rect.height > window.innerHeight - pad) top = clientY - rect.height - offset;
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hidePieTooltip(tooltipEl) {
  if (!tooltipEl) return;
  tooltipEl.hidden = true;
  tooltipEl.classList.add('hidden');
}

function renderPieChartLegend(legendEl, slices) {
  if (!legendEl) return;
  if (!slices || !slices.length) {
    legendEl.innerHTML = '';
    return;
  }
  const html = slices
    .map(
      (s) =>
        `<span class="pie-chart-legend-item"><span class="pie-chart-legend-swatch" style="background:${s.color}"></span><span>${escapeHtml(s.name)}: ${formatPieCount(s.count)}</span></span>`
    )
    .join('');
  legendEl.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function ensurePieChartInteractivity(svg, tooltipEl) {
  if (!svg || svg.dataset.pieBound === '1') return;
  svg.dataset.pieBound = '1';

  svg.addEventListener('mouseleave', () => {
    hidePieTooltip(tooltipEl);
    const paths = svg.querySelectorAll('.pie-slice');
    paths.forEach((p) => p.removeAttribute('opacity'));
  });

  svg.addEventListener('mousemove', (event) => {
    const state = svg._pieState;
    if (!state || !state.slices || !state.showTooltip) return;

    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const viewBox = svg.viewBox.baseVal;
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;
    const svgX = (event.clientX - rect.left) * scaleX;
    const svgY = (event.clientY - rect.top) * scaleY;

    const cx = viewBox.width / 2;
    const cy = viewBox.height / 2;
    const dx = svgX - cx;
    const dy = svgY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) + Math.PI / 2;
    const normalizedAngle = angle < 0 ? angle + 2 * Math.PI : angle;

    const rMax = (viewBox.width / 2) * 0.85;
    let hoveredIndex = -1;
    for (let i = 0; i < state.slices.length; i++) {
      const s = state.slices[i];
      let start = s.startAngle < 0 ? s.startAngle + 2 * Math.PI : s.startAngle;
      let end = s.endAngle < 0 ? s.endAngle + 2 * Math.PI : s.endAngle;
      const inSlice =
        start <= end
          ? normalizedAngle >= start && normalizedAngle <= end
          : normalizedAngle >= start || normalizedAngle <= end;
      if (inSlice && dist <= rMax) {
        hoveredIndex = i;
        break;
      }
    }

    const paths = svg.querySelectorAll('.pie-slice');
    paths.forEach((p, i) => {
      p.setAttribute('opacity', i === hoveredIndex ? '1' : '0.7');
    });

    if (hoveredIndex >= 0 && tooltipEl) {
      const s = state.slices[hoveredIndex];
      const pct = ((s.ratio * 100) | 0) + (s.ratio * 100 % 1 >= 0.5 ? 1 : 0);
      const text = `${s.name}: ${formatPieCount(s.count)} (${pct}%)`;
      showPieTooltip(tooltipEl, text, event.clientX, event.clientY);
    } else {
      hidePieTooltip(tooltipEl);
    }
  });
}

/** Opens the pie chart modal with brands or labels data. */
function openPieChartModal(type) {
  const modal = getElement(DOM_IDS.pieChartModal);
  const titleEl = getElement(DOM_IDS.pieChartModalTitle);
  const svgEl = getElement(DOM_IDS.pieChartSvg);
  const emptyEl = getElement(DOM_IDS.pieChartEmpty);
  const tooltipEl = getElement(DOM_IDS.pieChartTooltip);
  const legendEl = getElement(DOM_IDS.pieChartLegend);

  if (!modal || !titleEl || !svgEl || !emptyEl) return;

  const isBrand = type === 'brand';
  titleEl.textContent = isBrand ? 'Brands distribution' : 'Labels distribution';

  const filtered = (typeof appState !== 'undefined' && appState?.filteredPhotos) || {};
  const allItems = topCategoryTotals(filtered, type, 100);
  const items =
    allItems.length <= PIE_SLICE_LIMIT
      ? allItems
      : [
          ...allItems.slice(0, PIE_SLICE_LIMIT - 1),
          {
            name: 'Other',
            count: allItems.slice(PIE_SLICE_LIMIT - 1).reduce((s, i) => s + (Number(i.count) || 0), 0)
          }
        ].filter((i) => (Number(i.count) || 0) > 0);

  const hasData = renderPieChart(svgEl, items, { showTooltip: true });

  if (hasData) {
    emptyEl.hidden = true;
    emptyEl.classList.add('hidden');
    svgEl.hidden = false;
    svgEl.classList.remove('hidden');
    renderPieChartLegend(legendEl, svgEl._pieState?.slices);
    legendEl.hidden = false;
    ensurePieChartInteractivity(svgEl, tooltipEl);
  } else {
    emptyEl.hidden = false;
    emptyEl.classList.remove('hidden');
    svgEl.hidden = true;
    svgEl.classList.add('hidden');
    if (legendEl) legendEl.hidden = true;
  }

  modal.hidden = false;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const closeBtn = getElement(DOM_IDS.pieChartModalClose);
  if (closeBtn) closeBtn.focus();
}

function bindPieChartModals() {
  const brandsBtn = getElement(DOM_IDS.pieChartBrandsBtn);
  const labelsBtn = getElement(DOM_IDS.pieChartLabelsBtn);
  const modal = getElement(DOM_IDS.pieChartModal);
  const closeBtn = getElement(DOM_IDS.pieChartModalClose);

  if (!brandsBtn || !labelsBtn || !modal || !closeBtn || modal.dataset.bound === '1') return;

  let lastFocused = null;

  const closeModal = () => {
    modal.hidden = true;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    hidePieTooltip(getElement(DOM_IDS.pieChartTooltip));
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  };

  const handleOpen = (type) => (event) => {
    lastFocused = document.activeElement;
    openPieChartModal(type);
  };

  brandsBtn.addEventListener('click', handleOpen('brand'));
  labelsBtn.addEventListener('click', handleOpen('label'));
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  modal.dataset.bound = '1';
}
