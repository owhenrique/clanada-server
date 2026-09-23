import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { envSchema, type Env } from "./infra/config/env.schema";
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
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const ttl = configService.get("THROTTLE_TTL_MS", { infer: true });
        return [
          { name: "default", ttl, limit: configService.get("THROTTLE_GLOBAL_LIMIT", { infer: true }) },
          { name: "create", ttl, limit: configService.get("THROTTLE_CREATE_LIMIT", { infer: true }) },
        ];
      },
    }),
    LoggingModule,
    PortsModule,
    PrismaModule,
    HealthModule,
    MatchesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
