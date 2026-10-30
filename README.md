# Proyecto de automatización de métricas web

Proyecto académico de la Universidad Autónoma de Manizales que evalúa automáticamente el rendimiento de páginas institucionales con **Cypress + Lighthouse**. Los resultados se guardan en un historial JSON, se clasifican con umbrales configurables y se presentan en un **informe web** y en un **spreadsheet (.xlsx)** que se actualiza solo cada vez que se ejecuta un job.

Repositorio: <https://github.com/cristiancamilosalazararenas/Proyecto-Metricas-Web>

## Integrantes y páginas evaluadas

| Integrante | Página | URL |
|---|---|---|
| Cristian Camilo Salazar Arenas | Voluntariado UAM | <https://www.autonoma.edu.co/voluntariado> |
| Cristian Camilo Salazar Arenas | Financiación de estudios | <https://www.autonoma.edu.co/financiacion> |
| Isabela Quintero Murillo | Internacionalización | <https://www.autonoma.edu.co/internacionalizacion> |

El grupo tiene dos integrantes: Cristian es responsable de las dos primeras URL e Isabela de la tercera. Las tres URL son distintas y están registradas en [`config/pages.js`](config/pages.js).

## Requisitos

- Node.js 20 o superior y npm.
- **Google Chrome** (o Chromium). Lighthouse no se ejecuta en el navegador Electron de Cypress, por eso todos los comandos usan `--browser chrome`.
- Git.

## Instalación

Los comandos son iguales en Windows y macOS:

```bash
git clone https://github.com/cristiancamilosalazararenas/Proyecto-Metricas-Web.git
cd Proyecto-Metricas-Web
npm install
npm run validate:config
```

`validate:config` comprueba que existan tres URL diferentes, los perfiles móvil y escritorio, y que cada job tenga frecuencia, hora y zona horaria válidas.

## Configuración

Toda la configuración está separada en `config/`. Para agregar una página o un dispositivo solo se edita el archivo correspondiente; la lógica de las pruebas no se duplica.

| Archivo | Qué contiene |
|---|---|
| [`config/pages.js`](config/pages.js) | `id`, nombre, responsable, descripción y URL de cada página. |
| [`config/devices.js`](config/devices.js) | Perfiles genéricos de dispositivo: **móvil** Moto G4 (412x823) y **escritorio** (1350x940), con sus opciones de Lighthouse. |
| [`config/schedule.js`](config/schedule.js) | Jobs programados: habilitado, fecha de inicio, hora, zona horaria, frecuencia (`once`, `daily`, `weekly`), dispositivos y páginas. |
| [`config/thresholds.js`](config/thresholds.js) | Umbrales de clasificación, en un solo lugar. Los usan Cypress, el spreadsheet y el informe. |

### Umbrales de clasificación

Los tiempos se guardan en milisegundos en el JSON y se muestran en segundos en el informe y el spreadsheet. Los intervalos no se solapan.

| Métrica | ✔ Bueno | ▲ Por mejorar | ✖ Deficiente |
|---|---|---|---|
| FCP | ≤ 1,8 s | > 1,8 s y ≤ 3 s | > 3 s |
| LCP | ≤ 2,5 s | > 2,5 s y ≤ 4 s | > 4 s |
| Speed Index | ≤ 3,4 s | > 3,4 s y ≤ 5,8 s | > 5,8 s |
| Performance | 90–100 | 50–89 | 0–49 |

Las etiquetas llevan símbolo (✔ ▲ ✖) además de color, para que no dependan solo del color.

### Agregar una página o un dispositivo

1. Añadir un objeto en `config/pages.js` (o en `config/devices.js`).
2. Incluir su `id` en el arreglo `pages` (o `devices`) de los jobs de `config/schedule.js` que deban evaluarlo.
3. Ejecutar `npm run validate:config`.

La prueba [`cypress/e2e/lighthouse.cy.js`](cypress/e2e/lighthouse.cy.js) genera dinámicamente un caso por cada combinación página × dispositivo.

## Ejecución

```bash
# Ejecutar un job concreto (todas sus páginas y dispositivos)
npm run audit -- --job mobile-diario-20 --browser chrome

# Ejecutar un job solo para una página
npm run audit -- --job desktop-diario-20 --page internacionalizacion --browser chrome

# Ejecutar todas las páginas en móvil y escritorio sin job
npm run audit -- --browser chrome

# Abrir Cypress de forma interactiva
npm run cy:open

# Regenerar el spreadsheet a partir del JSON
npm run spreadsheet

# Abrir el informe web en http://localhost:4173/report/
npm run report
```

