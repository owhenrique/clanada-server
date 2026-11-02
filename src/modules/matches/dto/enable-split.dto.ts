import { ApiProperty } from "@nestjs/swagger";
import { IsDivisibleBy, IsInt, Max, Min } from "class-validator";

export class EnableSplitDto {
  @ApiProperty({ minimum: 1, maximum: 100000 })
  @IsInt()
  @Min(1)
  @Max(100000)
  hourlyRateCents!: number;

  @ApiProperty({ minimum: 30, maximum: 240, multipleOf: 15 })
  @IsInt()
  @Min(30)
  @Max(240)
  @IsDivisibleBy(15)
  durationMinutes!: number;
}
