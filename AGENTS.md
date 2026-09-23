# AGENTS.md (server)

Regras específicas do backend (NestJS + Postgres). Some às regras globais do workspace.

## Estrutura de pastas

```
prisma/schema.prisma          # modelos + migrations
prisma.config.ts              # Prisma 7: config fora do schema
src/
  main.ts                     # createApp() (bootstrap reutilizável) + entrypoint
  app.module.ts
  infra/                      # conversa com o mundo de fora
    config/                   # schema zod das variáveis + validação no boot
    prisma/                   # PrismaService (adapter-pg), PrismaModule global
    swagger/                  # geração do OpenAPI (openapi-document.ts, generate-openapi.ts, openapi.json)
    logging/                  # config do nestjs-pino (requisições, redaction, request id)
  shared/                     # utilitários de código, sem I/O
    ports/                    # Clock, IdGenerator, RandomSource: abstract class + impl padrão
    errors/                   # DomainError (code tipado) + filtro HTTP global
    http/                     # decorator @IfMatch()
  domain/
    match/                    # DOMÍNIO PURO — sem Nest, sem I/O (o lint barra imports fora do domínio)
  modules/
    health/                   # módulo pequeno (2 arquivos) — sem subpastas por camada
      health.controller.ts
      health.service.ts
      health.module.ts
    matches/                  # aplicação + HTTP + persistência da sessão — em pastas por camada
      matches.module.ts
      controllers/
        matches.controller.ts
      services/
        matches.service.ts
        match-view.ts
      repositories/
        matches.repository.ts       # abstract class (porta)
        prisma-matches.repository.ts
        in-memory-matches.repository.ts
        match-code.ts
        event-codec.ts
      dto/
  generated/prisma/           # client Prisma gerado — não editar, não versionar
test/                         # e2e + setup Testcontainers
```

**Pastas por camada dentro de um módulo** (`controllers/`, `services/`, `repositories/`, `dto/`): o arquivo mantém o prefixo do módulo (`matches.controller.ts`, não só `controller.ts`) para continuar autoexplicativo fora do contexto da pasta. Um módulo pequeno (só controller + service, ex. `health/`) não precisa das subpastas — a convenção vale a partir do ponto em que o módulo ganha repositório próprio.

## Camadas de um módulo HTTP

Fluxo sempre nesta direção; nunca o inverso.

| Camada | Faz | Não faz |
|--------|-----|---------|
| **Controller** | Recebe a requisição já validada pelo DTO (`ValidationPipe`), chama **um** método do service e devolve o retorno. | Nenhum `if`, cálculo, mapeamento, try/catch ou acesso a repositório. |
| **Service** | Orquestra o caso de uso: carrega pelo repositório, aplica o domínio (`domain/match`), grava, monta a view de resposta e registra o log da ação. | SQL/Prisma, detalhes de HTTP. |
| **Repository** | Lê e grava no banco (Prisma), converte linha ↔ tipo de domínio, garante a concorrência por versão. | Regra de negócio. |

`domain/match` não é uma camada com I/O: é uma biblioteca de funções puras que o service chama. Erros de domínio sobem como `DomainError` (`src/shared/errors/domain-error.ts`) e o `DomainExceptionFilter` global os converte em HTTP — por isso o controller não trata erro.

## Princípios (SOLID sem cerimônia)

- **Responsabilidade única:** cada regra de domínio num arquivo; controller, service e repository com os papéis da tabela acima.
- **Aberto/fechado:** mapas tipados `Record<Type, Handler>` para eventos/comandos novos — não mexe nos handlers existentes.
- **Inversão de dependência:** services dependem de portas (`MatchesRepository`, `Clock`, `IdGenerator`, `RandomSource`) como **abstract class**, nunca tokens de string. Em teste, trocam por fakes/in-memory.
- **Reuso:** funções auxiliares de domínio exportadas e reaproveitadas entre regras; nunca reimplementadas.
- **Fora de escopo de propósito:** CQRS, event bus, camadas `application/infra/domain` dentro de cada módulo, genéricos de repositório base.

