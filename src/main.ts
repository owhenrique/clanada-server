import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Env } from "./infra/config/env.schema";
import { buildOpenApiDocument } from "./infra/swagger/openapi-document";
import { DomainExceptionFilter } from "./shared/errors/domain-exception.filter";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
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
  void bootstrap();
}
