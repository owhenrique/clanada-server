import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class LeaveQueryDto {
  @ApiPropertyOptional({ enum: ["reduce-team-size"] })
  @IsOptional()
  @IsIn(["reduce-team-size"])
  fallback?: "reduce-team-size";
}