## Configuração

- Variáveis validadas por um schema `zod` em `src/infra/config/env.schema.ts` (`envSchema`), consumido por `ConfigModule.forRoot({ isGlobal: true, validate })`. A subida falha com mensagem clara se algo estiver inválido.
- **Fora de `src/infra/config/`, config só via `ConfigService<Env, true>`.** Nunca `process.env` direto em outro lugar do código.

## Logs

- Logger: `nestjs-pino` (`PinoLogger`/`Logger` do Nest), configurado em `src/infra/logging/logging.module.ts`.
- Uma linha por requisição via `pino-http`: método, rota, status, duração e `requestId` (reaproveita o header `x-request-id` recebido ou gera um novo, sempre devolvido no header de resposta). `authorization`/`cookie` são redigidos. `/api/health` fica fora da linha de log de requisição (via `autoLogging.ignore`, não via `exclude` — `exclude` desliga o middleware inteiro, inclusive o request id).
- Quando um service concluir um caso de uso, logue em `info` com `{ action, sessionCode, eventType, version }`; rejeição de domínio em `warn` com `{ action, sessionCode, code }`. Um único ponto de log por caso de uso no service — não espalhe `logger.log` pelo meio da lógica.
- **Nunca logue nomes de jogadores** — só ids.

## Injeção de dependência e domínio puro

- Portas (`Clock`, `IdGenerator`, `RandomSource`, repositórios) são `abstract class` injetadas via Nest DI — nunca `@Inject('TOKEN_STRING')`.
- `domain/match` é uma biblioteca de funções puras, sem decorators do Nest, sem `Injectable`, sem I/O. O service é quem chama essas funções e lida com o resto (Prisma, HTTP, logs).
- O único ponto não determinístico do domínio é o sorteio: injete `RandomSource`/`IdGenerator`/`Clock` como parâmetro — nunca `Math.random()`, `new Date()` ou `crypto.randomUUID()` direto dentro de `domain/match`.

## O que testar (e o que não)

- **Unit:** `domain/match` (funções puras) e services (com repositório **em memória**, não Prisma real).
- **Integração:** repositórios Prisma reais, contra Postgres (Testcontainers ou o `docker-compose.yml` local).
- **E2E:** rotas HTTP fim a fim com Testcontainers (`test/*.e2e-spec.ts`).
- **Suíte de contrato:** cenários que valem para várias implementações de uma mesma porta (ex.: repositório em memória e Prisma) ficam em `<nome>-contract-test.ts`, exportando uma função `run...Contract(factory)` que cada `*.test.ts`/`*.e2e-spec.ts` chama com a sua implementação. O sufixo mantém o arquivo fora do build e da contagem de linhas de lógica.
- **Não teste:** DTOs triviais (só `class-validator` decorators, sem lógica), nem os módulos do Nest em si (`*.module.ts`) — eles só declaram fiação, o comportamento é testado através do service/controller.

## Verificação antes de fechar uma task

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e   # precisa do Docker rodando
```

Mudou algum DTO (request/response de rota)? Rode `npm run openapi` e **commite o `openapi.json` atualizado** junto — é a partir dele que o client gera os tipos.

## Comandos

| Comando | Uso |
|---|---|
| `docker compose up -d` | Sobe o Postgres 16 de desenvolvimento. |
| `npm run dev` | Servidor em modo watch. |
| `npm run build` / `npm start` | Build de produção / executa o build. |
| `npm test` / `npm run test:watch` | Testes unitários (Vitest). |
| `npm run test:e2e` | Testes e2e (Testcontainers). |
| `npm run lint` | ESLint (`no-explicit-any` e `no-unsafe-*` são erro). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run openapi` | Gera `openapi.json` sem subir o servidor HTTP. |
| `npm run db:migrate` | Aplica migrations do Prisma (`prisma migrate dev`). |
