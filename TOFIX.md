# TOFIX

Problemas encontrados durante la migración a arquitectura en capas. No se
corrigieron porque el refactor mantiene el comportamiento actual; varios están
fijados por tests de integración marcados `[comportamiento actual]` o
`[SEGURIDAD - comportamiento actual]`. Cada corrección debería ir en su propio
PR, actualizando ese test.

## Prioridad alta: exposición de datos

- **`GET /api/events/getPublicEvents`** (público, sin token): `shoppingDesignee` se
  devuelve populado completo, incluido el hash de `password` y `verificationCode`.
- **`GET /api/events/getEventById/:id`** (público, sin token): devuelve `organizer`,
  `members`, `chef` y `shoppingDesignee` populados completos, con hashes de
  contraseña. Además expone eventos privados a cualquiera que tenga el id.
- **`GET /api/events/getMembersAndReceiptsInfo/:event`** y
  **`GET /api/events/getMembersAmount/:event`** (públicos, sin token): exponen
  miembros, estado de pagos, montos, CBU y alias de cualquier evento, también de
  los privados.

## Autorización

- **`PUT /api/events/editRoles/:id`**: solo exige `auth`. Cualquier usuario
  autenticado puede cambiar el chef y los designados de compras de cualquier
  evento, incluso asignando a no miembros.
- **`POST /api/events/createEvent`**: el organizador se toma del body, no del JWT.
  Un usuario puede crear eventos a nombre de otro.
- **`PUT /api/events/subscribeToAnEvent/:id/:event`**: cualquiera puede unirse a un
  evento privado si conoce su id.
- **`POST /api/ratings/createRating/:event/:user`**: solo exige `auth`. Un usuario
  autenticado puede crear o cambiar la calificación de otro miembro. Debería exigir
  que `:user` coincida con el usuario del JWT (`sameUser` o tomarlo del token).
- **`PUT /api/purchaseReceipts/assignMembersToReceipt`**: solo exige `auth`.
  Cualquiera puede reasignar los participantes de cualquier recibo de compra, sin
  validar que sea designado del evento ni que los participantes sean miembros.
- **`GET /api/purchaseReceipts/getPurchaseReceiptById/:id/:event`**: valida que el
  usuario sea miembro de `:event`, pero no que el recibo pertenezca a ese evento.
- **`DELETE /api/purchaseReceipts/deletePurchaseReceipt/:id/:event`**: valida que el
  usuario sea designado de `:event`, pero no que el recibo pertenezca a ese evento.
- **`DELETE /api/transferReceipts/deleteTransferReceipt/:id`**: solo exige `auth`.
  Cualquiera puede borrar el comprobante de otro. El middleware
  `transferReceiptOwner` existe pero no se usa en esta ruta.
- **`GET /api/transferReceipts/getTransferReceiptsById/:id`**: solo exige `auth`.
  Cualquier usuario autenticado puede leer cualquier comprobante de transferencia.
- **`PUT /api/transferReceipts/approveTransferReceipt/:id/:event`**: valida que el
  usuario sea designado de `:event`, pero no que el comprobante pertenezca a ese
  evento.

## Validación y respuestas

- **`GET /api/users/hasPendingTransfers/:id`**: con un id mal formado responde 500
  (falla `new ObjectId(id)`) en lugar de 400.
- **`POST /api/ratings/createRating/:event/:user`**: con un `:user` mal formado
  responde 500 en lugar de 400; un `score` fuera de 1–5 responde 500 (error de
  validación de Mongoose) en lugar de 400.
- **`PUT /api/users/editUser/:id`**: `alias` y `cbu` se reemplazan siempre; si el
  cliente no los envía, se borran.
- **`PUT /api/password/verifyCode`**: con código incorrecto responde un string
  suelto (`"Invalid verification code."`) en lugar de `{ message }`, distinto de
  `PUT /api/password/recover`.
- **`GET /api/events/getEventById/:id`**, **`PUT /api/events/editRoles/:id`** y
  **`GET /api/events/getMembersAndReceiptsInfo/:event`**: con un id mal formado o
  un evento inexistente responden 500 en lugar de 400/404.
- **`GET /api/events/getMembersAmount/:event`**: un recibo sin participantes
  produce `amount: null` (división por 0 serializada como `NaN` → `null`).
- **`POST /api/events/createEvent`**: si faltan campos obligatorios responde 500
  (error de validación de Mongoose) en lugar de 400.

## Consistencia de datos

- **Borrado de eventos sin transacción** (`DELETE /api/events/deleteEvent/:id` y la
  limpieza automática al crear un evento): se borran comprobantes, imágenes,
  calificaciones, recordatorios y el evento con llamadas separadas. Un fallo a
  mitad deja documentos huérfanos. Envolverlo en una transacción requiere un
  replica set (Atlas lo tiene; los tests usan `MongoMemoryServer` standalone y
  habría que pasar a `MongoMemoryReplSet`).
- **Limpieza automática al crear un evento**: cuenta solo los eventos públicos
  para decidir si hay más de 6, pero borra eventos terminados o cancelados de
  cualquier privacidad.
