import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDivisibleBy,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export class SplitConfigDto {
  @ApiPropertyOptional({ description: "Padrão: false" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  hourlyRateCents?: number;

  @ApiPropertyOptional({ minimum: 30, maximum: 240, multipleOf: 15 })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(240)
  @IsDivisibleBy(15)
  durationMinutes?: number;
}

export class SplitConfigViewDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  hourlyRateCents!: number;

  @ApiProperty()
  durationMinutes!: number;
}
