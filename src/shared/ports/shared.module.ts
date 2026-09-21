import { Global, Module } from "@nestjs/common";
import { Clock, SystemClock } from "./clock";
import { IdGenerator, UuidIdGenerator } from "./id-generator";
import { MathRandomSource, RandomSource } from "./random-source";

@Global()
@Module({
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: IdGenerator, useClass: UuidIdGenerator },
    { provide: RandomSource, useClass: MathRandomSource },
  ],
  exports: [Clock, IdGenerator, RandomSource],
})
export class SharedModule {}
