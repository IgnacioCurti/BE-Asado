# Tests

Suite de caracterización: fija el comportamiento **actual** de la API para poder
migrarla (de base de datos, ORM o framework) y verificar que nada cambió sin querer.

```bash
npm test                  # todo
npm run test:unit         # sin base de datos
npm run test:integration  # Mongo en memoria (mongodb-memory-server)
npm run test:coverage
```

La primera corrida de integración descarga MongoDB 7.0.14 (~600 MB, queda cacheado).
Los tests nunca usan el `.env`: `vitest.config.ts` define todas las variables, y
`tests/setup/integration.ts` aborta si `DATABASE_URL` no apunta a la base en memoria.

## Estructura

| Carpeta | Qué contiene |
|--|--|
| `unit/` | Funciones puras: cálculo de deudas (`assignEventValues`, `calculateTransfersInfo`), `isValidId`, `sendEmail`, templates, middlewares `auth`/`sameUser`, validaciones de los schemas |
| `integration/` | Cada endpoint por HTTP (supertest) contra Mongo real, más un flujo end-to-end (`flow.test.ts`) |
| `helpers/fixtures.ts` | **Única** capa que toca Mongoose: sembrar datos e inspeccionar efectos |
| `helpers/mailer.ts` | Doble de Brevo: intercepta `https.request` y guarda los mails "enviados" en `sentEmails` |
| `helpers/api.ts` | Cliente supertest y archivos de prueba (PNG/JPEG/PDF) |

## Etiquetas en los nombres de los tests

- **`[comportamiento actual]`**: se fija tal cual, aunque sea discutible (p. ej. un id mal formado devuelve 500 en vez de 400).
- **`[BUG - comportamiento actual]`**: comportamiento claramente incorrecto. Si la migración lo corrige, hay que invertir el test a propósito, no "arreglarlo" para que pase.
- **`[SEGURIDAD - comportamiento actual]`**: fuga de datos o falta de autorización.

Todo lo que no tiene etiqueta es el contrato esperado y debería mantenerse igual.

## Cómo usar la suite en la migración

1. **Cambio de base de datos u ORM**: reimplementar `helpers/fixtures.ts` con las mismas
   firmas (los ids salen siempre como string), reemplazar `setup/mongoGlobalSetup.ts` y la
   limpieza de colecciones en `setup/integration.ts`. Los tests de `integration/` no
   deberían necesitar cambios. `unit/models/models.test.ts` es específico de Mongoose: hay
   que portar esas reglas de validación a la nueva capa.
2. **Cambio de framework HTTP**: `helpers/api.ts` solo necesita un handler compatible con
   supertest. `unit/middleware/` y `integration/middleware.test.ts` llaman a los
   middlewares de Express directamente; se reescriben o se borran si las rutas ya
   cubren el mismo comportamiento.
3. **Respuestas**: los tests comparan contra JSON (`_id` y `__v` incluidos). Si la nueva
   implementación cambia la forma del documento (p. ej. `id` en vez de `_id`), conviene
   agregar un adaptador en `helpers/api.ts` en lugar de tocar cada test.

Los cálculos de recordatorios usan hora local; la suite corre con `TZ=UTC`.
