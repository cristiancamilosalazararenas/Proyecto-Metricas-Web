const TIMEZONE = 'America/Bogota';
const classificationThresholds = window.module.exports.thresholds;

const metricLabels = {
  firstContentfulPaint: 'FCP',
  largestContentfulPaint: 'LCP',
  speedIndex: 'Speed Index',
  performance: 'Performance'
};
const timeMetrics = new Set(['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex']);
const badgeStyles = {
  Bueno: { className: 'good', icon: '✔' },
  'Por mejorar': { className: 'warn', icon: '▲' },
  Deficiente: { className: 'bad', icon: '✖' }
};

let allRuns = [];
let allJobRuns = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'medium' });
}

function formatMetric(value, metric) {
  if (value == null) return '—';
  return timeMetrics.has(metric) ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)}/100`;
}

function badge(classification) {
  const style = badgeStyles[classification];
  if (!style) return '<span class="badge">—</span>';
  return `<span class="badge ${style.className}">${style.icon} ${classification}</span>`;
}

function classify(metric, value) {
  if (value == null) return null;
  const range = classificationThresholds[metric];
  if (metric === 'performance') {
    if (value >= range.goodMin) return 'Bueno';
    if (value >= range.needsImprovementMin) return 'Por mejorar';
    return 'Deficiente';
  }
  if (value <= range.goodMax) return 'Bueno';
  if (value <= range.needsImprovementMax) return 'Por mejorar';
  return 'Deficiente';
}

function metricCell(run, metric) {
  const classification = run.classification?.[metric] || classify(metric, run[metric]);
  return `${formatMetric(run[metric], metric)}<br>${badge(classification)}`;
}

const pageKey = (run) => run.pageId || run.url;
const pageLabel = (run) => run.pageName || run.url || '—';
const deviceLabel = (run) => run.screenEmulation || '—';
const jobLabel = (run) => run.job || 'sin registro';
const average = (list, field) => list.reduce((sum, item) => sum + item[field], 0) / list.length;

function groupBy(list, keyFn) {
  const groups = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return groups;
}

function filteredRuns() {
  const page = document.querySelector('#filter-page').value;
  const device = document.querySelector('#filter-device').value;
  const job = document.querySelector('#filter-job').value;
  return allRuns.filter((run) =>
    (!page || pageKey(run) === page) &&
    (!device || deviceLabel(run) === device) &&
    (!job || jobLabel(run) === job)
  );
}

function fillFilter(selector, entries) {
  const select = document.querySelector(selector);
  entries.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  select.addEventListener('change', render);
}

function renderSummary(runs) {
  const successful = runs.filter((run) => run.status === 'ok');
  const avg = successful.length ? Math.round(average(successful, 'performance')) : null;
  const last = runs.at(-1);
  document.querySelector('#summary').innerHTML = [
    ['Mediciones', runs.length],
    ['Correctas', successful.length],
    ['Con error', runs.length - successful.length],
    ['Performance promedio', avg == null ? '—' : `${avg}/100 ${badge(classify('performance', avg))}`],
    ['Última medición', last ? formatDate(last.timestamp) : '—']
  ].map(([label, value]) => `<article class="card"><strong>${value}</strong><span>${label}</span></article>`).join('');
}

function renderCurrent(runs) {
  const groups = groupBy(runs.filter((run) => run.status === 'ok'), (run) => `${pageKey(run)}|${deviceLabel(run)}`);
  document.querySelector('#current').innerHTML = [...groups.values()].map((group) => {
    const latest = group.at(-1);
    const avg = Math.round(average(group, 'performance'));
    return `<tr>
      <td><strong>${escapeHtml(pageLabel(latest))}</strong><br><a href="${escapeHtml(latest.url)}" target="_blank" rel="noopener">${escapeHtml(latest.url)}</a></td>
      <td>${escapeHtml(latest.owner || '—')}</td>
      <td>${escapeHtml(deviceLabel(latest))}</td>
      <td>${formatDate(latest.timestamp)}<br><small class="muted">${escapeHtml(jobLabel(latest))}</small></td>
      <td>${metricCell(latest, 'firstContentfulPaint')}</td>
      <td>${metricCell(latest, 'largestContentfulPaint')}</td>
      <td>${metricCell(latest, 'speedIndex')}</td>
      <td>${metricCell(latest, 'performance')}</td>
      <td>${avg}/100<br>${badge(classify('performance', avg))}</td>
      <td>${group.length}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="10">No hay mediciones correctas con estos filtros.</td></tr>';
}

