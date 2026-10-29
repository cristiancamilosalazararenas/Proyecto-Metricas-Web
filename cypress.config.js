const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('cypress');
const { lighthouse, prepareAudit } = require('@cypress-audit/lighthouse');
const { classifyMetric } = require('./config/thresholds');

let currentRunContext = null;

function readHistory(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.runs || [];
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withHistoryLock(filePath, callback) {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + 10_000;
  let lockHandle;

  while (!lockHandle) {
    try {
      lockHandle = fs.openSync(lockPath, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      sleep(25);
    }
  }

  try {
    return callback();
  } finally {
    fs.closeSync(lockHandle);
    try {
      fs.unlinkSync(lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function appendResult(projectRoot, result) {
  const filePath = path.join(projectRoot, 'data', 'results.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  withHistoryLock(filePath, () => {
    const history = readHistory(filePath);
    history.push(result);
    fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  });
}

function normalizeReport(report) {
  const lhr = report.lhr || report;
  const value = (auditId) => lhr.audits?.[auditId]?.numericValue ?? null;
  const performanceScore = lhr.categories?.performance?.score;
  const performance = performanceScore == null ? null : Math.round(performanceScore * 100);

  const result = {
    url: currentRunContext?.url || lhr.finalDisplayedUrl || lhr.requestedUrl || null,
    screenEmulation: currentRunContext?.screenEmulation || 'unknown',
    timestamp: new Date().toISOString(),
    firstContentfulPaint: value('first-contentful-paint'),
    largestContentfulPaint: value('largest-contentful-paint'),
    speedIndex: value('speed-index'),
    performance,
    status: 'ok',
    error: null
  };

  result.classification = {
    firstContentfulPaint: classifyMetric('firstContentfulPaint', result.firstContentfulPaint),
    largestContentfulPaint: classifyMetric('largestContentfulPaint', result.largestContentfulPaint),
    speedIndex: classifyMetric('speedIndex', result.speedIndex),
    performance: classifyMetric('performance', result.performance)
  };

  return result;
}

module.exports = defineConfig({
  taskTimeout: 180000,
  expose: {
    job: null,
    page: null
  },
  e2e: {
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    video: false,
    setupNodeEvents(on, config) {
      config.expose = {
        ...config.expose,
        job: config.env?.job || null,
        page: config.env?.page || null
      };

      on('before:browser:launch', (_browser = {}, launchOptions) => {
        if (_browser.family === 'chromium') {
          launchOptions.args.push('--disable-gpu', '--disable-dev-shm-usage');
        }
        prepareAudit(launchOptions);
        return launchOptions;
      });

      on('task', {
        setRunContext(context) {
          currentRunContext = context;
          return null;
        },

        recordError({ error }) {
          appendResult(config.projectRoot, {
            url: currentRunContext?.url || null,
            screenEmulation: currentRunContext?.screenEmulation || 'unknown',
            timestamp: new Date().toISOString(),
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            speedIndex: null,
            performance: null,
            status: 'error',
            error: error || 'Evaluación fallida',
            classification: {}
          });
          return null;
        },

        lighthouse: lighthouse((report) => {
          appendResult(config.projectRoot, normalizeReport(report));
        })
      });

      return config;
    }
  }
});
