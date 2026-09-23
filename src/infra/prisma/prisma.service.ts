import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import type { Env } from "../config/env.schema";
import { PrismaClient } from "../../generated/prisma/client";

const logger = new Logger("Prisma");

function createPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => logger.error({ err }, "Database pool error"));
  return pool;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg(createPool(configService.get("DATABASE_URL", { infer: true }))),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      logger.error({ err }, "Failed to connect to the database");
      throw err;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
