// Genera spreadsheet/metricas-web.xlsx a partir de data/results.json y
// data/job-runs.json. scripts/run-audit.js lo llama al terminar cada job;
// también se puede ejecutar a mano con `npm run spreadsheet`.
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const pages = require('../config/pages');
const devices = require('../config/devices');
const { thresholds } = require('../config/thresholds');
const { projectRoot, resultsPath, jobRunsPath, withFileLock, readJsonArray } = require('./lib/history');

const outputPath = path.join(projectRoot, 'spreadsheet', 'metricas-web.xlsx');
const TIMEZONE = 'America/Bogota';

// Etiqueta con símbolo para no depender solo del color.
const LABELS = {
  Bueno: { text: '✔ Bueno', fill: 'FFC6F6D5', font: 'FF22543D' },
  'Por mejorar': { text: '▲ Por mejorar', fill: 'FFFEEBC8', font: 'FF7B341E' },
  Deficiente: { text: '✖ Deficiente', fill: 'FFFED7D7', font: 'FF822727' }
};
const ERROR_STYLE = { fill: 'FFFED7D7', font: 'FF822727' };
const HEADER_FILL = 'FF172033';

const timeMetrics = ['firstContentfulPaint', 'largestContentfulPaint', 'speedIndex'];

function bogotaDate(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const seconds = (ms) => (ms == null ? null : Math.round(ms / 10) / 100);
const pageFor = (run) => pages.find((page) => page.id === run.pageId || page.url === run.url);
const deviceFor = (run) =>
  Object.values(devices).find((device) => device.id === run.deviceId || device.screenEmulation === run.screenEmulation);

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function paint(cell, style) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
  cell.font = { bold: true, color: { argb: style.font } };
}

function labelCell(cell, classification) {
  const label = LABELS[classification];
  if (!label) {
    cell.value = '—';
    return;
  }
  cell.value = label.text;
  paint(cell, label);
}

function addSummarySheet(workbook, runs, lastJobRun) {
  const sheet = workbook.addWorksheet('Resumen');
  sheet.columns = [
    { header: 'Página', key: 'page', width: 26 },
    { header: 'Responsable', key: 'owner', width: 30 },
    { header: 'Dispositivo', key: 'device', width: 22 },
    { header: 'Última medición (Bogotá)', key: 'date', width: 22 },
    { header: 'Job', key: 'job', width: 20 },
    { header: 'FCP (s)', key: 'fcp', width: 10 },
    { header: 'Clasif. FCP', key: 'fcpLabel', width: 15 },
    { header: 'LCP (s)', key: 'lcp', width: 10 },
    { header: 'Clasif. LCP', key: 'lcpLabel', width: 15 },
    { header: 'Speed Index (s)', key: 'si', width: 14 },
    { header: 'Clasif. SI', key: 'siLabel', width: 15 },
    { header: 'Performance', key: 'perf', width: 13 },
    { header: 'Clasif. Performance', key: 'perfLabel', width: 18 },
    { header: 'Promedio performance', key: 'avg', width: 15 },
    { header: 'Mediciones', key: 'count', width: 12 }
  ];

  pages.forEach((page) => {
    Object.values(devices).forEach((device) => {
      const group = runs.filter(
        (run) => run.status === 'ok' && pageFor(run)?.id === page.id && deviceFor(run)?.id === device.id
      );
      if (group.length === 0) return;
      const latest = group.at(-1);
      const average = Math.round(group.reduce((sum, run) => sum + run.performance, 0) / group.length);
      const row = sheet.addRow({
        page: page.name,
        owner: page.owner,
        device: device.screenEmulation,
        date: bogotaDate(latest.timestamp),
        job: latest.job || 'sin registro',
        fcp: seconds(latest.firstContentfulPaint),
        lcp: seconds(latest.largestContentfulPaint),
        si: seconds(latest.speedIndex),
        perf: latest.performance,
        avg: average,
        count: group.length
      });
      labelCell(row.getCell('fcpLabel'), latest.classification?.firstContentfulPaint);
      labelCell(row.getCell('lcpLabel'), latest.classification?.largestContentfulPaint);
      labelCell(row.getCell('siLabel'), latest.classification?.speedIndex);
      labelCell(row.getCell('perfLabel'), latest.classification?.performance);
    });
  });
  styleHeader(sheet);

  sheet.addRow([]);
  const updated = sheet.addRow([
    'Última actualización del spreadsheet',
    bogotaDate(new Date().toISOString()),
    lastJobRun ? `Job: ${lastJobRun.job} (${lastJobRun.status})` : 'Actualización manual'
  ]);
  updated.font = { italic: true };
}

