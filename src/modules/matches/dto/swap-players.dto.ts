import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class SwapPlayersDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  playerAId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  playerBId!: string;
}
