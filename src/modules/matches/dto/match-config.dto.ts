import { ApiProperty, ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, ArrayUnique, IsIn, IsInt, IsOptional, Max, Min, ValidateNested } from "class-validator";
import { BIB_COLOR_KEYS } from "./bib-colors";
import { RuleTogglesDto, RuleTogglesViewDto } from "./rule-toggles.dto";

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

  @ApiPropertyOptional({ type: RuleTogglesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RuleTogglesDto)
  ruleToggles?: RuleTogglesDto;
}

export class MatchConfigViewDto extends OmitType(MatchConfigDto, ["ruleToggles"] as const) {
  @ApiProperty({ type: RuleTogglesViewDto })
  ruleToggles!: RuleTogglesViewDto;
}