function addHistorySheet(workbook, runs) {
  const sheet = workbook.addWorksheet('Historial');
  sheet.columns = [
    { header: '#', key: 'n', width: 6 },
    { header: 'Fecha (Bogotá)', key: 'date', width: 20 },
    { header: 'Timestamp ISO', key: 'iso', width: 26 },
    { header: 'Job', key: 'job', width: 20 },
    { header: 'Página', key: 'page', width: 24 },
    { header: 'Responsable', key: 'owner', width: 28 },
    { header: 'URL', key: 'url', width: 46 },
    { header: 'Dispositivo', key: 'device', width: 20 },
    { header: 'FCP (s)', key: 'fcp', width: 10 },
    { header: 'Clasif. FCP', key: 'fcpLabel', width: 15 },
    { header: 'LCP (s)', key: 'lcp', width: 10 },
    { header: 'Clasif. LCP', key: 'lcpLabel', width: 15 },
    { header: 'Speed Index (s)', key: 'si', width: 14 },
    { header: 'Clasif. SI', key: 'siLabel', width: 15 },
    { header: 'Performance', key: 'perf', width: 13 },
    { header: 'Clasif. Performance', key: 'perfLabel', width: 18 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Error', key: 'error', width: 40 }
  ];

  runs.forEach((run, index) => {
    const row = sheet.addRow({
      n: index + 1,
      date: bogotaDate(run.timestamp),
      iso: run.timestamp,
      job: run.job || 'sin registro',
      page: pageFor(run)?.name || run.pageId || '—',
      owner: pageFor(run)?.owner || run.owner || '—',
      url: run.url,
      device: run.screenEmulation,
      fcp: seconds(run.firstContentfulPaint),
      lcp: seconds(run.largestContentfulPaint),
      si: seconds(run.speedIndex),
      perf: run.performance,
      status: run.status === 'ok' ? '✔ OK' : '✖ Error',
      error: run.error || ''
    });
    labelCell(row.getCell('fcpLabel'), run.classification?.firstContentfulPaint);
    labelCell(row.getCell('lcpLabel'), run.classification?.largestContentfulPaint);
    labelCell(row.getCell('siLabel'), run.classification?.speedIndex);
    labelCell(row.getCell('perfLabel'), run.classification?.performance);
    if (run.status !== 'ok') paint(row.getCell('status'), ERROR_STYLE);
  });
  styleHeader(sheet);
}

function addDeviceComparisonSheet(workbook, runs) {
  const sheet = workbook.addWorksheet('Móvil vs Escritorio');
  sheet.columns = [
    { header: 'Página', key: 'page', width: 26 },
    { header: 'Responsable', key: 'owner', width: 30 },
    { header: 'Perf. promedio móvil', key: 'mobile', width: 18 },
    { header: 'Perf. promedio escritorio', key: 'desktop', width: 22 },
    { header: 'Diferencia (escritorio − móvil)', key: 'diff', width: 26 },
    { header: 'LCP promedio móvil (s)', key: 'lcpMobile', width: 20 },
    { header: 'LCP promedio escritorio (s)', key: 'lcpDesktop', width: 24 }
  ];

  const average = (list, field) =>
    list.length ? list.reduce((sum, run) => sum + run[field], 0) / list.length : null;

  pages.forEach((page) => {
    const ok = runs.filter((run) => run.status === 'ok' && pageFor(run)?.id === page.id);
    const mobile = ok.filter((run) => deviceFor(run)?.id === 'mobile');
    const desktop = ok.filter((run) => deviceFor(run)?.id === 'desktop');
    const mobilePerf = average(mobile, 'performance');
    const desktopPerf = average(desktop, 'performance');
    sheet.addRow({
      page: page.name,
      owner: page.owner,
      mobile: mobilePerf == null ? null : Math.round(mobilePerf),
      desktop: desktopPerf == null ? null : Math.round(desktopPerf),
      diff: mobilePerf == null || desktopPerf == null ? null : Math.round(desktopPerf - mobilePerf),
      lcpMobile: seconds(average(mobile, 'largestContentfulPaint')),
      lcpDesktop: seconds(average(desktop, 'largestContentfulPaint'))
    });
  });
  styleHeader(sheet);
}

function addJobRunsSheet(workbook, jobRuns) {
  const sheet = workbook.addWorksheet('Ejecuciones de jobs');
  sheet.columns = [
    { header: 'Job', key: 'job', width: 22 },
    { header: 'Origen', key: 'trigger', width: 14 },
    { header: 'Inicio (Bogotá)', key: 'start', width: 20 },
    { header: 'Fin (Bogotá)', key: 'end', width: 20 },
    { header: 'Duración (s)', key: 'duration', width: 12 },
    { header: 'Páginas', key: 'pages', width: 40 },
    { header: 'Dispositivos', key: 'devices', width: 18 },
    { header: 'Mediciones nuevas', key: 'added', width: 16 },
    { header: 'Errores', key: 'errors', width: 10 },
    { header: 'Estado', key: 'status', width: 14 }
  ];

  jobRuns.forEach((run) => {
    const row = sheet.addRow({
      job: run.job,
      trigger: run.trigger,
      start: bogotaDate(run.startedAt),
      end: bogotaDate(run.finishedAt),
      duration: Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000),
      pages: (run.pages || []).join(', '),
      devices: (run.devices || []).join(', '),
      added: run.recordsAdded,
      errors: run.errors,
      status: run.status === 'ok' ? '✔ OK' : '✖ Con fallos'
    });
    paint(row.getCell('status'), run.status === 'ok' ? LABELS.Bueno : ERROR_STYLE);
  });
  styleHeader(sheet);
}

