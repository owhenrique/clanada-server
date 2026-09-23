import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class JoinPlayerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 40)
  name!: string;
}