function renderBestWorst(runs) {
  const groups = [...groupBy(runs.filter((run) => run.status === 'ok'), (run) => `${pageKey(run)}|${deviceLabel(run)}`).values()]
    .map((group) => ({ run: group.at(-1), avg: average(group, 'performance'), count: group.length }))
    .sort((a, b) => b.avg - a.avg);
  const container = document.querySelector('#best-worst');
  if (groups.length === 0) {
    container.innerHTML = '<p>No hay datos.</p>';
    return;
  }
  const describe = ({ run, avg, count }) =>
    `${escapeHtml(pageLabel(run))} · ${escapeHtml(deviceLabel(run))}: <strong>${Math.round(avg)}/100</strong> ${badge(classify('performance', avg))} <span class="muted">(${count} mediciones)</span>`;
  const ok = runs.filter((run) => run.status === 'ok');
  const bestRun = ok.reduce((best, run) => (run.performance > best.performance ? run : best), ok[0]);
  const worstRun = ok.reduce((worst, run) => (run.performance < worst.performance ? run : worst), ok[0]);
  const slowestLcp = ok.reduce((slow, run) => (run.largestContentfulPaint > slow.largestContentfulPaint ? run : slow), ok[0]);
  container.innerHTML = `
    <p class="highlight good-text">▲ Mejor promedio — ${describe(groups[0])}</p>
    <p class="highlight bad-text">▼ Peor promedio — ${describe(groups.at(-1))}</p>
    <ul>
      <li>Mejor medición individual: ${escapeHtml(pageLabel(bestRun))} · ${escapeHtml(deviceLabel(bestRun))} con ${bestRun.performance}/100 (${formatDate(bestRun.timestamp)}).</li>
      <li>Peor medición individual: ${escapeHtml(pageLabel(worstRun))} · ${escapeHtml(deviceLabel(worstRun))} con ${worstRun.performance}/100 (${formatDate(worstRun.timestamp)}).</li>
      <li>LCP más lento: ${escapeHtml(pageLabel(slowestLcp))} · ${escapeHtml(deviceLabel(slowestLcp))} con ${formatMetric(slowestLcp.largestContentfulPaint, 'largestContentfulPaint')}.</li>
    </ul>`;
}

function renderDevices(runs) {
  const ok = runs.filter((run) => run.status === 'ok');
  const rows = [...groupBy(ok, pageKey).values()].map((group) => {
    const mobile = group.filter((run) => (run.deviceId || '').startsWith('mobile') || /moto|mobile|móvil/i.test(deviceLabel(run)));
    const desktop = group.filter((run) => !mobile.includes(run));
    if (!mobile.length || !desktop.length) {
      return `<li>${escapeHtml(pageLabel(group[0]))}: faltan mediciones de ${mobile.length ? 'escritorio' : 'móvil'} para comparar.</li>`;
    }
    const mobileAvg = Math.round(average(mobile, 'performance'));
    const desktopAvg = Math.round(average(desktop, 'performance'));
    const diff = desktopAvg - mobileAvg;
    const better = diff > 0 ? 'escritorio' : diff < 0 ? 'móvil' : 'ninguno';
    return `<li><strong>${escapeHtml(pageLabel(group[0]))}</strong>: móvil ${mobileAvg}/100 · escritorio ${desktopAvg}/100 → ${diff === 0 ? 'sin diferencia' : `${better} rinde ${Math.abs(diff)} puntos más`}.
      <span class="muted">LCP promedio: móvil ${formatMetric(average(mobile, 'largestContentfulPaint'), 'largestContentfulPaint')} · escritorio ${formatMetric(average(desktop, 'largestContentfulPaint'), 'largestContentfulPaint')}</span></li>`;
  });
  document.querySelector('#devices').innerHTML = rows.length ? `<ul>${rows.join('')}</ul>` : '<p>No hay datos.</p>';
}

