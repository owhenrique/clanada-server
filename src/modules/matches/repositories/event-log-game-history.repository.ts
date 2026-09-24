import { Injectable } from "@nestjs/common";
import { projectGameHistory, type GameRecord } from "../../../domain/match";
import { GameHistoryRepository } from "./game-history.repository";
import { MatchesRepository } from "./matches.repository";

@Injectable()
export class EventLogGameHistoryRepository extends GameHistoryRepository {
  constructor(private readonly matches: MatchesRepository) {
    super();
  }

  async listByMatchId(matchId: string): Promise<GameRecord[]> {
    return projectGameHistory(await this.matches.listActiveEvents(matchId));
  }
}
