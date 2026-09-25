import { Injectable } from "@nestjs/common";
import { randomInt } from "node:crypto";

const RANDOM_RANGE = 2 ** 48 - 1;

export abstract class RandomSource {
  abstract next(): number;
}

@Injectable()
export class CryptoRandomSource extends RandomSource {
  next(): number {
    return randomInt(RANDOM_RANGE) / RANDOM_RANGE;
  }
}
