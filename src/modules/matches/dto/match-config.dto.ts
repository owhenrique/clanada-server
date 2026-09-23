import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, ArrayUnique, IsIn, IsInt, Max, Min } from "class-validator";
import { BIB_COLOR_KEYS } from "./bib-colors";

export class MatchConfigDto {
  @ApiProperty({ minimum: 2 })
  @IsInt()
  @Min(2)
  teamSize!: number;

  @ApiProperty({ type: [String], enum: BIB_COLOR_KEYS, minItems: 2 })
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsIn(BIB_COLOR_KEYS, { each: true })
  colors!: string[];

  @ApiProperty({ minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  gameMinutes!: number;
}
