import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CascadePlayerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  targetTeamId!: string;
}
