# Clanada — server

API do Clanada: gerenciamento de pelada com rotação de quadras. NestJS + TypeScript + Postgres.

## Stack

- **NestJS 12** (Express) + **TypeScript strict**.
- **Prisma 7** com `@prisma/adapter-pg` (driver adapter) sobre **Postgres 16**.
- **Zod** para validar variáveis de ambiente; **class-validator** + **class-transformer** para DTOs; **@nestjs/swagger** gera o `openapi.json`.
- **nestjs-pino** para logs estruturados.
- **Vitest** (unit + e2e com **Testcontainers**), **ESLint** (proíbe `any`).

## Rodando localmente

```bash
cp .env.example .env
docker compose up -d      # Postgres 16 em localhost:5432
npm install
npm run dev                # http://localhost:3001/api
```

`GET /api/health` confirma que o servidor e o banco estão no ar. A documentação interativa fica em `/api/docs`.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor em modo watch (SWC). |
| `npm run build` / `npm start` | Build de produção e execução do build. |
| `npm test` | Testes unitários (Vitest). |
| `npm run test:e2e` | Testes e2e com Testcontainers (requer Docker). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run openapi` | Gera `src/infra/swagger/openapi.json` a partir dos DTOs/rotas, sem subir o servidor. |
| `npm run db:migrate` | Aplica migrations do Prisma. |

## Estrutura

```
prisma/schema.prisma      # datasource + generator (modelos entram conforme o domínio evolui)
src/
  main.ts                 # bootstrap da aplicação (createApp) + entrypoint
  app.module.ts
  infra/                  # conversa com o mundo de fora: config, prisma, swagger, logging
  shared/                 # utilitários de código, sem I/O: errors, http, ports
  modules/
    match/                # domínio puro (regras da pelada)
    health/                # GET /api/health
  generated/prisma/       # client Prisma gerado (não versionado)
test/                     # testes e2e (Testcontainers)
```

Convenções de desenvolvimento, arquitetura e fluxo de trabalho estão em `AGENTS.md`.
