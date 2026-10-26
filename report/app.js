const metricLabels = {
  firstContentfulPaint: 'FCP',
  largestContentfulPaint: 'LCP',
  speedIndex: 'Speed Index',
  performance: 'Performance'
};

const timeMetrics = new Set(['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex']);

function formatMetric(value, metric) {
  if (value == null) return '—';
  return timeMetrics.has(metric) ? `${(value / 1000).toFixed(2)} s` : `${value}/100`;
}

function statusBadge(status) {
  if (!status) return '<span class="badge">—</span>';
  const className = status === 'Bueno' ? 'good' : status === 'Por mejorar' ? 'warn' : 'bad';
  return `<span class="badge ${className}">${status}</span>`;
}

function renderSummary(runs) {
  const successful = runs.filter((run) => run.status === 'ok');
  const average = successful.length
    ? Math.round(successful.reduce((sum, run) => sum + (run.performance || 0), 0) / successful.length)
    : null;
  document.querySelector('#summary').innerHTML = [
    ['Ejecuciones', runs.length],
    ['Correctas', successful.length],
    ['Con error', runs.length - successful.length],
    ['Performance promedio', average == null ? '—' : `${average}/100`]
  ].map(([label, value]) => `<article class="card"><strong>${value}</strong><span>${label}</span></article>`).join('');
}

function renderResults(runs) {
  document.querySelector('#results').innerHTML = runs.slice().reverse().map((run) => `
    <tr>
      <td class="url">${run.url || '—'}</td>
      <td>${run.screenEmulation || '—'}</td>
      <td>${new Date(run.timestamp).toLocaleString('es-CO')}</td>
      <td>${formatMetric(run.firstContentfulPaint, 'firstContentfulPaint')}<br>${statusBadge(run.classification?.firstContentfulPaint)}</td>
      <td>${formatMetric(run.largestContentfulPaint, 'largestContentfulPaint')}<br>${statusBadge(run.classification?.largestContentfulPaint)}</td>
      <td>${formatMetric(run.speedIndex, 'speedIndex')}<br>${statusBadge(run.classification?.speedIndex)}</td>
      <td>${formatMetric(run.performance, 'performance')}<br>${statusBadge(run.classification?.performance)}</td>
      <td>${run.status === 'ok' ? statusBadge('Bueno') : `<span class="badge bad">Error</span><small>${run.error || ''}</small>`}</td>
    </tr>
  `).join('');
}

function renderComparisons(runs) {
  const groups = new Map();
  runs.forEach((run) => {
    const key = `${run.url} | ${run.screenEmulation}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  });

  document.querySelector('#comparisons').innerHTML = [...groups.entries()].map(([key, values]) => {
    const latest = values.at(-1);
    const previous = values.at(-2);
    if (!previous || latest.performance == null || previous.performance == null) {
      return `<p><strong>${key}</strong>: aún no hay dos ejecuciones comparables.</p>`;
    }
    const difference = latest.performance - previous.performance;
    const sign = difference >= 0 ? '+' : '';
    return `<p><strong>${key}</strong>: Performance ${sign}${difference} puntos frente a la ejecución anterior.</p>`;
  }).join('') || '<p>No hay datos para comparar.</p>';
}

fetch('../data/results.json')
  .then((response) => response.json())
  .then((runs) => {
    document.querySelector('#updated').textContent = `Última actualización: ${new Date().toLocaleString('es-CO')}`;
    renderSummary(runs);
    renderResults(runs);
    renderComparisons(runs);
  })
  .catch((error) => {
    document.querySelector('#updated').textContent = `No se pudo leer data/results.json: ${error.message}`;
  });
