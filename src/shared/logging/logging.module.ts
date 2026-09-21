import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import type { Env } from "../../config/env.schema";

function resolveRequestId(request: IncomingMessage, response: ServerResponse): string {
  const header = request.headers["x-request-id"];
  const incoming = Array.isArray(header) ? header[0] : header;
  const requestId = incoming ?? randomUUID();
  response.setHeader("x-request-id", requestId);
  return requestId;
}

function isHealthCheckRequest(request: IncomingMessage): boolean {
  return request.url === "/api/health";
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const nodeEnv = configService.get("NODE_ENV", { infer: true });
        return {
          pinoHttp: {
            level: configService.get("LOG_LEVEL", { infer: true }),
            genReqId: resolveRequestId,
            redact: ["req.headers.authorization", "req.headers.cookie"],
            autoLogging: { ignore: isHealthCheckRequest },
            transport: nodeEnv === "production" ? undefined : { target: "pino-pretty" },
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