function renderComparisons(runs) {
  const groups = groupBy(runs.filter((run) => run.status === 'ok'), (run) => `${pageKey(run)}|${deviceLabel(run)}`);
  document.querySelector('#comparisons').innerHTML = `<ul>${[...groups.values()].map((group) => {
    const latest = group.at(-1);
    const previous = group.at(-2);
    const name = `<strong>${escapeHtml(pageLabel(latest))} · ${escapeHtml(deviceLabel(latest))}</strong>`;
    if (!previous) return `<li>${name}: aún no hay dos ejecuciones comparables.</li>`;
    const perfDiff = latest.performance - previous.performance;
    const lcpDiff = (latest.largestContentfulPaint - previous.largestContentfulPaint) / 1000;
    const trend = perfDiff > 0 ? '<span class="good-text">▲ mejora</span>' : perfDiff < 0 ? '<span class="bad-text">▼ empeora</span>' : '= se mantiene';
    return `<li>${name}: Performance ${previous.performance} → ${latest.performance} (${perfDiff >= 0 ? '+' : ''}${perfDiff}) ${trend}; LCP ${lcpDiff >= 0 ? '+' : ''}${lcpDiff.toFixed(2)} s.</li>`;
  }).join('')}</ul>`;
}

function renderRecommendations(runs) {
  const ok = runs.filter((run) => run.status === 'ok');
  const cards = [...groupBy(ok, pageKey).values()].map((group) => {
    const withOpportunities = group.filter((run) => run.opportunities?.length);
    const latest = withOpportunities.at(-1);
    const weakMetrics = Object.keys(metricLabels)
      .filter((metric) => {
        const lastRun = group.at(-1);
        const classification = lastRun.classification?.[metric] || classify(metric, lastRun[metric]);
        return classification && classification !== 'Bueno';
      })
      .map((metric) => metricLabels[metric]);
    const opportunities = latest
      ? `<ol>${latest.opportunities.map((item) => `<li>${escapeHtml(item.title)} <span class="muted">(ahorro estimado ${(item.savingsMs / 1000).toFixed(2)} s, ${escapeHtml(deviceLabel(latest))})</span></li>`).join('')}</ol>`
      : '<p class="muted">Aún no hay oportunidades registradas para esta página; aparecerán en la próxima ejecución.</p>';
    return `<article class="panel">
      <h3>${escapeHtml(pageLabel(group[0]))}</h3>
      <p class="muted">${escapeHtml(group[0].owner || '')}</p>
      <p>Métricas a mejorar en la última medición: ${weakMetrics.length ? weakMetrics.join(', ') : 'ninguna, todas en Bueno'}.</p>
      ${opportunities}
    </article>`;
  });
  document.querySelector('#recommendations').innerHTML = cards.join('') || '<p>No hay datos.</p>';
}

