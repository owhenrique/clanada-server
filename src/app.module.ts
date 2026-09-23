import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { envSchema } from "./infra/config/env.schema";
import { HealthModule } from "./modules/health/health.module";
import { MatchesModule } from "./modules/matches/matches.module";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { LoggingModule } from "./infra/logging/logging.module";
import { PortsModule } from "./shared/ports/ports.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (raw: Record<string, unknown>) => envSchema.parse(raw),
    }),
    LoggingModule,
    PortsModule,
    PrismaModule,
    HealthModule,
    MatchesModule,
  ],
})
export class AppModule {}
