import { InMemoryMatchesRepository } from "./in-memory-matches.repository";
import { runMatchesRepositoryContract } from "./matches-repository-contract";

runMatchesRepositoryContract("in-memory", () => new InMemoryMatchesRepository());
