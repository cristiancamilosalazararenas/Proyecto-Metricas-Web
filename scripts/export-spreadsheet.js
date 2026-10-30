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
const FONT = 'Times New Roman';

// Colores por clasificación: verde (Bueno), amarillo (Por mejorar), rojo (Deficiente).
const CLASS_COLORS = {
  Bueno: { fill: 'FFC6EFCE', font: 'FF006100' },
  'Por mejorar': { fill: 'FFFFEB9C', font: 'FF9C5700' },
  Deficiente: { fill: 'FFFFC7CE', font: 'FF9C0006' }
};
const HEADER_FILL = 'FFD9D9D9';
const BORDER_COLOR = 'FF808080';
const thin = { style: 'thin', color: { argb: BORDER_COLOR } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

const DEVICE_NAMES = { mobile: 'Móvil (Moto G4)', desktop: 'Escritorio' };

function bogotaParts(iso) {
  return Object.fromEntries(
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
}
const bogotaDay = (iso) => {
  if (!iso) return '';
  const p = bogotaParts(iso);
  return `${p.day}/${p.month}/${p.year}`;
};
const bogotaTime = (iso) => {
  if (!iso) return '';
  const p = bogotaParts(iso);
  return `${p.hour}:${p.minute}:${p.second}`;
};

const seconds = (ms) => (ms == null ? null : Math.round(ms / 10) / 100);
const pageFor = (run) => pages.find((page) => page.id === run.pageId || page.url === run.url);
const deviceFor = (run) =>
  Object.values(devices).find((device) => device.id === run.deviceId || device.screenEmulation === run.screenEmulation);
const deviceName = (device) => DEVICE_NAMES[device?.id] || device?.name || '';
const pageName = (id) => pages.find((page) => page.id === id)?.name || id;

function resolutionFor(run) {
  const device = deviceFor(run);
  if (device) return `${device.width} x ${device.height}`;
  const match = /(\d+)\s*x\s*(\d+)/i.exec(run.screenEmulation || '');
  return match ? `${match[1]} x ${match[2]}` : '';
}

function baseCell(cell, { bold = false, align = 'left', color } = {}) {
  cell.font = { name: FONT, size: 11, bold, ...(color ? { color: { argb: color } } : {}) };
  cell.border = BORDER;
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: false };
}

function classCell(cell, classification) {
  const colors = CLASS_COLORS[classification];
  if (!colors) return;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.fill } };
  cell.font = { ...cell.font, color: { argb: colors.font } };
}

// Crea una hoja con título, subtítulo y una tabla con encabezados grises.
// `columns`: [{ header, key, width, align, format }]. Devuelve la hoja y la fila
// donde empiezan los datos.
function createSheet(workbook, name, title, subtitle, columns) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: FONT, size: 14, bold: true };
  sheet.getRow(1).height = 22;

  sheet.mergeCells(2, 1, 2, columns.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: FONT, size: 11, italic: true };

  const header = sheet.getRow(4);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    baseCell(cell, { bold: true, align: 'center' });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  header.height = 32;
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };

  const addRow = (values) => {
    const row = sheet.addRow(values);
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      baseCell(cell, { align: column.align || 'left' });
      if (column.format) cell.numFmt = column.format;
    });
    return row;
  };

  return { sheet, addRow };
}

// Columnas de métricas: valor y clasificación, ambas con el color correspondiente.
const METRICS = [
  { key: 'firstContentfulPaint', label: 'FCP (s)', time: true },
  { key: 'largestContentfulPaint', label: 'LCP (s)', time: true },
  { key: 'speedIndex', label: 'Speed Index (s)', time: true },
  { key: 'performance', label: 'Performance', time: false }
];

function metricColumns() {
  return METRICS.flatMap((metric) => [
    { header: metric.label, key: metric.key, width: 13, align: 'center', format: metric.time ? '0.00' : '0' },
    { header: `Clasificación ${metric.label.replace(' (s)', '')}`, key: `${metric.key}Class`, width: 15, align: 'center' }
  ]);
}

