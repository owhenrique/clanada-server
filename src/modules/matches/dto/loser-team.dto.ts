import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class LoserTeamDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  loserTeamId!: string;
}
