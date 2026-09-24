import type { GameRecord } from "../../../domain/match";

export abstract class GameHistoryRepository {
  abstract listByMatchId(matchId: string): Promise<GameRecord[]>;
}
