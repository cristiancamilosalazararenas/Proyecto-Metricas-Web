const { spawnSync } = require('node:child_process');
const { jobs } = require('../config/schedule');
const { projectRoot, resultsPath, jobRunsPath, readJsonArray, appendJsonArray } = require('./lib/history');
const { exportSpreadsheet } = require('./export-spreadsheet');

const inputArgs = process.argv.slice(2);

function extractOption(optionName) {
  const optionIndex = inputArgs.findIndex(
    (argument) => argument === `--${optionName}` || argument.startsWith(`--${optionName}=`)
  );

  if (optionIndex < 0) return null;

  const argument = inputArgs[optionIndex];
  if (argument.includes('=')) {
    inputArgs.splice(optionIndex, 1);
    return argument.split('=').slice(1).join('=');
  }

  const value = inputArgs[optionIndex + 1];
  inputArgs.splice(optionIndex, 2);
  return value;
}

function extractFlag(flagName) {
  const flagIndex = inputArgs.indexOf(`--${flagName}`);
  if (flagIndex < 0) return false;
  inputArgs.splice(flagIndex, 1);
  return true;
}

const jobId = extractOption('job');
const pageId = extractOption('page');
const skipSpreadsheet = extractFlag('no-spreadsheet');
const trigger = process.env.AUDIT_TRIGGER || 'manual';

const cypressCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cypressArgs = ['cypress', 'run'];
const environment = [];
if (jobId) environment.push(`job=${jobId}`);
if (pageId) environment.push(`page=${pageId}`);
if (environment.length > 0) cypressArgs.push('--env', environment.join(','));
// Lighthouse no funciona en Electron (el navegador por defecto de Cypress), así
// que se usa Chrome salvo que se indique otro navegador.
const hasBrowser = inputArgs.some((argument) => ['--browser', '-b'].includes(argument) || argument.startsWith('--browser='));
if (!hasBrowser) cypressArgs.push('--browser', 'chrome');
cypressArgs.push(...inputArgs);

const startedAt = new Date().toISOString();
const result = spawnSync(cypressCommand, cypressArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
const finishedAt = new Date().toISOString();

if (result.error) {
  console.error(`No se pudo iniciar Cypress: ${result.error.message}`);
}
const exitCode = result.status ?? 1;

// Registra la ejecución del job y actualiza el spreadsheet. Un fallo aquí no
// cambia el resultado de las pruebas: el JSON ya quedó guardado por Cypress.
async function recordJobRun() {
  const job = jobs.find((item) => item.id === jobId);
  const jobLabel = jobId || 'manual';
  const newRecords = readJsonArray(resultsPath).filter(
    (run) => run.timestamp >= startedAt && run.timestamp <= finishedAt && (run.job || 'manual') === jobLabel
  );
  const errors = newRecords.filter((run) => run.status !== 'ok').length;

  const jobRun = {
    job: jobLabel,
    trigger,
    startedAt,
    finishedAt,
    pages: pageId ? [pageId] : job?.pages || [],
    devices: job?.devices || ['mobile', 'desktop'],
    recordsAdded: newRecords.length,
    errors,
    exitCode,
    status: exitCode === 0 && errors === 0 && newRecords.length > 0 ? 'ok' : 'error'
  };
  appendJsonArray(jobRunsPath, jobRun);
  console.log(`[audit] ${jobLabel}: ${newRecords.length} mediciones nuevas, ${errors} con error.`);

  if (skipSpreadsheet) return;
  try {
    const { outputPath } = await exportSpreadsheet({ lastJobRun: jobRun });
    console.log(`[audit] Spreadsheet actualizado: ${outputPath}`);
  } catch (error) {
    console.error(`[audit] No se pudo actualizar el spreadsheet: ${error.message}`);
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      console.error('[audit] Cierre el archivo en Excel y ejecute `npm run spreadsheet`.');
    }
  }
}

recordJobRun()
  .catch((error) => console.error(`[audit] No se pudo registrar la ejecución: ${error.message}`))
  .finally(() => process.exit(exitCode));
