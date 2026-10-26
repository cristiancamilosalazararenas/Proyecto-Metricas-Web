module.exports = {
  mobile: {
    id: 'mobile',
    name: 'Moto G4',
    screenEmulation: 'Moto G4 (412x823)',
    width: 412,
    height: 823,
    lighthouseOptions: {
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1,
        disabled: false
      },
      onlyCategories: ['performance']
    }
  },
  desktop: {
    id: 'desktop',
    name: 'Desktop',
    screenEmulation: 'Desktop (1350x940)',
    width: 1350,
    height: 940,
    lighthouseOptions: {
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false
      },
      onlyCategories: ['performance']
    }
  }
};
