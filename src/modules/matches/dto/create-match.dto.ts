import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length, ValidateNested } from "class-validator";
import { MatchConfigDto } from "./match-config.dto";

export class CreateMatchDto {
  @ApiProperty({ type: MatchConfigDto })
  @ValidateNested()
  @Type(() => MatchConfigDto)
  config!: MatchConfigDto;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  playerNames!: string[];
}
