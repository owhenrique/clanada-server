import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, Post, Put, Query } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { IfMatch } from "../../../shared/http/if-match.decorator";
import { ChangeTeamSizeDto } from "../dto/change-team-size.dto";
import { CreateMatchDto } from "../dto/create-match.dto";
import { JoinPlayerDto } from "../dto/join-player.dto";
import { LeaveQueryDto } from "../dto/leave-query.dto";
import { LoserTeamDto } from "../dto/loser-team.dto";
import { SwapPlayersDto } from "../dto/swap-players.dto";
import { MatchView, PenaltiesRequiredView } from "../services/match-view";
import { MatchesService } from "../services/matches.service";

@ApiTags("matches")
@ApiTooManyRequestsResponse({ description: "Rate limit por IP excedido ou TOO_MANY_LOOKUPS." })
@SkipThrottle({ create: true })
@Controller("matches")
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Post()
  @SkipThrottle({ create: false })
  @ApiCreatedResponse({ type: MatchView })
  create(@Body() dto: CreateMatchDto): Promise<MatchView> {
    return this.matchesService.create({ config: dto.config, playerNames: dto.playerNames });
  }

  @Get(":code")
  @ApiOkResponse({ type: MatchView })
  get(@Param("code") code: string, @Ip() clientIp: string): Promise<MatchView> {
    return this.matchesService.get(code, clientIp);
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

  @Post(":code/games/win")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  win(
    @Param("code") code: string,
    @IfMatch() version: number,
    @Body() dto: LoserTeamDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "win", loserTeamId: dto.loserTeamId });
  }

  @Post(":code/games/draw")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiExtraModels(MatchView, PenaltiesRequiredView)
  @ApiOkResponse({
    schema: { oneOf: [{ $ref: getSchemaPath(MatchView) }, { $ref: getSchemaPath(PenaltiesRequiredView) }] },
  })
  draw(
    @Param("code") code: string,
    @IfMatch() version: number,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "draw" });
  }

  @Post(":code/games/penalties")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  penalties(
    @Param("code") code: string,
    @IfMatch() version: number,
    @Body() dto: LoserTeamDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "penalties", loserTeamId: dto.loserTeamId });
  }

  @Post(":code/players")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  join(
    @Param("code") code: string,
    @IfMatch() version: number,
    @Body() dto: JoinPlayerDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "join", name: dto.name });
  }

  @Delete(":code/players/:playerId")
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  leave(
    @Param("code") code: string,
    @Param("playerId") playerId: string,
    @IfMatch() version: number,
    @Query() dto: LeaveQueryDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "leave", playerId, fallback: dto.fallback });
  }

  @Put(":code/team-size")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  changeTeamSize(
    @Param("code") code: string,
    @IfMatch() version: number,
    @Body() dto: ChangeTeamSizeDto,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "changeTeamSize", teamSize: dto.teamSize });
  }

  @Post(":code/end")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  end(
    @Param("code") code: string,
    @IfMatch() version: number,
  ): Promise<MatchView | { penaltiesRequired: true }> {
    return this.matchesService.execute(code, version, { type: "end" });
  }

  @Post(":code/timer/start")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  startTimer(@Param("code") code: string, @IfMatch() version: number): Promise<MatchView> {
    return this.matchesService.timer(code, version, "start");
  }

  @Post(":code/timer/pause")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  pauseTimer(@Param("code") code: string, @IfMatch() version: number): Promise<MatchView> {
    return this.matchesService.timer(code, version, "pause");
  }

  @Post(":code/timer/reset")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  resetTimer(@Param("code") code: string, @IfMatch() version: number): Promise<MatchView> {
    return this.matchesService.timer(code, version, "reset");
  }

  @Post(":code/undo")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "If-Match", required: true })
  @ApiOkResponse({ type: MatchView })
  undo(@Param("code") code: string, @IfMatch() version: number): Promise<MatchView> {
    return this.matchesService.undo(code, version);
  }
}