Cada `npm run audit`:

1. Ejecuta Cypress + Lighthouse en Chrome.
2. Agrega cada medición a `data/results.json` (también si falla, con `status: "error"`).
3. Registra la ejecución del job en `data/job-runs.json`.
4. Actualiza `spreadsheet/metricas-web.xlsx`.

## Programación de jobs (scheduler)

[`config/schedule.js`](config/schedule.js) solo **declara** los jobs. El que los ejecuta es [`scripts/scheduler.js`](scripts/scheduler.js), un proceso de Node.js que usa **node-cron** con la zona horaria `America/Bogota`.

| Job | Hora (Bogotá) | Frecuencia | Dispositivo | Páginas |
|---|---|---|---|---|
| `mobile-diario-20` | 20:00 | diaria desde 2026-10-29 | móvil | las 3 |
| `desktop-diario-20` | 20:00 | diaria desde 2026-10-29 | escritorio | las 3 |
| `mobile-diario-22` | 22:00 | diaria desde 2026-10-29 | móvil | las 3 |
| `desktop-diario-22` | 22:00 | diaria desde 2026-10-29 | escritorio | las 3 |

Los jobs están separados por **dispositivo** (programaciones independientes para móvil y escritorio, como pide el enunciado) y no por URL. Así cada página se mide en móvil y escritorio dos veces al día, y una página nueva se evalúa solo con agregarla a `pages`, sin crear jobs nuevos.

### Iniciar y mantener activo el scheduler

```bash
npm run scheduler
```

- El proceso muestra los jobs registrados y queda esperando. **La terminal debe permanecer abierta y el computador encendido, sin suspensión**; si no, los jobs de esa hora no se ejecutan.
- En macOS se puede evitar la suspensión mientras corre con `caffeinate -i npm run scheduler`. En Windows, configurar "Suspender: Nunca" en las opciones de energía mientras se esperan los jobs.
- Si dos jobs coinciden a la misma hora (móvil y escritorio a las 20:00), el scheduler los ejecuta **en cola, uno después del otro**. Así dos Chrome no compiten por CPU y red, porque eso alteraría las métricas.
- Para probar el scheduler sin esperar la hora programada:

  ```bash
  npm run scheduler -- --run-now all              # los 4 jobs, en cola
  npm run scheduler -- --run-now mobile-diario-20 # un job
  ```

  Las ejecuciones que lanza el scheduler quedan registradas con origen `scheduler`; las de `npm run audit` quedan con origen `manual`.

**Retrasos y alternativas.** node-cron dispara la tarea en el minuto exacto, pero si el equipo está suspendido la ejecución se pierde (no se recupera después). GitHub Actions es una alternativa que no depende del computador, pero interpreta el cron en **UTC**: las 20:00 de Bogotá (UTC−5) serían `0 1 * * *` y las 22:00 serían `0 3 * * *`, y sus ejecuciones programadas pueden retrasarse varios minutos.

## Datos: `data/results.json`

Cada ejecución agrega un registro y conserva el historial:

```json
{
  "url": "https://www.autonoma.edu.co/internacionalizacion",
  "screenEmulation": "Moto G4 (412x823)",
  "timestamp": "2026-10-30T04:58:12.020Z",
  "pageId": "internacionalizacion",
  "pageName": "Internacionalización",
  "owner": "Isabela Quintero Murillo",
  "deviceId": "mobile",
  "job": "mobile-diario-20",
  "firstContentfulPaint": 942.3,
  "largestContentfulPaint": 950.3,
  "speedIndex": 1699,
  "performance": 100,
  "status": "ok",
  "error": null,
  "opportunities": [
    {"id": "modern-image-formats", "title": "Publica imágenes con formatos de próxima generación", "savingsMs": 1930}
  ],
  "classification": {
    "firstContentfulPaint": "Bueno",
    "largestContentfulPaint": "Bueno",
    "speedIndex": "Bueno",
    "performance": "Bueno"
  }
}
```

- Los tiempos son números en milisegundos y `performance` va de 0 a 100.
- Si una evaluación falla, se guarda con `status: "error"` y el mensaje en `error`.
- `job` indica qué job generó la medición. Las mediciones anteriores a que existiera este campo aparecen como `null` ("sin registro").
- `opportunities` guarda las tres oportunidades de Lighthouse con mayor ahorro estimado (solo las que no aprueban). Son la base de las recomendaciones.
- La escritura usa un archivo de bloqueo para que dos procesos no corrompan el JSON.

