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

function runJob(job) {
  const today = localDate(job.timezone);
  if (today < job.startDate) return;
  if (job.frequency === 'once' && today !== job.startDate) return;

  console.log(`[scheduler] Ejecutando ${job.id} (${today} ${job.timezone})`);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCommand, ['run', 'audit', '--', '--job', job.id, '--browser', 'chrome'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  child.on('error', (error) => console.error(`[scheduler] No se pudo iniciar ${job.id}: ${error.message}`));
  child.on('exit', (code) => console.log(`[scheduler] ${job.id} terminó con código ${code}`));
}

const activeJobs = jobs.filter((job) => job.enabled);
if (activeJobs.length === 0) {
  console.log('No hay jobs habilitados. Edite config/schedule.js.');
  process.exit(0);
}

activeJobs.forEach((job) => {
  const expression = cronExpression(job);
  if (!cron.validate(expression)) throw new Error(`Expresión cron inválida en ${job.id}: ${expression}`);

  cron.schedule(expression, () => runJob(job), {
    timezone: job.timezone
  });
  console.log(`[scheduler] ${job.id}: ${expression} (${job.timezone})`);
});

console.log('Scheduler activo. Mantenga esta terminal abierta.');
