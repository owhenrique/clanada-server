import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import pino from "pino";
import { AppModule } from "./app.module";
import type { Env } from "./infra/config/env.schema";
import { reportFatalError } from "./infra/logging/fatal-error";
import { buildOpenApiDocument } from "./infra/swagger/openapi-document";
import { DomainExceptionFilter } from "./shared/errors/domain-exception.filter";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, abortOnError: false });
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(helmet());
  const trustProxyHops = configService.get("TRUST_PROXY_HOPS", { infer: true });
  if (trustProxyHops > 0) {
    app.set("trust proxy", trustProxyHops);
  }
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  if (configService.get("NODE_ENV", { infer: true }) !== "production") {
    SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app));
  }

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const configService = app.get<ConfigService<Env, true>>(ConfigService);
  const port = configService.get("PORT", { infer: true });
  await app.listen(port);
}

if (require.main === module) {
  const fatalLogger = pino({ level: "fatal" });
  const exit = (code: number): never => process.exit(code);
  process.on("unhandledRejection", (reason) => reportFatalError(fatalLogger, exit, reason, "Unhandled rejection"));
  process.on("uncaughtException", (error) => reportFatalError(fatalLogger, exit, error, "Uncaught exception"));
  bootstrap().catch((error: unknown) => reportFatalError(fatalLogger, exit, error, "Failed to start application"));
}
