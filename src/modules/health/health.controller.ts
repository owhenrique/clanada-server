import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { HealthService, type HealthStatus } from "./health.service";

@ApiTags("health")
@SkipThrottle({ default: true, create: true })
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: "Servidor e banco de dados disponíveis" })
  check(): Promise<HealthStatus> {
    return this.healthService.check();
  }
}
