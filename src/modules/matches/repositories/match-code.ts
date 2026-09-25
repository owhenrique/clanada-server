import type { RandomSource } from "../../../shared/ports/random-source";

export const MATCH_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const MATCH_CODE_LENGTH = 8;

const MATCH_CODE_PATTERN = new RegExp(`^[${MATCH_CODE_ALPHABET}]{${MATCH_CODE_LENGTH}}$`);

export function isMatchCode(code: string): boolean {
  return MATCH_CODE_PATTERN.test(code);
}

export function generateMatchCode(random: RandomSource, length: number = MATCH_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random.next() * MATCH_CODE_ALPHABET.length);
    code += MATCH_CODE_ALPHABET[index];
  }
  return code;
}
