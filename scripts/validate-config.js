const pages = require('../config/pages');
const devices = require('../config/devices');
const { jobs } = require('../config/schedule');

const errors = [];
const configuredPages = pages.filter((page) => /^https?:\/\//i.test(page.url || ''));

if (pages.length < 3) errors.push('Deben existir al menos tres páginas.');
if (configuredPages.length < 3) errors.push('Configure tres URL institucionales distintas en config/pages.js.');
if (new Set(configuredPages.map((page) => page.url)).size !== configuredPages.length) {
  errors.push('Las URL configuradas deben ser diferentes.');
}
if (!devices.mobile || !devices.desktop) errors.push('Deben existir perfiles mobile y desktop.');

for (const job of jobs) {
  if (!['once', 'daily', 'weekly'].includes(job.frequency)) {
    errors.push(`Frecuencia inválida en ${job.id}.`);
  }
  if (!/^\d{2}:\d{2}$/.test(job.time)) errors.push(`Hora inválida en ${job.id}.`);
  if (!job.timezone) errors.push(`Falta zona horaria en ${job.id}.`);
}

if (errors.length) {
  console.error('Configuración pendiente:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log('Configuración válida.');
}
