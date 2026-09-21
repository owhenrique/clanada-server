import { Injectable } from "@nestjs/common";
import { PrismaService } from "../shared/database/prisma.service";

export type HealthStatus = {
  status: "ok";
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
