import type { MatchState } from "../types";

export function changeTeamSize(
  _state: MatchState,
  _teamSize: number,
  _createTeamId: () => string,
): MatchState {
  throw new Error("not implemented: team size changes ship in S4");
}
