import { describe, expect, it } from "vitest";
import {
  GROUP_CODE_ALPHABET,
  GROUP_CODE_LENGTH,
  generateGroupCode,
  isValidGroupCode,
  normalizeGroupCode,
} from "../../../../src/modules/groups/groupCode.js";

describe("alfabeto del código de grupo", () => {
  it("tiene 31 caracteres, sin ambiguos (0/O, 1/I/L) ni repetidos", () => {
    expect(GROUP_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(GROUP_CODE_ALPHABET).size).toBe(31);
    for (const ambiguous of ["0", "O", "1", "I", "L"]) expect(GROUP_CODE_ALPHABET).not.toContain(ambiguous);
  });
});

describe("generateGroupCode", () => {
  it("arma el código con el generador recibido, un carácter por posición", () => {
    const picks = [0, 1, 2, 3, 27, 28, 29, 30];
    let i = 0;
    const random = (max: number) => {
      expect(max).toBe(GROUP_CODE_ALPHABET.length);
      return picks[i++];
    };
    expect(generateGroupCode(random)).toBe("ABCD6789");
  });

  it("con el generador real siempre produce códigos válidos de 8 caracteres", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateGroupCode();
      expect(code).toHaveLength(GROUP_CODE_LENGTH);
      expect(isValidGroupCode(code)).toBe(true);
    }
  });

  it("no repite códigos en una tirada razonable", () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateGroupCode()));
    expect(codes.size).toBe(1000);
  });
});

describe("normalizeGroupCode", () => {
  it("quita espacios y pasa a mayúsculas", () => {
    expect(normalizeGroupCode("  k7px2mqa ")).toBe("K7PX2MQA");
  });

  it.each([undefined, null, 12345678, {}])("un valor que no es string (%s) queda vacío", (input) => {
    expect(normalizeGroupCode(input)).toBe("");
  });
});

describe("isValidGroupCode", () => {
  it("acepta 8 caracteres del alfabeto", () => {
    expect(isValidGroupCode("K7PX2MQA")).toBe(true);
  });

  it.each([
    ["minúsculas", "k7px2mqa"],
    ["corto", "K7PX2MQ"],
    ["largo", "K7PX2MQAB"],
    ["con 0", "K7PX2MQ0"],
    ["con O", "K7PX2MQO"],
    ["con 1", "K7PX2MQ1"],
    ["con I", "K7PX2MQI"],
    ["con L", "K7PX2MQL"],
    ["con espacio", "K7PX 2MQ"],
    ["vacío", ""],
  ])("rechaza un código %s", (_case, code) => {
    expect(isValidGroupCode(code)).toBe(false);
  });
});
