const { defineConfig } = require('cypress');
const { lighthouse, prepareAudit } = require('@cypress-audit/lighthouse');
const { classifyMetric } = require('./config/thresholds');

const { resultsPath, appendJsonArray } = require('./scripts/lib/history');

let currentRunContext = null;

function appendResult(result) {
  appendJsonArray(resultsPath, result);
}

// Datos de la página, el dispositivo y el job que se guardan en cada registro.
function runContextFields() {
  return {
    pageId: currentRunContext?.pageId || null,
    pageName: currentRunContext?.pageName || null,
    owner: currentRunContext?.owner || null,
    deviceId: currentRunContext?.deviceId || null,
    job: currentRunContext?.job || 'manual'
  };
}

// Las tres oportunidades de Lighthouse con mayor ahorro estimado; sirven de base
// para las recomendaciones del informe.
function topOpportunities(lhr, limit = 3) {
  return Object.values(lhr.audits || {})
    .filter((audit) =>
      audit.details?.type === 'opportunity' &&
      audit.details.overallSavingsMs > 0 &&
      audit.score != null && audit.score < 0.9
    )
    .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
    .slice(0, limit)
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      savingsMs: Math.round(audit.details.overallSavingsMs)
    }));
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
    ...runContextFields(),
    firstContentfulPaint: value('first-contentful-paint'),
    largestContentfulPaint: value('largest-contentful-paint'),
    speedIndex: value('speed-index'),
    performance,
    status: 'ok',
    error: null,
    opportunities: topOpportunities(lhr)
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
          appendResult({
            url: currentRunContext?.url || null,
            screenEmulation: currentRunContext?.screenEmulation || 'unknown',
            timestamp: new Date().toISOString(),
            ...runContextFields(),
            firstContentfulPaint: null,
            largestContentfulPaint: null,
            speedIndex: null,
            performance: null,
            status: 'error',
            error: error || 'Evaluación fallida',
            opportunities: [],
            classification: {}
          });
          return null;
        },

        lighthouse: lighthouse((report) => {
          appendResult(normalizeReport(report));
        })
      });

      return config;
    }
  }
});
