import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class SetSplitPlayerDto {
  @ApiProperty()
  @IsBoolean()
  pays!: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  receivedCents?: number;

  @ApiPropertyOptional({
    deprecated: true,
    description: "Legado; quando true, usa a parte vigente como valor recebido",
  })
  @IsOptional()
  @IsBoolean()
  received?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1000000,
    deprecated: true,
    description: "Legado; ignorado no cálculo",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  paidCents?: number;
}
