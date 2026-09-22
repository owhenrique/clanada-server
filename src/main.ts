import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import type { Env } from "./infra/config/env.schema";
import { buildOpenApiDocument } from "./infra/swagger/openapi-document";
import { DomainExceptionFilter } from "./shared/errors/domain-exception.filter";

export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  const document = buildOpenApiDocument(app);
  SwaggerModule.setup("api/docs", app, document);

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
