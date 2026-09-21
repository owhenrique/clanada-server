import { writeFileSync } from "node:fs";
import { buildOpenApiDocument } from "./openapi-document";
import { createApp } from "./main";

async function generateOpenApiSpec(): Promise<void> {
  const app = await createApp();
  const document = buildOpenApiDocument(app);
  writeFileSync("openapi.json", JSON.stringify(document, null, 2));
  await app.close();
}

void generateOpenApiSpec();
