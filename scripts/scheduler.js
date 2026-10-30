const { spawn } = require('node:child_process');
const cron = require('node-cron');
const path = require('node:path');
const { jobs } = require('../config/schedule');

const projectRoot = path.resolve(__dirname, '..');

function cronExpression(job) {
  const [hour, minute] = job.time.split(':').map(Number);
  if (job.frequency === 'weekly') return `${minute} ${hour} * * ${job.dayOfWeek ?? 1}`;
  return `${minute} ${hour} * * *`;
}

function localDate(timezone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function timestamp() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

function shouldRun(job, today) {
  if (today < job.startDate) return false;
  if (job.frequency === 'once' && today !== job.startDate) return false;
  return true;
}

// Ejecuta un job con el mismo comando que se usa manualmente. run-audit.js se
// encarga de guardar el JSON, registrar la ejecución y actualizar el spreadsheet.
function executeJob(job) {
  return new Promise((resolve) => {
    console.log(`[scheduler ${timestamp()}] Ejecutando ${job.id} (${job.devices.join(', ')}; ${job.pages.join(', ')})`);
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npmCommand, ['run', 'audit', '--', '--job', job.id, '--browser', 'chrome'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, AUDIT_TRIGGER: 'scheduler' }
    });
    child.on('error', (error) => {
      console.error(`[scheduler] No se pudo iniciar ${job.id}: ${error.message}`);
      resolve(1);
    });
    child.on('exit', (code) => {
      console.log(`[scheduler ${timestamp()}] ${job.id} terminó con código ${code}`);
      resolve(code ?? 1);
    });
  });
}

// Cola secuencial: los jobs que coinciden en la misma hora (móvil y escritorio)
// se ejecutan uno después del otro para que no compitan por CPU y red, lo que
// alteraría las métricas de Lighthouse.
const queue = [];
let running = false;

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    await executeJob(queue.shift());
  }
  running = false;
}

function enqueue(job) {
  if (queue.some((queued) => queued.id === job.id)) return;
  queue.push(job);
  if (running) console.log(`[scheduler] ${job.id} en cola; se ejecutará al terminar el job actual.`);
  processQueue();
}

const activeJobs = jobs.filter((job) => job.enabled);

// `npm run scheduler -- --run-now <jobId|all>` ejecuta jobs inmediatamente por el
// mismo flujo del scheduler (útil para probar y capturar evidencias) y termina.
const runNowIndex = process.argv.indexOf('--run-now');
if (runNowIndex >= 0) {
  const requested = process.argv[runNowIndex + 1] || 'all';
  const selected = requested === 'all' ? activeJobs : activeJobs.filter((job) => job.id === requested);
  if (selected.length === 0) {
    console.error(`No existe un job habilitado llamado "${requested}" en config/schedule.js.`);
    process.exit(1);
  }
  (async () => {
    let failed = 0;
    for (const job of selected) {
      if ((await executeJob(job)) !== 0) failed += 1;
    }
    console.log(`[scheduler] Ejecución inmediata terminada: ${selected.length - failed}/${selected.length} jobs correctos.`);
    process.exit(failed ? 1 : 0);
  })();
} else {
  if (activeJobs.length === 0) {
    console.log('No hay jobs habilitados. Edite config/schedule.js.');
    process.exit(0);
  }

  activeJobs.forEach((job) => {
    const expression = cronExpression(job);
    if (!cron.validate(expression)) throw new Error(`Expresión cron inválida en ${job.id}: ${expression}`);

    cron.schedule(
      expression,
      () => {
        const today = localDate(job.timezone);
        if (shouldRun(job, today)) enqueue(job);
      },
      { timezone: job.timezone }
    );
    console.log(`[scheduler] ${job.id}: ${expression} (${job.timezone}) desde ${job.startDate}, ${job.frequency}`);
  });

  console.log(`[scheduler ${timestamp()}] Scheduler activo. Mantenga esta terminal abierta y el equipo sin suspender.`);
}
