// Utilidades compartidas para leer y escribir los historiales JSON sin que dos
// procesos (por ejemplo, dos jobs a la misma hora) se pisen.
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const resultsPath = path.join(projectRoot, 'data', 'results.json');
const jobRunsPath = path.join(projectRoot, 'data', 'job-runs.json');

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withFileLock(filePath, callback, timeoutMs = 30_000) {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + timeoutMs;
  let lockHandle;

  while (!lockHandle) {
    try {
      lockHandle = fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      sleep(50);
    }
  }

  try {
    return callback();
  } finally {
    fs.closeSync(lockHandle);
    fs.rmSync(lockPath, { force: true });
  }
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.runs || [];
}

function appendJsonArray(filePath, entry) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  withFileLock(filePath, () => {
    const history = readJsonArray(filePath);
    history.push(entry);
    fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  });
}

module.exports = {
  projectRoot,
  resultsPath,
  jobRunsPath,
  withFileLock,
  readJsonArray,
  appendJsonArray
};
