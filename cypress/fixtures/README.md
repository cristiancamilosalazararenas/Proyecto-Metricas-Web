# Fixtures

Esta carpeta contiene datos estáticos que las pruebas puedan cargar mediante
`cy.fixture()`, por ejemplo JSON de apoyo para una prueba.

Las páginas, dispositivos, jobs y umbrales del proyecto no se duplican aquí:
se mantienen en `config/` para que la lógica de auditoría sea reutilizable.
