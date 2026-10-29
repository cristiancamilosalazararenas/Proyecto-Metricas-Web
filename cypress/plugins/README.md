# Plugins

La estructura académica de Cypress reserva esta carpeta para integraciones y
tareas personalizadas.

Como el proyecto usa Cypress 10 o posterior, los eventos de Node y las tareas
se configuran en `cypress.config.js`, mediante `setupNodeEvents()`, que es el
mecanismo vigente de Cypress para reemplazar el antiguo archivo de plugins.