`data/job-runs.json` guarda cada ejecución de job: job, origen, inicio, fin, páginas, dispositivos, mediciones nuevas, errores y estado.

## Spreadsheet: `spreadsheet/metricas-web.xlsx`

[`scripts/export-spreadsheet.js`](scripts/export-spreadsheet.js) genera el archivo con **exceljs** y se ejecuta automáticamente al terminar cada job. Se eligió `.xlsx` porque abre en Excel, LibreOffice y Google Sheets sin credenciales ni servicios externos, y queda versionado en el repositorio como evidencia.

| Hoja | Contenido |
|---|---|
| Resumen | Última medición y promedio por página y dispositivo, con clasificación por colores y etiquetas, y fecha y job de la última actualización. |
| Historial | Todas las mediciones (tiempos en segundos, fecha en hora de Bogotá, job, responsable, estado y error). |
| Móvil vs Escritorio | Promedios de Performance y LCP por dispositivo y la diferencia. |
| Ejecuciones de jobs | Registro de cada job: origen (scheduler o manual), inicio, fin, duración, mediciones nuevas y estado. |
| Umbrales | Rangos de clasificación tomados de `config/thresholds.js`. |

Si el archivo está abierto en Excel (Windows lo bloquea) cuando termina un job, el job no falla: el JSON queda guardado y basta cerrar Excel y ejecutar `npm run spreadsheet`.

## Informe web

```bash
npm run report
```

Se abre en <http://localhost:4173/report/> y lee `data/results.json` y `data/job-runs.json` en cada carga. No debe abrirse con doble clic (`file://`), porque el navegador bloquea la lectura del JSON. El informe muestra:

- Filtros por página, dispositivo y job.
- Resumen: mediciones, correctas, con error, Performance promedio y última medición.
- Estado actual por página y dispositivo, con responsable y promedio.
- Mejor y peor rendimiento, y diferencias entre móvil y escritorio.
- Comparación con la ejecución anterior (Performance y LCP).
- Recomendaciones de mejora por página.
- Ejecuciones de jobs, errores registrados e historial completo.
- Tabla de umbrales.

## Evidencias

Están en [`evidencias/`](evidencias/):

| Archivo | Qué demuestra |
|---|---|
| `01-informe-web-escritorio.png` | Informe web completo con clasificación, comparaciones, recomendaciones y jobs. |
| `02-informe-web-movil.png` | El mismo informe en un ancho de móvil (412 px). |
| `03-spreadsheet-resumen-y-jobs.png` | Hojas Resumen, Móvil vs Escritorio, Ejecuciones de jobs y Umbrales del `.xlsx` después de los jobs. |
| `04-spreadsheet-historial.png` | Hoja Historial del `.xlsx`. |
| `05-log-ejecucion-4-jobs.txt` | Salida del scheduler ejecutando los 4 jobs en cola: 12 de 12 pruebas correctas y spreadsheet actualizado tras cada job. |
| `06-log-scheduler-cron-cola.txt` | Prueba del cron real: dos jobs programados a las 23:56 (America/Bogota) se dispararon solos y se ejecutaron en cola. |

Las imágenes del spreadsheet son una vista generada a partir del archivo `.xlsx` (contenido y colores de sus celdas). Se recomienda añadir también una captura del archivo abierto en Excel después de un job de las 20:00 o 22:00.

## Análisis de resultados

Datos de `data/results.json` al 30/10/2026: 41 mediciones correctas y 0 errores.

| Página | Dispositivo | Mediciones | Performance promedio (mín.–máx.) | FCP prom. | LCP prom. | Speed Index prom. |
|---|---|---|---|---|---|---|
| Internacionalización | Móvil | 10 | 87,9 (57–100) | 1,11 s | 1,20 s | 2,87 s |
| Internacionalización | Escritorio | 8 | 82,3 (60–95) | 1,00 s | 1,05 s | 2,19 s |
| Voluntariado | Móvil | 8 | 78,9 (69–98) | 1,46 s | 1,54 s | 1,94 s |
| Voluntariado | Escritorio | 4 | 77,0 (59–95) | 1,20 s | 1,49 s | 1,23 s |
| Financiación | Móvil | 7 | 74,4 (59–100) | 1,29 s | 1,39 s | 3,66 s |
| Financiación | Escritorio | 4 | 71,5 (56–89) | 1,04 s | 1,09 s | 4,30 s |

**Mejor y peor rendimiento.**