function metricValues(run) {
  return Object.fromEntries(
    METRICS.flatMap((metric) => [
      [metric.key, metric.time ? seconds(run[metric.key]) : run[metric.key]],
      [`${metric.key}Class`, run.classification?.[metric.key] || '']
    ])
  );
}

function colorMetrics(row, run) {
  METRICS.forEach((metric) => {
    const classification = run.classification?.[metric.key];
    classCell(row.getCell(metric.key), classification);
    classCell(row.getCell(`${metric.key}Class`), classification);
  });
}

function addSummarySheet(workbook, runs, lastJobRun) {
  const updatedAt = new Date().toISOString();
  const source = lastJobRun ? `job ${lastJobRun.job}` : 'actualización manual';
  const { sheet, addRow } = createSheet(
    workbook,
    'Resumen',
    'Proyecto de Métricas Web — Universidad Autónoma de Manizales',
    `Última medición por página y dispositivo. Actualizado el ${bogotaDay(updatedAt)} a las ${bogotaTime(updatedAt)} (hora de Bogotá) por ${source}.`,
    [
      { header: 'Página', key: 'page', width: 26 },
      { header: 'Responsable', key: 'owner', width: 30 },
      { header: 'Dispositivo', key: 'device', width: 17 },
      { header: 'Resolución', key: 'resolution', width: 12, align: 'center' },
      { header: 'Fecha', key: 'date', width: 12, align: 'center' },
      { header: 'Hora', key: 'time', width: 10, align: 'center' },
      { header: 'Job', key: 'job', width: 19 },
      ...metricColumns(),
      { header: 'Performance promedio', key: 'avg', width: 13, align: 'center', format: '0' },
      { header: 'Mediciones', key: 'count', width: 11, align: 'center' }
    ]
  );

  pages.forEach((page) => {
    Object.values(devices).forEach((device) => {
      const group = runs.filter(
        (run) => run.status === 'ok' && pageFor(run)?.id === page.id && deviceFor(run)?.id === device.id
      );
      if (group.length === 0) return;
      const latest = group.at(-1);
      const average = Math.round(group.reduce((sum, run) => sum + run.performance, 0) / group.length);
      const row = addRow({
        page: page.name,
        owner: page.owner,
        device: deviceName(device),
        resolution: resolutionFor(latest),
        date: bogotaDay(latest.timestamp),
        time: bogotaTime(latest.timestamp),
        job: latest.job || 'Sin registro',
        ...metricValues(latest),
        avg: average,
        count: group.length
      });
      colorMetrics(row, latest);
      const avgClass =
        average >= thresholds.performance.goodMin ? 'Bueno' : average >= thresholds.performance.needsImprovementMin ? 'Por mejorar' : 'Deficiente';
      classCell(row.getCell('avg'), avgClass);
    });
  });
  addLegend(sheet);
}

function addHistorySheet(workbook, runs) {
  const { addRow } = createSheet(
    workbook,
    'Historial',
    'Historial de mediciones',
    'Todas las ejecuciones registradas en data/results.json. Tiempos en segundos; fecha y hora de Bogotá.',
    [
      { header: 'N.º', key: 'n', width: 6, align: 'center' },
      { header: 'Fecha', key: 'date', width: 12, align: 'center' },
      { header: 'Hora', key: 'time', width: 10, align: 'center' },
      { header: 'Job', key: 'job', width: 19 },
      { header: 'Página', key: 'page', width: 26 },
      { header: 'Responsable', key: 'owner', width: 30 },
      { header: 'URL', key: 'url', width: 46 },
      { header: 'Dispositivo', key: 'device', width: 17 },
      { header: 'Resolución', key: 'resolution', width: 12, align: 'center' },
      ...metricColumns(),
      { header: 'Estado', key: 'status', width: 11, align: 'center' },
      { header: 'Error', key: 'error', width: 40 }
    ]
  );

  runs.forEach((run, index) => {
    const row = addRow({
      n: index + 1,
      date: bogotaDay(run.timestamp),
      time: bogotaTime(run.timestamp),
      job: run.job || 'Sin registro',
      page: pageFor(run)?.name || run.pageId || '',
      owner: pageFor(run)?.owner || run.owner || '',
      url: run.url,
      device: deviceName(deviceFor(run)) || run.screenEmulation,
      resolution: resolutionFor(run),
      ...metricValues(run),
      status: run.status === 'ok' ? 'Correcta' : 'Fallida',
      error: run.error || ''
    });
    colorMetrics(row, run);
    if (run.status !== 'ok') classCell(row.getCell('status'), 'Deficiente');
  });
}

