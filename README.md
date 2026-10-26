# Proyecto de automatización de métricas web

Proyecto académico para evaluar páginas institucionales con **Cypress + Lighthouse**, conservar el historial en JSON y mostrarlo en un informe web.

## Requisitos

- Node.js 20 o superior.
- npm.
- Google Chrome o Chromium para ejecutar Lighthouse desde Cypress.
- Git y acceso al repositorio remoto compartido.

## Instalación

Los comandos son iguales en Windows y macOS:

```bash
npm install
npm run validate:config
```

Antes de ejecutar auditorías, editen `config/pages.js` y sustituyan las tres URL de ejemplo pendientes por tres URL institucionales diferentes. Completen también los nombres de los integrantes.

## Comandos principales

```bash
# Abrir la aplicación de Cypress y seleccionar la prueba manualmente
npm run cy:open

# Ejecutar todas las páginas en móvil y escritorio
npm run cy:run

# Ejecutar un job concreto de la configuración
npm run audit -- --job mobile-diario

# Levantar el informe web en http://localhost:4173
npm run report

# Mantener activo el scheduler local
npm run scheduler
```

El informe debe abrirse mediante `npm run report`, no haciendo doble clic en `report/index.html`, porque el navegador puede bloquear la lectura del JSON cuando se usa `file://`.

## Estructura

```text
config/
  devices.js       # Perfiles mobile y desktop
  pages.js         # URL e integrante responsable
  schedule.js      # Jobs independientes y zona horaria
  thresholds.js    # Rangos configurables de clasificación
cypress/
  e2e/             # Pruebas Lighthouse organizadas por Cypress
  support/         # Comandos y configuración de soporte
data/
  results.json     # Historial generado automáticamente
report/            # Informe web que lee data/results.json
scripts/
  scheduler.js     # Scheduler Node.js con node-cron
  run-audit.js     # Ejecutor compatible con Windows y macOS
  validate-config.js
cypress.config.js  # Integración de cypress-audit y persistencia JSON
```

## Programación

`config/schedule.js` contiene dos jobs independientes: uno móvil y otro de escritorio. Cada job permite configurar habilitación, fecha de inicio, hora, zona horaria, frecuencia, páginas y dispositivos. El archivo solo declara la configuración; `scripts/scheduler.js` es el proceso que realmente registra y ejecuta las tareas.

La zona horaria solicitada por la profesora es `America/Bogota`. GitHub Actions puede ser una alternativa para mantener el scheduler activo, pero sus expresiones cron se interpretan habitualmente en UTC; si se usa esa opción, hay que documentar la conversión y conservar evidencia de las ejecuciones.

## Git y trabajo entre Windows y macOS

No se deben subir `node_modules`, videos, capturas, logs ni configuraciones locales. El repositorio sí debe incluir `package-lock.json`, configuraciones, código, informe y `data/results.json` para conservar el historial.

Ejemplo de creación y publicación del repositorio:

```bash
git init
git add .
git commit -m "chore: crear estructura inicial del proyecto"
git branch -M main
git remote add origin URL_DEL_REPOSITORIO
git push -u origin main
```

Cada integrante debe usar su propia identidad de Git y realizar commits verificables. No es necesario tener una configuración distinta para Windows y macOS: ambos deben ejecutar `npm install` a partir del mismo `package-lock.json`.
