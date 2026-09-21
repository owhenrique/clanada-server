import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./shared/database/prisma.module";
import { LoggingModule } from "./shared/logging/logging.module";
import { SharedModule } from "./shared/ports/shared.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw: Record<string, unknown>) => envSchema.parse(raw),
    }),
    LoggingModule,
    SharedModule,
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