function addDeviceComparisonSheet(workbook, runs) {
  const { addRow } = createSheet(
    workbook,
    'Móvil vs Escritorio',
    'Comparación entre dispositivos',
    'Promedios de todas las mediciones correctas de cada página.',
    [
      { header: 'Página', key: 'page', width: 26 },
      { header: 'Responsable', key: 'owner', width: 30 },
      { header: 'Performance promedio móvil', key: 'mobile', width: 16, align: 'center', format: '0' },
      { header: 'Performance promedio escritorio', key: 'desktop', width: 16, align: 'center', format: '0' },
      { header: 'Diferencia (escritorio - móvil)', key: 'diff', width: 16, align: 'center', format: '+0;-0;0' },
      { header: 'LCP promedio móvil (s)', key: 'lcpMobile', width: 15, align: 'center', format: '0.00' },
      { header: 'LCP promedio escritorio (s)', key: 'lcpDesktop', width: 15, align: 'center', format: '0.00' }
    ]
  );

  const average = (list, field) =>
    list.length ? list.reduce((sum, run) => sum + run[field], 0) / list.length : null;
  const perfClass = (value) =>
    value == null ? null : value >= thresholds.performance.goodMin ? 'Bueno' : value >= thresholds.performance.needsImprovementMin ? 'Por mejorar' : 'Deficiente';
  const lcpClass = (ms) =>
    ms == null ? null : ms <= thresholds.largestContentfulPaint.goodMax ? 'Bueno' : ms <= thresholds.largestContentfulPaint.needsImprovementMax ? 'Por mejorar' : 'Deficiente';

  pages.forEach((page) => {
    const ok = runs.filter((run) => run.status === 'ok' && pageFor(run)?.id === page.id);
    const mobile = ok.filter((run) => deviceFor(run)?.id === 'mobile');
    const desktop = ok.filter((run) => deviceFor(run)?.id === 'desktop');
    const mobilePerf = average(mobile, 'performance');
    const desktopPerf = average(desktop, 'performance');
    const mobileLcp = average(mobile, 'largestContentfulPaint');
    const desktopLcp = average(desktop, 'largestContentfulPaint');
    const row = addRow({
      page: page.name,
      owner: page.owner,
      mobile: mobilePerf == null ? null : Math.round(mobilePerf),
      desktop: desktopPerf == null ? null : Math.round(desktopPerf),
      diff: mobilePerf == null || desktopPerf == null ? null : Math.round(desktopPerf - mobilePerf),
      lcpMobile: seconds(mobileLcp),
      lcpDesktop: seconds(desktopLcp)
    });
    classCell(row.getCell('mobile'), perfClass(mobilePerf));
    classCell(row.getCell('desktop'), perfClass(desktopPerf));
    classCell(row.getCell('lcpMobile'), lcpClass(mobileLcp));
    classCell(row.getCell('lcpDesktop'), lcpClass(desktopLcp));
  });
}

