const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
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

const jobId = extractOption('job');
const pageId = extractOption('page');

const cypressCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cypressArgs = ['cypress', 'run'];
const environment = [];
if (jobId) environment.push(`job=${jobId}`);
if (pageId) environment.push(`page=${pageId}`);
if (environment.length > 0) cypressArgs.push('--env', environment.join(','));
cypressArgs.push(...inputArgs);

const result = spawnSync(cypressCommand, cypressArgs, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(`No se pudo iniciar Cypress: ${result.error.message}`);
}

process.exit(result.status ?? 1);
