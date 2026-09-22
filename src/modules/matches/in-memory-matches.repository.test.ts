import { InMemoryMatchesRepository } from "./in-memory-matches.repository";
import { runMatchesRepositoryContract } from "./matches-repository-contract-test";

runMatchesRepositoryContract(
  "in-memory",
  () => new InMemoryMatchesRepository(),
);
