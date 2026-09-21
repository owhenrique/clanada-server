import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";

export abstract class IdGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidIdGenerator extends IdGenerator {
  next(): string {
    return randomUUID();
  }
}
