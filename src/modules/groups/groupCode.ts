import { randomInt } from "node:crypto";

// Código para unirse a un grupo (GROUPS_FEATURE.md §3.4): 8 caracteres de un
// alfabeto sin caracteres ambiguos (sin 0/O ni 1/I/L), 31^8 ≈ 8,5 × 10^11
// combinaciones. La unicidad la garantiza el índice único de Group.code.
export const GROUP_CODE_ALPHABET: string = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const GROUP_CODE_LENGTH: number = 8;

const GROUP_CODE_PATTERN: RegExp = new RegExp(
  `^[${GROUP_CODE_ALPHABET}]{${GROUP_CODE_LENGTH}}$`
);

// randomInt usa el generador criptográfico y no tiene sesgo de módulo.
export function generateGroupCode(random: (max: number) => number = randomInt): string {
  let code: string = "";
  for (let i = 0; i < GROUP_CODE_LENGTH; i++)
    code += GROUP_CODE_ALPHABET[random(GROUP_CODE_ALPHABET.length)];
  return code;
}

// Lo que ingresa el usuario: sin espacios alrededor y en mayúsculas.
export function normalizeGroupCode(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

export function isValidGroupCode(code: string): boolean {
  return GROUP_CODE_PATTERN.test(code);
}
