import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { IfMatch } from "../../../shared/http/if-match.decorator";
import { CreateMatchDto } from "../dto/create-match.dto";
import { SwapPlayersDto } from "../dto/swap-players.dto";
import { MatchView } from "../services/match-view";
import { MatchesService } from "../services/matches.service";

@ApiTags("matches")
@Controller("matches")
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @ApiCreatedResponse({ type: MatchView })
  create(@Body() dto: CreateMatchDto): Promise<MatchView> {
    return this.matchesService.create({ config: dto.config, playerNames: dto.playerNames });
  }

  @Get(":code")
  @ApiOkResponse({ type: MatchView })
  get(@Param("code") code: string): Promise<MatchView> {
    return this.matchesService.get(code);
  }

  @Post(":code/reshuffle")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  reshuffle(
    @Param("code") code: string,
    @IfMatch() version: number,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "reshuffle" });
  }

  @Post(":code/swap")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  swap(
    @Param("code") code: string,
    @IfMatch() version: number,
    @Body() dto: SwapPlayersDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, {
      type: "swap",
      playerAId: dto.playerAId,
      playerBId: dto.playerBId,
    });
  }

  @Post(":code/start")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  start(
    @Param("code") code: string,
    @IfMatch() version: number,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "start" });
  }
}
