const pages = ['voluntariado', 'financiacion', 'internacionalizacion'];

const jobs = [
  {
    id: 'mobile-diario-20',
    enabled: true,
    startDate: '2026-10-29',
    time: '20:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    devices: ['mobile'],
    pages
  },
  {
    id: 'desktop-diario-20',
    enabled: true,
    startDate: '2026-10-29',
    time: '20:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    devices: ['desktop'],
    pages
  },
  {
    id: 'mobile-diario-22',
    enabled: true,
    startDate: '2026-10-29',
    time: '22:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    devices: ['mobile'],
    pages
  },
  {
    id: 'desktop-diario-22',
    enabled: true,
    startDate: '2026-10-29',
    time: '22:00',
    timezone: 'America/Bogota',
    frequency: 'daily',
    devices: ['desktop'],
    pages
  }
];

module.exports = { jobs };
