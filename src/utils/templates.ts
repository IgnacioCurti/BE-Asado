export function passwordRecoveryTemplate(
  code: string,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .code { display: block; background-color: #ffffff; border: 2px dashed #BF334D; color: #BF334D; font-size: 1.2em; text-align: center; padding: 10px; margin: 20px auto; border-radius: 4px; width: fit-content; }
        .footer { font-size: 0.9em; color: #777777; text-align: center; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | Recuperar contraseña</h1></div>
      <div class="content">
        <p>Utiliza el siguiente código para recuperar tu contraseña:</p>
        <span class="code">${code}</span>
        <p>Si no solicitaste esto, simplemente ignora este correo.</p>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}

// Para insertar texto de usuarios (p. ej. el nombre del grupo) en el HTML del mail.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function newEventTemplate(
  eventId: string,
  groupName: string,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .button { display: block; background-color: #BF334D; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 4px; width: fit-content; margin: 20px auto; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | Nuevo Evento</h1></div>
      <div class="content">
        <p>Se ha creado un nuevo evento en el grupo <strong>${escapeHtml(groupName)}</strong>. Haz clic a continuación para unirte:</p>
        <a style="color: #FFFFFF !important;" class="button" href="https://food-spot.vercel.app/event/${eventId}">Ver Evento</a>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}

export function eventStartTemplate(
  eventId: string,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .button { display: block; background-color: #BF334D; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 4px; width: fit-content; margin: 20px auto; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | El evento está a punto de comenzar</h1></div>
      <div class="content">
        <p>Uno de tus eventos está a punto de comenzar. Haz clic a continuación para verlo:</p>
        <a style="color: #FFFFFF !important;" class="button" href="https://food-spot.vercel.app/event/${eventId}">Ver Evento</a>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}

export function penalizationStartTemplate(
  eventId: string,
  penalization: number,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .highlight { color: #BF334D; font-weight: bold; display: block; margin: 10px auto; }
        .button { display: block; background-color: #BF334D; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 4px; width: fit-content; margin: 20px auto; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | Hoy comienza la penalización</h1></div>
      <div class="content">
        <p>Se aplicará una tarifa de <span class="highlight">$${penalization} por día</span> para un evento en el que participas.</p>
        <p>Por favor, salda tu deuda:</p>
        <a style="color: #FFFFFF !important;" class="button" href="https://food-spot.vercel.app/event/${eventId}">Ver Evento</a>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}

export function penalizationOneWeekTemplate(
  eventId: string,
  penalization: number,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .highlight { color: #BF334D; font-weight: bold; display: block; margin: 10px auto; }
        .button { display: block; background-color: #BF334D; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 4px; width: fit-content; margin: 20px auto; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | La penalización ha estado en curso durante una semana</h1></div>
      <div class="content">
        <p>Se ha aplicado una penalización de <span class="highlight">$${penalization} por día</span> durante una semana.</p>
        <p>Por favor, revisa y salda tu deuda:</p>
        <a style="color: #FFFFFF !important;" class="button" href="https://food-spot.vercel.app/event/${eventId}">Ver Evento</a>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}

// Invitación a un grupo (GROUPS_FEATURE §4.3, opción A): el link lleva el código.
export function groupInvitationTemplate(
  groupName: string,
  inviterName: string,
  code: string,
  footerImageUrl: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png"
): string {
  const who: string = inviterName ? `<strong>${escapeHtml(inviterName)}</strong> te invitó` : "Te invitaron";
  return `
    <html>
    <head>
      <style>
        body { background-color: #F6FAF9; margin: 0; padding: 20px; font-family: Arial, sans-serif; }
        .header { background-color: #BF334D; color: #ffffff; padding: 10px; text-align: center; }
        .content { margin: 20px 0; color: #333333; text-align: center; }
        .code { display: block; background-color: #ffffff; border: 2px dashed #BF334D; color: #BF334D; font-size: 1.2em; text-align: center; padding: 10px; margin: 20px auto; border-radius: 4px; width: fit-content; }
        .button { display: block; background-color: #BF334D; color: #ffffff; padding: 10px 16px; text-decoration: none; border-radius: 4px; width: fit-content; margin: 20px auto; }
      </style>
    </head>
    <body>
      <div class="header"><h1>FoodSpot | Invitación a un grupo</h1></div>
      <div class="content">
        <p>${who} a unirte al grupo <strong>${escapeHtml(groupName)}</strong>. Haz clic a continuación para unirte:</p>
        <a style="color: #FFFFFF !important;" class="button" href="https://food-spot.vercel.app/join/${encodeURIComponent(code)}">Unirme al grupo</a>
        <p>O ingresa este código en la app:</p>
        <span class="code">${escapeHtml(code)}</span>
      </div>
      <div style="
        width:100%;
        text-align:center;
        padding-top:20px;
      ">
        <img
          src="${footerImageUrl}"
          alt="Footnote graphic"
          style="
            display:block;
            max-width:100px;
            height:auto;
            margin: 0 auto;
          "
        />
      </div>
    </body>
    </html>
  `;
}