function renderJobRuns() {
  const job = document.querySelector('#filter-job').value;
  const runs = allJobRuns.filter((run) => !job || run.job === job);
  document.querySelector('#job-runs').innerHTML = runs.slice().reverse().map((run) => `
    <tr>
      <td>${escapeHtml(run.job)}</td>
      <td>${escapeHtml(run.trigger)}</td>
      <td>${formatDate(run.startedAt)}</td>
      <td>${Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000)} s</td>
      <td>${escapeHtml((run.pages || []).join(', '))}</td>
      <td>${escapeHtml((run.devices || []).join(', '))}</td>
      <td>${run.recordsAdded}</td>
      <td>${run.status === 'ok' ? '<span class="badge good">✔ OK</span>' : '<span class="badge bad">✖ Con fallos</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="8">Todavía no hay ejecuciones de jobs registradas.</td></tr>';
}

function renderErrors(runs) {
  const errors = runs.filter((run) => run.status !== 'ok');
  document.querySelector('#errors').innerHTML = errors.length
    ? `<ul>${errors.map((run) => `<li><span class="badge bad">✖ Error</span> ${formatDate(run.timestamp)} · ${escapeHtml(pageLabel(run))} · ${escapeHtml(deviceLabel(run))} · ${escapeHtml(jobLabel(run))}<br><small>${escapeHtml(run.error)}</small></li>`).join('')}</ul>`
    : '<p><span class="badge good">✔</span> No se han registrado errores con estos filtros.</p>';
}

function renderResults(runs) {
  document.querySelector('#results').innerHTML = runs.slice().reverse().map((run) => `
    <tr>
      <td>${formatDate(run.timestamp)}</td>
      <td>${escapeHtml(pageLabel(run))}<br><small class="muted">${escapeHtml(run.owner || '')}</small></td>
      <td>${escapeHtml(deviceLabel(run))}</td>
      <td>${escapeHtml(jobLabel(run))}</td>
      <td>${metricCell(run, 'firstContentfulPaint')}</td>
      <td>${metricCell(run, 'largestContentfulPaint')}</td>
      <td>${metricCell(run, 'speedIndex')}</td>
      <td>${metricCell(run, 'performance')}</td>
      <td>${run.status === 'ok' ? '<span class="badge good">✔ OK</span>' : `<span class="badge bad">✖ Error</span><small>${escapeHtml(run.error)}</small>`}</td>
    </tr>
  `).join('') || '<tr><td colspan="9">No hay mediciones con estos filtros.</td></tr>';
}

function renderThresholds() {
  const rows = ['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex'].map((metric) => {
    const { goodMax, needsImprovementMax } = classificationThresholds[metric];
    return `<tr><td>${metricLabels[metric]}</td><td>≤ ${goodMax / 1000} s</td><td>&gt; ${goodMax / 1000} s y ≤ ${needsImprovementMax / 1000} s</td><td>&gt; ${needsImprovementMax / 1000} s</td></tr>`;
  });
  const { goodMin, needsImprovementMin } = classificationThresholds.performance;
  rows.push(`<tr><td>Performance</td><td>${goodMin}–100</td><td>${needsImprovementMin}–${goodMin - 1}</td><td>0–${needsImprovementMin - 1}</td></tr>`);
  document.querySelector('#thresholds').innerHTML = rows.join('');
}

function render() {
  const runs = filteredRuns();
  renderSummary(runs);
  renderCurrent(runs);
  renderBestWorst(runs);
  renderDevices(runs);
  renderComparisons(runs);
  renderRecommendations(runs);
  renderJobRuns();
  renderErrors(runs);
  renderResults(runs);
}

Promise.all([
  fetch('../data/results.json').then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }),
  fetch('../data/job-runs.json').then((response) => (response.ok ? response.json() : [])).catch(() => [])
])
  .then(([runs, jobRuns]) => {
    allRuns = runs;
    allJobRuns = jobRuns;
    fillFilter('#filter-page', [...new Map(runs.map((run) => [pageKey(run), pageLabel(run)])).entries()]);
    fillFilter('#filter-device', [...new Set(runs.map(deviceLabel))].map((device) => [device, device]));
    fillFilter('#filter-job', [...new Set([...runs.map(jobLabel), ...jobRuns.map((run) => run.job)])].map((job) => [job, job]));
    document.querySelector('#updated').textContent =
      `Datos de data/results.json · ${runs.length} mediciones · última el ${formatDate(runs.at(-1)?.timestamp)} (hora de Bogotá)`;
    renderThresholds();
    render();
  })
  .catch((error) => {
    document.querySelector('#updated').textContent =
      `No se pudo leer data/results.json (${error.message}). Abra el informe con "npm run report".`;
  });
