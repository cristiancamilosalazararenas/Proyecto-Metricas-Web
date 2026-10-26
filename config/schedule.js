const jobs = [
  {
    id: 'mobile-diario',
    enabled: false,
    startDate: '2026-10-27',
    time: '08:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    devices: ['mobile'],
    pages: ['pagina-integrante-1', 'pagina-integrante-2', 'pagina-integrante-3']
  },
  {
    id: 'desktop-semanal',
    enabled: false,
    startDate: '2026-10-27',
    time: '09:00',
    timezone: 'America/Bogota',
    frequency: 'weekly',
    dayOfWeek: 1,
    devices: ['desktop'],
    pages: ['pagina-integrante-1', 'pagina-integrante-2', 'pagina-integrante-3']
  }
];

module.exports = { jobs };
