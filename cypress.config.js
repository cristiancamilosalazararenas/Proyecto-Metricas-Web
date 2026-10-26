const fs = require('node:fs');
const path = require('node:path');
const { defineConfig } = require('cypress');
const { lighthouse, prepareAudit } = require('cypress-audit');
const { classifyMetric } = require('./config/thresholds');

let currentRunContext = null;

function readHistory(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.runs || [];
}

function appendResult(projectRoot, result) {
  const filePath = path.join(projectRoot, 'data', 'results.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const history = readHistory(filePath);
  history.push(result);
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
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
  expose: {
    job: null
  },
  e2e: {
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    video: false,
    setupNodeEvents(on, config) {
      config.expose = {
        ...config.expose,
        job: config.env?.job || null
      };

      on('before:browser:launch', (_browser = {}, launchOptions) => {
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
