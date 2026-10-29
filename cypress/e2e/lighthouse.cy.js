const pagesConfig = require('../../config/pages');
const devicesConfig = require('../../config/devices');
const { jobs } = require('../../config/schedule');

const requestedJobId = Cypress.expose('job');
const requestedPageId = Cypress.expose('page');
const requestedJob = requestedJobId ? jobs.find((job) => job.id === requestedJobId) : null;
const configuredPages = pagesConfig.filter((page) => /^https?:\/\//i.test(page.url || ''));
const configuredDevices = Object.values(devicesConfig);

const jobPages = requestedJob
  ? configuredPages.filter((page) => requestedJob.pages.includes(page.id))
  : configuredPages;
const selectedPages = requestedPageId
  ? jobPages.filter((page) => page.id === requestedPageId)
  : jobPages;
const selectedDevices = requestedJob
  ? configuredDevices.filter((device) => requestedJob.devices.includes(device.id))
  : configuredDevices;

describe('Métricas Lighthouse de páginas institucionales', () => {
  if (requestedJobId && !requestedJob) {
    it('rechaza un job inexistente', () => {
      throw new Error(`No existe el job "${requestedJobId}" en config/schedule.js`);
    });
    return;
  }

  if (requestedPageId && !configuredPages.some((page) => page.id === requestedPageId)) {
    it('rechaza una página inexistente', () => {
      throw new Error(`No existe la página "${requestedPageId}" en config/pages.js`);
    });
    return;
  }

  if (selectedPages.length === 0) {
    it('espera las URL institucionales', () => {
      cy.log('Configure las tres URL en config/pages.js antes de ejecutar Lighthouse.');
    });
    return;
  }

  if (selectedDevices.length === 0) {
    it('espera dispositivos configurados', () => {
      throw new Error('El job seleccionado no tiene dispositivos configurados.');
    });
    return;
  }

  selectedPages.forEach((page) => {
    selectedDevices.forEach((device) => {
      it(`${page.name} - ${device.name}`, function () {
        cy.task('setRunContext', {
          url: page.url,
          pageId: page.id,
          owner: page.owner,
          deviceId: device.id,
          screenEmulation: device.screenEmulation
        });

        cy.viewport(device.width, device.height);
        cy.visit(page.url);
        // Performance: 0 evita que el test falle por un umbral de aprobación.
        // La clasificación académica se calcula con config/thresholds.js.
        cy.lighthouse({ performance: 0 }, device.lighthouseOptions);
      });
    });
  });

  afterEach(function () {
    if (this.currentTest.state === 'failed') {
      cy.task('recordError', {
        error: this.currentTest.err?.message || 'Evaluación fallida'
      });
    }
  });
});