function addThresholdsSheet(workbook) {
  const sheet = workbook.addWorksheet('Umbrales');
  sheet.columns = [
    { header: 'Métrica', key: 'metric', width: 18 },
    { header: '✔ Bueno', key: 'good', width: 16 },
    { header: '▲ Por mejorar', key: 'warn', width: 18 },
    { header: '✖ Deficiente', key: 'bad', width: 16 }
  ];
  const names = {
    firstContentfulPaint: 'FCP',
    largestContentfulPaint: 'LCP',
    speedIndex: 'Speed Index'
  };
  timeMetrics.forEach((metric) => {
    const { goodMax, needsImprovementMax } = thresholds[metric];
    sheet.addRow({
      metric: names[metric],
      good: `≤ ${goodMax / 1000} s`,
      warn: `> ${goodMax / 1000} s y ≤ ${needsImprovementMax / 1000} s`,
      bad: `> ${needsImprovementMax / 1000} s`
    });
  });
  const { goodMin, needsImprovementMin } = thresholds.performance;
  sheet.addRow({
    metric: 'Performance',
    good: `${goodMin}–100`,
    warn: `${needsImprovementMin}–${goodMin - 1}`,
    bad: `0–${needsImprovementMin - 1}`
  });
  styleHeader(sheet);
  sheet.autoFilter = undefined;
  ['good', 'warn', 'bad'].forEach((key, index) => {
    const style = [LABELS.Bueno, LABELS['Por mejorar'], LABELS.Deficiente][index];
    sheet.getColumn(key).eachCell((cell, rowNumber) => {
      if (rowNumber > 1) paint(cell, style);
    });
  });
  sheet.addRow([]);
  sheet.addRow(['Fuente: config/thresholds.js (límites configurables en un solo lugar).']);
}

async function exportSpreadsheet({ lastJobRun = null } = {}) {
  const runs = readJsonArray(resultsPath);
  const jobRuns = readJsonArray(jobRunsPath);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Proyecto Métricas Web UAM';
  workbook.created = new Date();

  addSummarySheet(workbook, runs, lastJobRun || jobRuns.at(-1));
  addHistorySheet(workbook, runs);
  addDeviceComparisonSheet(workbook, runs);
  addJobRunsSheet(workbook, jobRuns);
  addThresholdsSheet(workbook);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const buffer = await workbook.xlsx.writeBuffer();
  // Se escribe primero un archivo temporal y luego se reemplaza, para no dejar
  // un .xlsx a medias si dos jobs terminan a la vez.
  withFileLock(outputPath, () => {
    const temporaryPath = `${outputPath}.tmp`;
    fs.writeFileSync(temporaryPath, buffer);
    fs.renameSync(temporaryPath, outputPath);
  });

  return { outputPath, records: runs.length, jobRuns: jobRuns.length };
}

module.exports = { exportSpreadsheet, outputPath };

if (require.main === module) {
  exportSpreadsheet()
    .then(({ outputPath: file, records, jobRuns }) => {
      console.log(`Spreadsheet actualizado: ${path.relative(projectRoot, file)} (${records} mediciones, ${jobRuns} ejecuciones de jobs)`);
    })
    .catch((error) => {
      console.error(`No se pudo actualizar el spreadsheet: ${error.message}`);
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        console.error('Cierre el archivo en Excel y vuelva a ejecutar `npm run spreadsheet`.');
      }
      process.exitCode = 1;
    });
}