function addJobRunsSheet(workbook, jobRuns) {
  const { addRow } = createSheet(
    workbook,
    'Ejecuciones de jobs',
    'Registro de ejecuciones de jobs',
    'Cada fila corresponde a una ejecución; el origen indica si la lanzó el scheduler o se ejecutó manualmente.',
    [
      { header: 'Job', key: 'job', width: 21 },
      { header: 'Origen', key: 'trigger', width: 12, align: 'center' },
      { header: 'Fecha', key: 'date', width: 12, align: 'center' },
      { header: 'Hora de inicio', key: 'start', width: 11, align: 'center' },
      { header: 'Hora de fin', key: 'end', width: 11, align: 'center' },
      { header: 'Duración (s)', key: 'duration', width: 11, align: 'center' },
      { header: 'Páginas', key: 'pages', width: 58 },
      { header: 'Dispositivos', key: 'devices', width: 20 },
      { header: 'Mediciones nuevas', key: 'added', width: 12, align: 'center' },
      { header: 'Errores', key: 'errors', width: 9, align: 'center' },
      { header: 'Estado', key: 'status', width: 12, align: 'center' }
    ]
  );

  jobRuns.forEach((run) => {
    const row = addRow({
      job: run.job,
      trigger: run.trigger === 'scheduler' ? 'Scheduler' : 'Manual',
      date: bogotaDay(run.startedAt),
      start: bogotaTime(run.startedAt),
      end: bogotaTime(run.finishedAt),
      duration: Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000),
      pages: (run.pages || []).map(pageName).join(', '),
      devices: (run.devices || []).map((id) => DEVICE_NAMES[id] || id).join(', '),
      added: run.recordsAdded,
      errors: run.errors,
      status: run.status === 'ok' ? 'Correcta' : 'Con fallos'
    });
    classCell(row.getCell('status'), run.status === 'ok' ? 'Bueno' : 'Deficiente');
  });
}

function addThresholdsSheet(workbook) {
  const { sheet, addRow } = createSheet(
    workbook,
    'Umbrales',
    'Umbrales de clasificación',
    'Valores tomados de config/thresholds.js, único lugar donde se configuran.',
    [
      { header: 'Métrica', key: 'metric', width: 18 },
      { header: 'Bueno', key: 'good', width: 18, align: 'center' },
      { header: 'Por mejorar', key: 'warn', width: 22, align: 'center' },
      { header: 'Deficiente', key: 'bad', width: 18, align: 'center' }
    ]
  );
  const names = { firstContentfulPaint: 'FCP', largestContentfulPaint: 'LCP', speedIndex: 'Speed Index' };
  const rows = Object.keys(names).map((metric) => {
    const { goodMax, needsImprovementMax } = thresholds[metric];
    return {
      metric: names[metric],
      good: `≤ ${goodMax / 1000} s`,
      warn: `> ${goodMax / 1000} s y ≤ ${needsImprovementMax / 1000} s`,
      bad: `> ${needsImprovementMax / 1000} s`
    };
  });
  const { goodMin, needsImprovementMin } = thresholds.performance;
  rows.push({ metric: 'Performance', good: `${goodMin} a 100`, warn: `${needsImprovementMin} a ${goodMin - 1}`, bad: `0 a ${needsImprovementMin - 1}` });
  rows.forEach((values) => {
    const row = addRow(values);
    classCell(row.getCell('good'), 'Bueno');
    classCell(row.getCell('warn'), 'Por mejorar');
    classCell(row.getCell('bad'), 'Deficiente');
  });
  sheet.autoFilter = undefined;
}

function addLegend(sheet) {
  const start = sheet.rowCount + 2;
  const title = sheet.getCell(start, 1);
  title.value = 'Convenciones';
  title.font = { name: FONT, size: 11, bold: true };
  ['Bueno', 'Por mejorar', 'Deficiente'].forEach((label, index) => {
    const cell = sheet.getCell(start + 1 + index, 1);
    cell.value = label;
    baseCell(cell);
    classCell(cell, label);
  });
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
