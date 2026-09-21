import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Clanada API")
    .setDescription("API de gerenciamento de pelada com rotação de quadras")
    .setVersion("1.0")
    .build();

  return SwaggerModule.createDocument(app, config);
}
