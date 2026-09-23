import { describe, expect, it } from "vitest";
import type { Event, MatchState } from "../../../domain/match";
import { InMemoryMatchesRepository } from "./in-memory-matches.repository";
import { MatchCodeCollisionError } from "./matches.repository";
import { runMatchesRepositoryContract } from "./matches-repository-contract-test";

runMatchesRepositoryContract(
  "in-memory",
  () => new InMemoryMatchesRepository(),
);

describe("InMemoryMatchesRepository.create code collision", () => {
  const snapshot: MatchState = {
    status: "DRAFT",
    config: { teamSize: 2, colors: ["verde", "vermelho"], gameMinutes: 10 },
    teams: [],
    queue: [],
  };
  const event: Event = { type: "MATCH_CREATED", config: snapshot.config, players: [], teamIds: [] };

  it("CEN-2 (DT-5): throws MatchCodeCollisionError when the code is already taken", async () => {
    const repository = new InMemoryMatchesRepository();
    await repository.create({ code: "AB23CD45", event, snapshot });

    await expect(repository.create({ code: "AB23CD45", event, snapshot })).rejects.toBeInstanceOf(
      MatchCodeCollisionError,
    );
  });
});
