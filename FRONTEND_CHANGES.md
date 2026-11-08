# Cambios de API que requieren adaptar el front

Cambios de comportamiento de la API. Para cada uno se detalla qué cambia, por qué y cómo habría que adaptar el front. Los errores siguen usando el formato `{ message: string }`.

También se registran, a modo **informativo**, los cambios del backend que modifican el comportamiento pero no requieren tocar el front.

Cada entrada indica:
- **Estado:** **pendiente** (decidido, pero todavía no implementado en el backend) o **implementado** (ya está en el backend; indicar rama o commit).
- **Requiere cambios en el front:** **sí** (el front tiene que adaptarse), **recomendado** (no se rompe nada, pero conviene ajustarlo) o **no** (solo informativo).

---

## 1. Opciones de votación: permisos y endpoint propio para votar

**Estado:** implementado (`8bf02d4`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** sí · **Origen:** WORKTODO B1

### Por qué
Hoy cualquier usuario autenticado puede crear, editar o borrar opciones de votación de **cualquier** evento. Además, `editOption` reemplaza la lista `participants` entera, así que un usuario puede agregar o sacar votos de otras personas. A partir de ahora:
- Solo el **organizador** o un **comprador** (`shoppingDesignee`) del evento administran las opciones (crear, renombrar, borrar).
- Cada miembro vota **solo por sí mismo**, a través de un endpoint propio.

### Qué cambia

| Endpoint | Antes | Después |
|--|--|--|
| `POST /api/options/createOption/:event` | Cualquier usuario autenticado. Body `{ title, participants }`. Si el evento no existía, igual creaba la opción (201). | Solo organizador o comprador de `:event` (si no, **403**; si el evento no existe, **404**). Body `{ title }`: **`participants` se ignora** y la opción arranca sin votos. |
| `PUT /api/options/editOption/:id` | Cualquier usuario autenticado. Body `{ title, participants }`, reemplaza ambos. | Solo organizador o comprador del evento de la opción (**403** si no). Body `{ title }`: **`participants` se ignora**. Sirve solo para renombrar. |
| `DELETE /api/options/deleteOption/:id` | Cualquier usuario autenticado. | Solo organizador o comprador del evento de la opción (**403** si no). |
| `PUT /api/options/vote/:id` | — (nuevo) | Agrega al usuario del token a los votantes de la opción. Tiene que ser miembro del evento (**403** si no). Es idempotente: votar dos veces no duplica. Responde **200** con la opción actualizada. |
| `DELETE /api/options/vote/:id` | — (nuevo) | Quita el voto del usuario del token. Es idempotente. Responde **200** con la opción actualizada. |
| `GET /api/options/getMembersWhoHaventVoted/:event` | Sin cambios. | Sin cambios. |

En los endpoints de opciones, un id mal formado responde **400** (antes, 500), y una opción cuyo evento ya no existe responde **404**.

Se mantiene la semántica actual: un miembro puede votar en más de una opción del mismo evento. Si se quiere voto único, es una decisión aparte.

### Cómo adaptar el front (probable)
- **Votar o desvotar:** donde hoy se arma la lista `participants` (agregando o quitando al usuario actual) y se llama a `editOption`, pasar a llamar a `PUT /api/options/vote/:id` para votar y a `DELETE /api/options/vote/:id` para quitar el voto. Ya no hace falta mandar la lista completa.
- **Crear opción:** dejar de mandar `participants`. Si hoy el creador queda votando su propia opción al crearla, hacer un `PUT /vote/:id` después del alta.
- **Mostrar acciones de administración** (crear, renombrar, borrar) solo si el usuario es organizador o comprador del evento, y manejar el **403** igual.
- **Renombrar:** `editOption` sigue existiendo, pero solo con `{ title }`.
- Usar la opción que devuelve la respuesta para refrescar el estado local, en vez de reconstruirlo a mano.

---

## 2. Imágenes: acceso restringido a los comprobantes

**Estado:** implementado (`4f04694`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (opcional: placeholder para 403/404) · **Origen:** WORKTODO B2

### Por qué
Hoy `GET /api/images/getImage/:id` le devuelve cualquier imagen a cualquier usuario logueado, incluidas las de comprobantes de transferencia y de compra de eventos ajenos, que pueden mostrar datos bancarios.

### Qué cambia

| Tipo de imagen | Antes | Después |
|--|--|--|
| Foto de perfil de un usuario | Visible para cualquier logueado | Sin cambios |
| Imagen de un comprobante de compra o de transferencia | Visible para cualquier logueado | Solo para miembros del evento del comprobante; el resto recibe **403** |
| Imagen que no está asociada a ningún perfil ni comprobante | 200 | **404** |
| Imagen inexistente | **400** | **404** (`"No image was found."`) |

La URL y el formato de la respuesta (el binario con su `Content-Type`) no cambian.

### Cómo adaptar el front (probable)
- En principio no hace falta cambiar nada: el front solo pide imágenes de comprobantes dentro de eventos en los que el usuario es miembro.
- Conviene manejar el **403** y el **404** de `getImage` mostrando un placeholder en vez de la imagen rota, por ejemplo si un usuario se desuscribe de un evento y vuelve a una vista cacheada.

---

## 3. Consultas de deuda y costo: solo sobre uno mismo

**Estado:** implementado (`d758f7b`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** solo si alguna vista consulta a otro usuario (hay que verificarlo) · **Origen:** WORKTODO B3 (y el ítem de `isDebtor` de la sección 5)

### Por qué
Hoy cualquier usuario logueado puede consultar en qué eventos debe plata otra persona, si otro comprador tiene pagos pendientes de aprobar y cuánto le toca pagar a cualquier miembro.

### Qué cambia

| Endpoint | Antes | Después |
|--|--|--|
| `GET /api/users/isDebtor/:id` | Cualquier `:id` | Solo si `:id` es el usuario del token; si no, **403** |
| `GET /api/users/hasPendingTransfers/:id` | Cualquier `:id` | Solo si `:id` es el usuario del token; si no, **403** |
| `GET /api/events/getMemberIndividualCost/:user/:event` | Cualquier `:user` | Si `:user` es el usuario del token, o si quien consulta es organizador o comprador de `:event`; si no, **403** |

Las respuestas exitosas no cambian. En `isDebtor` y `hasPendingTransfers`, un id mal formado ahora responde **400** (antes, 500).

### Cómo adaptar el front (probable)
- Verificar que estas llamadas siempre usen el id del usuario logueado (el del login o el token), no el de otro usuario que aparezca en pantalla.
- Si alguna vista de organizador o comprador muestra la deuda de **otro** usuario usando `isDebtor` o `hasPendingTransfers`, pasarla a `GET /api/events/getMembersAndReceiptsInfo/:event`, que ya da por evento quién subió comprobante y si está aprobado.
- Manejar el **403** como cualquier error de permisos.

---

## 4. Comprobante de transferencia: el backend calcula a quién y cuánto

**Estado:** implementado (`e3a23e5` + `036c209`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** recomendado (los campos que se ignoran no rompen nada; sí hay que manejar los nuevos 400 y 403) · **Origen:** WORKTODO B4, 2.2 (comprobante en nombre de otro, autoaprobación) y A15

### Por qué
Hoy `POST /api/transferReceipts/createTransferReceipt/:event` arma el comprobante a partir del body (`new TransferReceipt(req.body)`). Por eso un usuario puede:
- crearlo en nombre de otro (`user`);
- autoaprobarse (`hasPaid: true`);
- elegir cualquier `receiver`, lo que le genera una "transferencia pendiente" a quien quiera;
- declarar cualquier `amount`.

Además, cualquier usuario logueado puede crearlo, aunque no sea miembro del evento.

### Qué cambia

| Campo o regla | Antes | Después |
|--|--|--|
| Quién puede crear | Cualquier usuario logueado | Solo miembros de `:event` (**403** si no) |
| `user` | Del body | Siempre el usuario del token; el del body se ignora |
| `hasPaid` | Del body | Siempre `false`; el del body se ignora |
| `receiver` | Del body | Lo calcula el backend (a quién le tiene que transferir ese usuario); el del body se ignora |
| `amount` | Del body | Lo calcula el backend (cuánto tiene que transferir); el del body se ignora |
| Usuario que no tiene que transferir nada | Se creaba igual | **400** |
| `description`, `paymentMethod` | Del body | Sin cambios |

La respuesta (**201** con el comprobante creado) no cambia de forma; los valores de `receiver` y `amount` pasan a ser los calculados.

### Cómo adaptar el front (probable)
- Dejar de mandar `user`, `receiver`, `amount` y `hasPaid`; alcanza con `description` y `paymentMethod`. Mandarlos no rompe nada, pero se ignoran.
- Si el formulario deja editar el monto o elegir el destinatario, pasarlos a solo lectura: mostrar los datos de `GET /api/events/getMembersAmount/:event` (receptor, CBU o alias, monto) y usar la respuesta de la creación para confirmar.
- Para usuarios que no tienen que transferir, no mostrar el botón de subir comprobante y manejar el **400**.
- Manejar el **403** si un no miembro intenta crear un comprobante.

---

## 5. Estados del evento: transiciones válidas

**Estado:** implementado (`8af29ab`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo; opcional: ofrecer solo las transiciones válidas) · **Origen:** WORKTODO B5

### Por qué
Hoy `PUT /api/events/editEvent/:id` acepta cualquier `state`. Eso permite, por ejemplo, reabrir un evento `finished` o pasar a `readyforpayment` sin comprobantes de compra, y deja datos inconsistentes (deudas calculadas sobre nada, eventos terminados que vuelven a aceptar miembros).

### Qué cambia
`editEvent` valida la transición desde el estado actual hacia el `state` del body. Mandar el **mismo** estado que ya tiene el evento sigue permitido (editar otros campos sin cambiar el estado).

| Desde \ Hacia | available | closed | readyforpayment | cancelled | finished |
|--|--|--|--|--|--|
| **available** | = | ✅ | ❌ | ✅ | ❌ |
| **closed** | ✅ | = | ✅ (con ≥ 1 comprobante de compra) | ✅ | ❌ |
| **readyforpayment** | ❌ | ✅ (si no hay transferencias aprobadas) | = | ❌ | ❌ |
| **cancelled** | ❌ | ❌ | ❌ | = | ❌ |
| **finished** | ❌ | ❌ | ❌ | ❌ | = |

- `finished` lo pone **solo el sistema**, cuando se aprueba el último pago. No se puede mandar desde `editEvent`.
- `cancelled` y `finished` son estados finales.
- Una transición inválida responde **400** con `"Cannot change the event state from \"<actual>\" to \"<pedido>\"."`. Las condiciones dan, también con **400**, `"The event needs at least one purchase receipt to be ready for payment."` o `"The event can't go back to closed because some payments were already approved."`. Un `state` desconocido (antes, 500) entra en el primer caso.

### Cómo adaptar el front (probable)
- No hace falta: el flujo normal (abrir, cerrar, pasar a pago) sigue funcionando igual.
- Opcional: en el selector de estado, ofrecer solo las transiciones válidas según la tabla, y mostrar el `message` del 400 si el backend rechaza una.

---

## 6. Edición de perfil (`editUser`)

**Estado:** implementado (`926613e`, rama `fix/worktodo-bugs`; `alias`/`cbu` quedan pendientes del front) · **Requiere cambios en el front:** recomendado (`alias`/`cbu`) · **Origen:** WORKTODO B6

### Por qué
`PUT /api/users/editUser/:id` trata los campos omitidos de forma inconsistente:
- `name`, `lastName` y `notifications` conservan su valor si no vienen.
- `alias`, `cbu` y `alternativeEmail` se **borran** si no vienen.
- Si falta `specialDiet`, responde **500**.

### Qué cambia

| Campo | Antes | Después |
|--|--|--|
| `specialDiet` omitido | **500** | Se conserva el valor actual (200) |
| `alias`, `cbu` omitidos | Se borran | Por ahora, sin cambios (se siguen borrando) |
| `alias`, `cbu` con `""` o `null` | Se borran | Se borran (sin cambios) |
| `name`, `lastName`, `notifications` | Omitido = no cambia | Sin cambios |
| `alternativeEmail` | Omitido = se borra | Se elimina el campo: ver §9 |

### Cómo adaptar el front (probable)
- **Recomendado:** para borrar `alias` o `cbu`, mandar el campo vacío explícitamente (`""` o `null`) en vez de omitirlo. Cuando el front lo haga, el backend va a pasar a tratar "omitido" como "no cambia" para estos campos, y esa será una nueva entrada en este documento.
- `specialDiet` ya no hace falta mandarlo si no cambia, aunque mandarlo sigue funcionando.

---

## 7. Registro abierto a cualquier email válido

**Estado:** implementado (`38565e6`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** recomendado (si el front valida el dominio) · **Origen:** WORKTODO B7

### Por qué
Hoy el backend solo acepta emails `@endava.com`, más una excepción hardcodeada para una cuenta puntual. Se decidió abrir el registro a cualquier email válido.

### Qué cambia

| Caso | Antes | Después |
|--|--|--|
| `POST /api/users/register` con un email de otro dominio (ej. `@gmail.com`) | **500** con `"<email> is not a valid endava email."` | **201**, se registra |
| Email con formato inválido (sin `@`, sin dominio, con espacios) | Error de validación | Error de validación con mensaje `"<email> is not a valid email."` |

El email sigue siendo único y se sigue guardando en minúsculas. Login, recuperación de contraseña y el resto de los endpoints no cambian.

### Cómo adaptar el front (probable)
- Si el formulario de registro valida que el email termine en `@endava.com`, o muestra un texto del estilo "usá tu email de Endava", sacar esa validación o ese texto.
- Si el front busca el texto `"not a valid endava email"` para mostrar un error, pasar a mostrar el `message` del backend o a buscar `"not a valid email"`.

---

## 8. Mails de "nuevo evento" asincrónicos

**Estado:** implementado (`92ad52f`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO B8

### Por qué
Hoy `POST /api/events/createEvent` manda el mail de "nuevo evento" a cada usuario suscripto, uno por uno, **antes** de responder. Con muchos usuarios la creación tarda y en Vercel puede cortarse por timeout.

### Qué cambia
- `createEvent` responde apenas guarda el evento.
- Los mails se mandan en la siguiente ejecución del cron (`GET /api/cron/reminderCheck`), así que llegan con el retraso propio del cron en vez de al instante.
- Si el evento se borra, se cancela o pasa a privado antes de que corra el cron, el mail no se manda.

La respuesta de `createEvent` no cambia.

### Cómo adaptar el front (probable)
- No hace falta. La creación de eventos va a responder más rápido.

---

## 9. Se elimina `alternativeEmail`

**Estado:** implementado (`06f6799`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** sí (sacar el campo de la UI) · **Origen:** WORKTODO B10 (y B6)

### Por qué
Como ahora el registro acepta cualquier email (§7), el email alternativo deja de tener sentido: quien quiera recibir los mails en otra dirección se registra con esa. Se elimina el campo para simplificar los mails y la recuperación de contraseña.

### Qué cambia

| Lugar | Antes | Después |
|--|--|--|
| Respuestas que devuelven usuarios (`register`, `editUser`, `getUsers`, `getUserById`, `deleteUser`, miembros poblados de eventos, etc.) | Incluyen `alternativeEmail` | **Ya no incluyen el campo** (salvo usuarios viejos que todavía lo tengan guardado en la base, hasta que se reinicie; no conviene depender de que venga) |
| `POST /api/users/register` y `PUT /api/users/editUser/:id` | Aceptan `alternativeEmail` | Si viene, se **ignora en silencio** (no da error) |
| Mails de notificación (nuevo evento, inicio de evento, penalización) | Van al alternativo si existe | Van siempre al `email` principal |
| `POST /api/password/forgot` | Busca al usuario también por el alternativo y le manda el código ahí | Busca solo por `email` y manda el código ahí. Con un email alternativo responde **404** ("User does not exist.") |

### Cómo adaptar el front (probable)
- Sacar el campo "email alternativo" de los formularios de registro y de edición de perfil, y de cualquier vista de perfil que lo muestre.
- Dejar de mandar `alternativeEmail` en los bodies. Mandarlo no rompe nada, pero no tiene efecto.
- Revisar textos de la UI del estilo "te enviaremos el mail a tu email alternativo".
- Si algún tipo o modelo del front (por ejemplo, una interfaz `User`) tiene `alternativeEmail`, marcarlo como opcional o eliminarlo, para no depender de que venga en la respuesta.

---

## 10. `getMemberIndividualCost` redondea a centavos

**Estado:** implementado (`ef199da`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO A8

### Por qué
`GET /api/events/getMemberIndividualCost/:user/:event` sumaba las partes sin redondear (por ejemplo, `58.333333…`), mientras que `getMembersAmount` redondea cada parte a centavos. El costo individual podía diferir en centavos del monto a transferir.

### Qué cambia
`userAmount` ahora es la suma de las partes redondeadas a 2 decimales (`58.33` en el ejemplo), igual que el cálculo de transferencias.

### Cómo adaptar el front (probable)
- No hace falta. Si el front redondeaba o formateaba el valor por su cuenta, puede seguir haciéndolo.

---

## 11. Subida de archivos a comprobantes: solo el dueño

**Estado:** implementado (`cb6b342`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (manejar los nuevos códigos de error) · **Origen:** WORKTODO A13

### Por qué
Cualquier usuario logueado podía reemplazar la imagen de cualquier comprobante, incluso uno ya aprobado.

### Qué cambia

| Endpoint | Caso | Antes | Después |
|--|--|--|--|
| `POST /api/purchaseReceipts/uploadFile/:purchaseReceipt` | Quien sube no es comprador del evento del comprobante | 200 | **403** |
| `POST /api/purchaseReceipts/uploadFile/:purchaseReceipt` | Comprobante inexistente | 404 (y la imagen quedaba guardada) | 404 (sin guardar nada) |
| `POST /api/transferReceipts/uploadFile/:transferReceipt` | Quien sube no es el dueño del comprobante | 200 | **403** |
| `POST /api/transferReceipts/uploadFile/:transferReceipt` | Comprobante ya aprobado | 200 | **400** `"The transfer receipt is already approved."` |
| `POST /api/transferReceipts/uploadFile/:transferReceipt` | Comprobante inexistente | 500 | **404** |

### Cómo adaptar el front (probable)
- No hace falta para el flujo normal: el comprador sube las imágenes de sus compras y cada miembro la de su transferencia.
- Conviene ocultar la opción de cambiar la imagen de un comprobante de transferencia ya aprobado y mostrar el `message` de los errores.

---

## 12. `getEvents` ya no devuelve eventos privados ajenos

**Estado:** implementado (`5fee9d9`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO A14

### Por qué
`GET /api/events/getEvents` devolvía todos los eventos, incluidos los privados de los que el usuario no es miembro.

### Qué cambia
Devuelve los eventos públicos más los privados en los que el usuario del token es miembro, con el mismo criterio que `getPublicAndPrivateEvents`. El formato de cada evento y el orden no cambian.

### Cómo adaptar el front (probable)
- No hace falta, salvo que alguna vista dependa de ver eventos privados ajenos (no debería).

---

## 13. Crear comprobante de transferencia: solo miembros del evento

**Estado:** implementado (`036c209`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (manejar los nuevos códigos de error) · **Origen:** WORKTODO A15 (adelanta parte de §4)

### Qué cambia
`POST /api/transferReceipts/createTransferReceipt/:event`:
- Si quien llama no es miembro del evento, responde **403**.
- Si el evento no existe, responde **404** (antes, 500).
- Si el id está mal formado, responde **400** (antes, 500).

El resto de §4 (`receiver`/`amount` calculados, `user` del token) sigue pendiente.

### Cómo adaptar el front (probable)
- No hace falta para el flujo normal; mostrar el `message` del error si llega un 403 o un 404.

---

## 14. Aprobar pago sin comprobante: solo para miembros

**Estado:** implementado (`d51db89`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO A16

### Qué cambia
`POST /api/transferReceipts/approvePaymentWithoutReceipt/:event/:user` responde **400** si `:user` no es miembro del evento (`"The user is not a member of the event."`) o si el id está mal formado. Antes creaba el comprobante igual.

### Cómo adaptar el front (probable)
- No hace falta: el front solo ofrece esta acción sobre los miembros del evento.

---

## 15. `createEvent` ignora los campos que administra el backend

**Estado:** implementado (`c3a6634`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO A17

### Qué cambia
`POST /api/events/createEvent` solo toma del body:
- `title`, `datetime`, `description`, `memberLimit`;
- `members`, `organizer`, `shoppingDesignee`;
- `isPrivate`, `penalization`, `penalizationStartDate`;
- los flags `isChef` e `isShoppingDesignee`.

Cualquier otro campo (`state`, `purchaseReceipts`, `transferReceipts`, `ratings`, `options`, etc.) se ignora: el evento siempre nace en `available` y sin comprobantes. Antes, un `state` inválido daba 500; ahora se ignora y responde 201.

`organizer`, `members` y `shoppingDesignee` siguen saliendo del body por ahora; habrá una entrada propia si eso cambia.

### Cómo adaptar el front (probable)
- No hace falta: el front no debería estar mandando esos campos.

---

## 16. Comprobante de compra: participantes validados

**Estado:** implementado (`2aa2014`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** no (informativo) · **Origen:** WORKTODO A19

### Qué cambia
`POST /api/purchaseReceipts/createPurchaseReceipt/:event`:
- Solo toma `description`, `amount` y `participants`. El resto se ignora; por ejemplo, `image` se carga solo con `uploadFile`.
- Si algún id de `participants` no es miembro del evento (o no es un id válido), responde **400** `"All participants must be members of the event."`.
- Sin `participants` siguen participando todos los miembros, y una lista vacía se sigue respetando.

### Cómo adaptar el front (probable)
- No hace falta si el selector de participantes solo ofrece miembros del evento. Mostrar el `message` si llega el 400.

---

## 17. Montos y límites negativos rechazados

**Estado:** implementado (`495de64`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** recomendado (validar en el formulario) · **Origen:** WORKTODO A20

### Qué cambia
El backend rechaza:
- `amount` negativo en comprobantes de compra y de transferencia (`0` sigue permitido);
- `memberLimit` menor a 1 en eventos;
- `penalization` negativa (`0` y `null` siguen permitidos).

Hoy los errores de validación responden **500** con el mensaje de Mongoose (es un problema general, sección 4 del WORKTODO); cuando se agregue el manejo global de errores, pasarán a **400**.

### Cómo adaptar el front (probable)
- Agregar `min` a los inputs de monto (≥ 0), cupo (≥ 1) y penalización (≥ 0), para no depender del error del backend.

---

## 18. Código de recuperación de contraseña: vencimiento e intentos

**Estado:** implementado (`2cdd352`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** recomendado (mostrar los nuevos mensajes) · **Origen:** WORKTODO A21

### Por qué
El código de 6 dígitos no vencía y se podía probar sin límite en `verifyCode` y `recover`, así que se podía adivinar por fuerza bruta.

### Qué cambia
- El código **vence a los 15 minutos** de pedido (`POST /api/password/forgot`).
- Después de **5 intentos fallidos**, sumando `verifyCode` y `recover`, el código se descarta.
- Respuestas nuevas de `PUT /api/password/verifyCode` y `PUT /api/password/recover` (todas **400**):
  - código vencido: `{ message: "Verification code expired. Request a new one." }`;
  - quinto intento fallido: `{ message: "Too many failed attempts. Request a new code." }`;
  - después de eso, o si nunca se pidió código: `{ message: "User never requested a password change." }`. En `verifyCode` esto antes era un **500**.
- El código incorrecto responde igual que antes: en `verifyCode` sigue siendo el string JSON `"Invalid verification code."` (ver sección 4 del WORKTODO) y en `recover`, `{ message: "Invalid verification code." }`.
- Los usuarios tienen dos campos internos nuevos, `verificationCodeExpiresAt` y `verificationAttempts`. `getUsers` y `getUserById` no los devuelven; otros endpoints que devuelven el usuario completo sí (igual que hoy pasa con el hash, sección 2.1 del WORKTODO).

### Cómo adaptar el front (probable)
- En la pantalla de código, mostrar el `message` de los 400 nuevos y ofrecer "pedir un código nuevo" (volver a llamar a `forgot`).
- Si el front tiene un temporizador o texto de vencimiento, usar 15 minutos.

---

## 19. Archivos subidos: máximo 5 MB

**Estado:** implementado (`23d6824`, rama `fix/worktodo-bugs`) · **Requiere cambios en el front:** recomendado (validar el tamaño antes de subir) · **Origen:** WORKTODO A23

### Qué cambia
`uploadFile` (comprobantes de compra y de transferencia) y `editProfilePicture` rechazan archivos de más de **5 MB**. Hoy el rechazo responde **500** con HTML (es el problema general de errores de multer, sección 4 del WORKTODO); cuando se agregue el manejo global de errores, será un **400** con `{ message }`.

### Cómo adaptar el front (probable)
- Validar el tamaño del archivo (≤ 5 MB) antes de subirlo y mostrar un mensaje claro. Opcionalmente, comprimir o redimensionar las fotos en el cliente.

---

## Grupos

Cambios que salieron del trabajo de la feature de grupos (`GROUPS_FEATURE.md`):
- **§20 a §26:** se hicieron al cerrar los endpoints abiertos (paso 1 del plan) y al resolver `TOFIX.md` (PR #157). Ya están en `dev`.
- **§27:** son los endpoints nuevos de `/api/groups` (pasos 2 y 3).

- **§28:** son los cambios en eventos que llegan con `Event.group` (paso 4).

### 20. Detalle del evento y pagos: requieren token

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** sí · **Origen:** GROUPS_FEATURE §5.3, TOFIX

#### Por qué
`getEventById`, `getMembersAndReceiptsInfo` y `getMembersAmount` respondían sin token. Cualquiera con el id de un evento veía sus miembros (con el hash de la contraseña), el estado de pagos, los montos y el CBU/alias de quien cobra.

#### Qué cambia

| Endpoint | Antes | Después |
|--|--|--|
| `GET /api/events/getEventById/:id` | Público | Exige token (**401**). Lo ve cualquier usuario logueado, también si el evento es privado: el link sigue sirviendo para sumarse. |
| `GET /api/events/getMembersAndReceiptsInfo/:event` | Público | Exige token (**401**). Si el evento es privado, solo lo ven sus miembros (**403** para el resto). |
| `GET /api/events/getMembersAmount/:event` | Público | Igual que el anterior. |

Cuando se agregue `Event.group`, la regla pasa a ser "miembro del grupo del evento **o** miembro del evento" (GROUPS_FEATURE §5.1).

Errores:
- id mal formado: **400** `{ message: "Invalid ObjectID" }` en los tres (antes **500**).
- evento inexistente:
  - `getEventById` sigue respondiendo **404** `"The event with the given ID was not found."`;
  - `getMembersAndReceiptsInfo` y `getMembersAmount` responden **404** `"The event with the given ID does not exist."` (antes, **500** y **404** con otro texto).

#### Cómo adaptar el front (probable)
- Mandar el header `Authorization` en las tres llamadas.
- Si el link de un evento se abre sin sesión, mandar a login antes de cargarlo.
- Manejar el **403** de los pagos de un evento privado.

---

### 21. Usuarios poblados sin datos sensibles

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** no · **Origen:** TOFIX, WORKTODO §2.1

Los usuarios que vienen poblados dentro de un evento (`organizer`, `chef`, `members`, `shoppingDesignee` en `getEventById` y `getPublicEvents`, y `shoppingDesignee`/`participants` en `getPurchaseReceiptsByEvent`) ya no incluyen `password`, `verificationCode`, `verificationCodeExpiresAt` ni `verificationAttempts`. El resto de los campos no cambia.

---

### 22. Roles del evento: cada uno toma o suelta los suyos

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** sí · **Origen:** TOFIX, GROUPS_FEATURE §4.4.2

#### Por qué
`PUT /api/events/editRoles/:id` dejaba que cualquier usuario logueado pusiera a cualquiera (incluso a no miembros) como chef o comprador de cualquier evento.

#### Qué cambia
El body sigue siendo `{ chef, shoppingDesignee: [] }` con el estado **completo** de los roles. El backend lo compara con el estado actual y solo acepta cambios que afecten al usuario del token:
- Tomar el chef (si está libre) o soltarlo si es suyo. `chef` vacío, `null` o ausente significa "sin chef".
- Sumarse o quitarse de `shoppingDesignee`. Los demás compradores tienen que quedar como estaban.

| Caso | Respuesta |
|--|--|
| Sin token | **401** |
| No es miembro del evento | **403** `"Access denied. Only event members can take a role."` |
| Cambia el rol de otra persona (asignar o quitar) | **403** `"Access denied. Users can only take or release their own roles."` |
| El chef ya lo tiene otro | **409** `"The event already has a chef."` |
| El evento no está en `available` | **409** `"Roles can only change while the event is available."` |
| No cambia nada | **200** sin cambios, en cualquier estado |
| id mal formado, `shoppingDesignee` que no es array o con ids inválidos | **400** (antes **500**) |
| Ok | **200** con el evento actualizado |

#### Cómo adaptar el front (probable)
- Pasar de "el organizador asigna roles" a botones "Ser chef" / "Dejar de ser chef" y "Ser comprador" / "Dejar de ser comprador" para el usuario actual.
- Para armar el body, partir de los roles actuales del evento y cambiar solo al usuario actual.
- Mostrar los **409** (chef ocupado, evento cerrado).

---

### 23. `createEvent`: el organizador sale del token

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** recomendado · **Origen:** TOFIX

- `organizer` del body **se ignora**: el organizador es el usuario del token.
- `members` solo puede sumar al organizador: si incluye su id, queda como miembro; cualquier otro id se ignora.
- `shoppingDesignee` del body **se ignora**. Como antes, `isChef` e `isShoppingDesignee` ponen al organizador como chef o comprador.
- Si falta un campo obligatorio (`title`, `description`, `datetime`, `memberLimit`), responde **400** con el mensaje de validación (antes **500**).

Cómo adaptar el front: dejar de mandar `organizer` y `shoppingDesignee`. `members: [miId]` sigue funcionando.

---

### 24. Calificaciones: solo por uno mismo

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** no, si ya califica con el usuario actual · **Origen:** TOFIX

`POST /api/ratings/createRating/:event/:user`:
- `:user` tiene que ser el usuario del token: si no, **403** `"Access denied. Users can only rate events for themselves."`.
- Un `score` que no sea 1, 2, 3, 4 o 5 responde **400** `"The score must be an integer between 1 and 5."` (antes **500**). Se sigue aceptando el número como string (`"4"`).
- id de evento o de usuario mal formado: **400** (antes **500**). Lo mismo en `getRatingFromUser`.

---

### 25. Comprobantes: validación de evento, comprador y dueño

**Estado:** implementado (PR #157, `448e21f`) · **Requiere cambios en el front:** recomendado (manejar los nuevos 403/404) · **Origen:** TOFIX

| Endpoint | Antes | Después |
|--|--|--|
| `GET /api/purchaseReceipts/getPurchaseReceiptById/:id/:event` | Devolvía el comprobante aunque fuera de otro evento | Si el comprobante no es de `:event`, **404**. id mal formado: **400** (antes **500**). |
| `DELETE /api/purchaseReceipts/deletePurchaseReceipt/:id/:event` | Borraba comprobantes de otro evento | Si no es de `:event`, **404** y no borra. |
| `PUT /api/purchaseReceipts/assignMembersToReceipt` | Cualquier logueado, cualquier recibo; cambios parciales si fallaba a mitad | Solo un comprador del evento de **cada** recibo (**403**). Los participantes tienen que ser miembros de ese evento (**400** `"All participants must be members of the event."`). Se valida todo antes de guardar: si algo falla, no cambia ningún recibo. Sin `receipts` o con un id inválido: **400** (antes **500**). |
| `GET /api/transferReceipts/getTransferReceiptsById/:id` | Cualquier logueado | Solo miembros del evento del comprobante (**403**). id mal formado: **400** (antes **500**). |
| `PUT /api/transferReceipts/approveTransferReceipt/:id/:event` | Aprobaba comprobantes de otro evento | Si no es de `:event`, **404** y no aprueba. |
| `DELETE /api/transferReceipts/deleteTransferReceipt/:id` | Cualquier logueado | Solo el dueño (**403** `"Access denied. The user is not the owner of the receipt."`). Inexistente: **404** `"The transfer receipt with the given ID does not exist."`. id mal formado: **400**. |

---

### 26. Otras correcciones de respuestas

**Estado:** implementado (PR #157, `448e21f`) · **Origen:** TOFIX

- **`PUT /api/password/verifyCode`** · **Requiere cambios en el front:** sí. Con código incorrecto responde `{ message: "Invalid verification code." }` en lugar del string suelto, igual que `recover` y los demás errores.
- **`PUT /api/users/editUser/:id`** · **Requiere cambios en el front:** no. Si `alias` o `cbu` no vienen en el body, se conservan (antes se borraban). Para borrarlos, mandarlos vacíos (`""` o `null`).
- **`GET /api/events/getMembersAmount/:event`** · **Requiere cambios en el front:** no. Un comprobante sin participantes no lo paga nadie: los montos son números (antes podía aparecer `amount: null`).
- **`DELETE /api/events/deleteEvent/:id`** · **Requiere cambios en el front:** no. Ahora también borra las opciones de votación, y todo el borrado es atómico (o se borra todo o nada).
- **Limpieza automática al crear un evento** · **Requiere cambios en el front:** no. Solo borra eventos públicos terminados o cancelados; los privados nunca se borran.

---

### 27. Grupos: endpoints nuevos

**Estado:** implementado (rama `t/groups-model`) · **Requiere cambios en el front:** sí (pantallas nuevas; nada existente se rompe) · **Origen:** GROUPS_FEATURE §4–§6

Todos exigen token. Errores con `{ message }`. En las rutas con `:group`, un id mal formado responde **400**, un grupo inexistente **404** y quien no tiene permiso **403**.

| Endpoint | Quién | Body | Respuesta |
|--|--|--|--|
| `POST /api/groups/createGroup` | Cualquier logueado | `{ name }` (1 a 50 caracteres, se recorta) | **201** con el grupo `{ _id, name, code, admins, members, coverPhotos, createdAt }`. El creador queda como único admin y miembro. **400** si el nombre es inválido; **409** si el usuario ya está en 100 grupos. |
| `GET /api/groups/getMyGroups` | Cualquier logueado | — | **200** `[{ _id, name, coverPhotos, membersCount, isAdmin }]`, los más nuevos primero. |
| `GET /api/groups/getGroupById/:group` | Miembro | — | **200** con el grupo; `members` viene como `[{ _id, name, lastName, profilePicture }]` y `admins` como ids. Incluye `code` para compartirlo. |
| `PUT /api/groups/joinGroup` | Cualquier logueado | `{ code }` (no distingue mayúsculas ni espacios alrededor) | **200** con el detalle del grupo. **400** código mal formado; **404** no existe; **409** ya es miembro, el grupo tiene 200 miembros o el usuario ya está en 100 grupos. |
| `PUT /api/groups/leaveGroup/:group` | Miembro | — | **200** `{ message, groupDeleted }`. Si era el último miembro, el grupo se borra (`groupDeleted: true`). **409** si es el único admin y quedan otros miembros. |
| `PUT /api/groups/editGroup/:group` | Admin | `{ name }` | **200** con el grupo. Solo cambia el nombre. |
| `PUT /api/groups/makeAdmin/:group/:user` | Admin | — | **200** con el grupo. Idempotente. **400** si `:user` no es miembro. |
| `PUT /api/groups/regenerateCode/:group` | Admin | — | **200** `{ code }`. El código anterior deja de servir en el acto. |

Por ahora los eventos no tienen grupo (llega en el paso 4), así que salir de un grupo todavía no revisa deudas ni roles en eventos.

#### Cómo adaptar el front (probable)
- Pantallas de "mis grupos", detalle del grupo, crear grupo y "unirme con código".
- Link de invitación `https://food-spot.vercel.app/join/<CODE>`: si no hay sesión, mandar a login o registro y después llamar a `joinGroup`.
- Mostrar las acciones de admin (renombrar, hacer admin, regenerar código) solo si el usuario está en `admins` (o `isAdmin` en el listado).

---

### 28. Eventos de un grupo (`Event.group`)

**Estado:** implementado (rama `t/groups-model`) · **Requiere cambios en el front:** sí · **Origen:** GROUPS_FEATURE §3.3, §4.4, §5.1, §6

Todo evento pertenece a un grupo. Los eventos traen el campo nuevo `group` (id).

#### Crear un evento
`POST /api/events/createEvent` exige `group` en el body. El evento queda en ese grupo para siempre: `editEvent` ignora `group`.

| Caso | Respuesta |
|--|--|
| Sin `group` | **400** `"The event's group is required."` |
| `group` mal formado | **400** `"Invalid ObjectID"` |
| El grupo no existe | **404** `"The group with the given ID does not exist."` |
| El usuario no es miembro del grupo | **403** `"Access denied. The user is not a member of the group."` |

#### Ver y sumarse a un evento

| Endpoint | Antes | Después |
|--|--|--|
| `GET /api/events/getEventById/:id` | Cualquier logueado | Miembro del grupo del evento **o** miembro del evento. Resto: **403** `"Access denied. The user is not a member of the event's group."`. Inexistente: **404** `"The event with the given ID does not exist."` (cambia el texto). |
| `GET /api/events/getMembersAndReceiptsInfo/:event` y `getMembersAmount/:event` | Público: cualquier logueado; privado: sus miembros | Igual que `getEventById`. `isPrivate` ya no cuenta. |
| `PUT /api/events/subscribeToAnEvent/:id/:event` | Cualquiera con el id | Solo miembros del grupo del evento (**403**, mismo mensaje). Se valida antes que "lleno" o "no disponible". |

Quien salió del grupo pero sigue como miembro de un evento (cerrado o terminado) lo sigue viendo.

#### Listado nuevo
`GET /api/events/getGroupEvents/:group` (miembros del grupo): **200** con los eventos del grupo, más nuevos primero, en el mismo formato que `getEvents` (sin poblar). **400** id mal formado, **404** grupo inexistente, **403** no es miembro.

`getEvents`, `getPublicAndPrivateEvents` y `getPublicEvents` todavía no cambian (siguen mostrando eventos de todos los grupos): ver GROUPS_FEATURE §5.2.

#### Organizador que salió del grupo
Pierde los permisos de organizador: editar o borrar el evento, gestionar opciones y ver el costo de otros miembros responden **403**. Si sigue siendo miembro del evento, lo puede ver. Los compradores conservan sus permisos.

#### Salir de un grupo
`PUT /api/groups/leaveGroup/:group` ahora revisa los eventos del grupo. Todas las respuestas son **409** y el usuario no sale de nada:

| Caso | Mensaje (contiene) |
|--|--|
| Es el único admin y quedan otros miembros (sin cambios) | `"only admin"` |
| Debe plata en un evento `readyforpayment` del grupo (sin transferencia aprobada) | `"pending payments"` |
| Es chef o comprador de un evento `closed` o `readyforpayment` del grupo | `"chef or a shopping designee"` |

Si puede salir:
- se lo da de baja de los eventos `available` del grupo, como si se desuscribiera, y suelta sus roles en esos eventos;
- sigue siendo miembro de los eventos `closed`, `readyforpayment`, `finished` y `cancelled`;
- si era el último miembro, se borra el grupo **con todos sus eventos** (comprobantes, opciones, calificaciones, recordatorios e imágenes).

#### Desuscribirse suelta los roles
`PUT /api/events/unsubscribeFromEvent/:id/:event`: con el evento `available`, quien se va deja de ser chef o comprador (antes seguía figurando). En `finished`/`cancelled` los roles no cambian.

#### Cómo adaptar el front (probable)
- Crear eventos desde la pantalla del grupo y mandar `group`.
- Pantalla del grupo con `getGroupEvents`.
- El link de un evento solo sirve para miembros del grupo: ante un **403**, ofrecer unirse al grupo con el código.
- Mostrar los **409** de `leaveGroup` y avisar que salir borra el grupo con sus eventos si es el último.
- Ocultar editar, borrar y gestionar opciones al organizador que ya no está en el grupo.

---

### 29. Aviso de evento nuevo por grupo y fin de la limpieza automática

**Estado:** implementado (rama `t/groups-model`) · **Requiere cambios en el front:** no · **Origen:** GROUPS_FEATURE §5.4, paso 5

#### Mail de evento nuevo
- Antes: lo recibían **todos** los usuarios del sistema con `notifications.newEvent`, y solo si el evento era público.
- Ahora: lo reciben los **miembros del grupo** del evento con `notifications.newEvent`, sin el organizador. `isPrivate` ya no cuenta: un evento privado también se avisa al grupo.
- Los miembros se leen cuando corre el cron (`reminderCheck`), no al crear el evento: quien entró al grupo en el medio lo recibe y quien salió no.
- El mail menciona el nombre del grupo. Si el evento se canceló antes del cron, no se manda (sin cambios).

#### Limpieza automática de eventos viejos
Se eliminó: antes, al crear un evento, si había más de 6 eventos públicos se borraban los terminados o cancelados más viejos (de cualquier grupo, con su historial de pagos). Ahora los eventos terminados quedan como historial del grupo.

#### Cómo adaptar el front (probable)
- Nada obligatorio. Si la pantalla de preferencias describe el aviso de evento nuevo, aclarar que es "eventos nuevos de mis grupos".
