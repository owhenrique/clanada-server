import { Injectable } from "@nestjs/common";

export abstract class RandomSource {
  abstract next(): number;
}

@Injectable()
export class MathRandomSource extends RandomSource {
  next(): number {
    return Math.random();
  }
}
