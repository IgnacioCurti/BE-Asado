import { describe, expect, it } from "vitest";
import {
  eventStartTemplate,
  newEventTemplate,
  passwordRecoveryTemplate,
  penalizationOneWeekTemplate,
  penalizationStartTemplate,
} from "../../../src/utils/templates.js";

const DEFAULT_LOGO: string = "https://i.ibb.co/Zz37kZxZ/logo-rojo.png";
const EVENT_ID: string = "507f1f77bcf86cd799439011";
const EVENT_URL: string = `https://food-spot.vercel.app/event/${EVENT_ID}`;

describe("passwordRecoveryTemplate", () => {
  it("incluye el código, el título y el logo por defecto", () => {
    const html = passwordRecoveryTemplate("123456");
    expect(html).toContain('<span class="code">123456</span>');
    expect(html).toContain("FoodSpot | Recuperar contraseña");
    expect(html).toContain(`src="${DEFAULT_LOGO}"`);
    expect(html).toContain("<html>");
  });

  it("permite reemplazar el logo", () => {
    const html = passwordRecoveryTemplate("1", "https://cdn.test/logo.png");
    expect(html).toContain('src="https://cdn.test/logo.png"');
    expect(html).not.toContain(DEFAULT_LOGO);
  });
});

describe.each([
  ["newEventTemplate", newEventTemplate, "FoodSpot | Nuevo Evento"],
  ["eventStartTemplate", eventStartTemplate, "FoodSpot | El evento está a punto de comenzar"],
] as const)("%s", (_name, template, heading) => {
  it("incluye el link al evento, el título y el logo", () => {
    const html = template(EVENT_ID);
    expect(html).toContain(`href="${EVENT_URL}"`);
    expect(html).toContain(heading);
    expect(html).toContain(`src="${DEFAULT_LOGO}"`);
  });

  it("permite reemplazar el logo", () => {
    expect(template(EVENT_ID, "https://cdn.test/l.png")).toContain('src="https://cdn.test/l.png"');
  });
});

describe.each([
  ["penalizationStartTemplate", penalizationStartTemplate, "FoodSpot | Hoy comienza la penalización"],
  [
    "penalizationOneWeekTemplate",
    penalizationOneWeekTemplate,
    "FoodSpot | La penalización ha estado en curso durante una semana",
  ],
] as const)("%s", (_name, template, heading) => {
  it("incluye el monto diario de la penalización, el link y el título", () => {
    const html = template(EVENT_ID, 150);
    expect(html).toContain('<span class="highlight">$150 por día</span>');
    expect(html).toContain(`href="${EVENT_URL}"`);
    expect(html).toContain(heading);
    expect(html).toContain(`src="${DEFAULT_LOGO}"`);
  });

  it("muestra 'null' si el evento no tiene penalización", () => {
    expect(template(EVENT_ID, null as unknown as number)).toContain("$null por día");
  });
});
