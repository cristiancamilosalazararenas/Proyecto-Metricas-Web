const { spawnSync } = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const inputArgs = process.argv.slice(2);
const jobArgumentIndex = inputArgs.findIndex((argument) => argument === '--job' || argument.startsWith('--job='));
let jobId = null;

if (jobArgumentIndex >= 0) {
  const argument = inputArgs[jobArgumentIndex];
  if (argument.includes('=')) {
    jobId = argument.split('=').slice(1).join('=');
    inputArgs.splice(jobArgumentIndex, 1);
  } else {
    jobId = inputArgs[jobArgumentIndex + 1];
    inputArgs.splice(jobArgumentIndex, 2);
  }
}

const cypressCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const cypressArgs = ['cypress', 'run'];
if (jobId) cypressArgs.push('--env', `job=${jobId}`);
cypressArgs.push(...inputArgs);

const result = spawnSync(cypressCommand, cypressArgs, {
  cwd: projectRoot,
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
