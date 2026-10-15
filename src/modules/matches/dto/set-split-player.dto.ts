import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsInt, Max, Min } from "class-validator";

export class SetSplitPlayerDto {
  @ApiProperty()
  @IsBoolean()
  pays!: boolean;

  @ApiProperty({ minimum: 0, maximum: 1000000 })
  @IsInt()
  @Min(0)
  @Max(1000000)
  paidCents!: number;

  @ApiProperty()
  @IsBoolean()
  received!: boolean;
}
