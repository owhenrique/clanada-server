import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional } from "class-validator";

export class RuleTogglesDto {
  @ApiPropertyOptional({ description: "Padrão: true" })
  @IsOptional()
  @IsBoolean()
  arrivalPriority?: boolean;
}

export class RuleTogglesViewDto {
  @ApiProperty()
  arrivalPriority!: boolean;
}
