// Los límites se expresan en milisegundos, excepto performance (0 a 100).
const thresholds = {
  firstContentfulPaint: {
    goodMax: 1800,
    needsImprovementMax: 3000
  },
  largestContentfulPaint: {
    goodMax: 2500,
    needsImprovementMax: 4000
  },
  speedIndex: {
    goodMax: 3400,
    needsImprovementMax: 5800
  },
  performance: {
    goodMin: 90,
    needsImprovementMin: 50
  }
};

function classifyMetric(metric, value) {
  if (value == null || !thresholds[metric]) return null;
  const range = thresholds[metric];

  if (metric === 'performance') {
    if (value >= range.goodMin) return 'Bueno';
    if (value >= range.needsImprovementMin) return 'Por mejorar';
    return 'Deficiente';
  }

  if (value <= range.goodMax) return 'Bueno';
  if (value <= range.needsImprovementMax) return 'Por mejorar';
  return 'Deficiente';
}

module.exports = { thresholds, classifyMetric };
