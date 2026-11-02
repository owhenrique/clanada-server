import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, ArrayUnique, IsArray, IsIn } from "class-validator";
import { BIB_COLOR_KEYS } from "./bib-colors";

export class AddColorsDto {
  @ApiProperty({ type: [String], enum: BIB_COLOR_KEYS, minItems: 1, uniqueItems: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(BIB_COLOR_KEYS, { each: true })
  colors!: string[];
}
