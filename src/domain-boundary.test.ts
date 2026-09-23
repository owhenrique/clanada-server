import { readFileSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const cwd = path.resolve(__dirname, "..");

async function restrictedImportMessages(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd });
  const results = await eslint.lintText(code, { filePath });
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.message),
  );
}

describe("CEN-3: lint blocks a Nest import inside the domain", () => {
  it("flags @nestjs/common added to a domain file", async () => {
    const filePath = path.join(cwd, "src/domain/match/rules/formation.ts");
    const original = readFileSync(filePath, "utf-8");
    const code = `import { Injectable } from "@nestjs/common";\n${original}`;

    const messages = await restrictedImportMessages(code, filePath);

    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("CEN-4: lint blocks Prisma, node:*, generated/, infra/ and modules/ imports inside the domain", () => {
  const forbiddenImports = [
    `import { PrismaClient } from "@prisma/client";`,
    `import { randomUUID } from "node:crypto";`,
    `import { PrismaClient } from "../../../generated/prisma/client";`,
    `import { PrismaService } from "../../../infra/prisma/prisma.service";`,
    `import { MatchesRepository } from "../../../modules/matches/repositories/matches.repository";`,
  ];

  it.each(forbiddenImports)("flags %s", async (importLine) => {
    const filePath = path.join(cwd, "src/domain/match/rules/formation.ts");
    const original = readFileSync(filePath, "utf-8");
    const code = `${importLine}\n${original}`;

    const messages = await restrictedImportMessages(code, filePath);

    expect(messages.length).toBeGreaterThan(0);
  });
});

describe("CEN-5: allowed imports inside the domain, and the rule stays scoped to the domain", () => {
  it("does not flag the domain's own import of shared/errors", async () => {
    const filePath = path.join(cwd, "src/domain/match/commands/start.ts");
    const code = readFileSync(filePath, "utf-8");

    const messages = await restrictedImportMessages(code, filePath);

    expect(messages).toEqual([]);
  });

  it("does not flag modules/matches importing @nestjs/common and Prisma", async () => {
    const filePath = path.join(cwd, "src/modules/matches/repositories/prisma-matches.repository.ts");
    const code = readFileSync(filePath, "utf-8");

    const messages = await restrictedImportMessages(code, filePath);

    expect(messages).toEqual([]);
  });
});