- **Mejor:** Internacionalización en móvil, con 87,9 de promedio y 100/100 en las últimas mediciones.
- **Peor:** Financiación en escritorio, con 71,5 de promedio. Su Speed Index quedó en "Por mejorar" en 8 de sus 11 mediciones (3,5–4,9 s); en Internacionalización eso pasó solo 2 veces y en Voluntariado ninguna.

**Diferencias entre dispositivos.**

- En las tres páginas, el escritorio obtiene un Performance promedio entre 2 y 6 puntos menor que el móvil, aunque su FCP y su LCP son menores (más rápidos).
- La explicación más probable es el Speed Index y el trabajo de JavaScript: en escritorio Lighthouse carga más contenido visible y scripts. En Financiación, el Speed Index de escritorio (4,30 s) es peor que el de móvil (3,66 s).

**Variabilidad.**

- Las mediciones de la tarde del 29/10 (alrededor de las 18:00, en el equipo de Cristian) tienen un promedio de 65,8. Las de la noche (alrededor de las 23:00, en el equipo de Isabela) tienen un promedio de 93,7.
- La diferencia combina dos factores: la carga del servidor y de la red a distintas horas, y el hardware de cada equipo.
- Por eso las comparaciones deben hacerse entre ejecuciones del mismo job, el mismo equipo y la misma hora. Para eso existen los jobs fijos de las 20:00 y 22:00 y la cola secuencial del scheduler.

### Recomendaciones de mejora

Según las oportunidades que reportó Lighthouse en las últimas mediciones:

- **Financiación de estudios:** habilitar la compresión de texto (gzip/brotli) en el servidor, con un ahorro estimado de 3,9 a 4,8 s, y reducir el JavaScript no utilizado (ahorro de 1,8 a 4,9 s). Son la causa principal de su Speed Index alto.
- **Internacionalización:** servir las imágenes en formatos modernos como WebP o AVIF (ahorro de 0,9 a 2,1 s), codificarlas de forma eficiente (0,9 s) y habilitar la compresión de texto (0,6 a 0,75 s).
- **Voluntariado UAM:** reducir el JavaScript no utilizado (ahorro de 0,3 a 0,45 s), por ejemplo cargando de forma diferida los scripts que no se necesitan al inicio.
- **General (las tres páginas comparten plataforma):** activar la compresión de texto en todo el sitio, revisar los scripts de terceros que se cargan en todas las páginas y usar imágenes responsivas con `srcset`, para que el móvil no descargue imágenes de escritorio.

El informe web recalcula estas recomendaciones con cada ejecución nueva.

## Estructura

```text
config/
  devices.js          # Perfiles móvil y escritorio
  pages.js            # URL, nombre y responsable
  schedule.js         # Jobs independientes y zona horaria
  thresholds.js       # Rangos de clasificación configurables
cypress/
  e2e/lighthouse.cy.js  # Casos dinámicos página × dispositivo
  fixtures/           # Datos estáticos de prueba
  plugins/            # Reservado por la estructura académica (Cypress 10+ usa cypress.config.js)
  support/            # Comandos de cypress-audit y carga global
data/
  results.json        # Historial de mediciones (versionado)
  job-runs.json       # Historial de ejecuciones de jobs (versionado)
evidencias/           # Capturas y logs de ejecución
report/               # Informe web (HTML, CSS, JS)
scripts/
  run-audit.js        # Ejecuta Cypress, registra el job y actualiza el spreadsheet
  scheduler.js        # Scheduler node-cron con cola secuencial y --run-now
  export-spreadsheet.js # Genera spreadsheet/metricas-web.xlsx
  validate-config.js  # Valida la configuración
  lib/history.js      # Lectura y escritura de JSON con bloqueo
spreadsheet/
  metricas-web.xlsx   # Spreadsheet actualizado tras cada job (versionado)
cypress.config.js     # Integración de @cypress-audit/lighthouse y persistencia JSON
```

## Git y trabajo en equipo

- Cada integrante trabaja con su propia identidad de Git y hace commits verificables con prefijos convencionales (`feat:`, `fix:`, `docs:`).
- No se suben `node_modules`, videos ni capturas automáticas de Cypress, logs ni archivos `.env`. Sí se versionan `package-lock.json`, `data/results.json`, `data/job-runs.json`, `spreadsheet/metricas-web.xlsx` y `evidencias/`.
- Antes de subir cambios: `git pull --rebase origin main`. Los JSON solo crecen al final, así que los conflictos se resuelven conservando los registros de ambos lados.
- Funciona igual en Windows y macOS: ambos ejecutan `npm install` con el mismo `package-lock.json`, y los scripts usan `npx.cmd` y `npm.cmd` en Windows.
