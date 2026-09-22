/*
  Warnings:

  - The primary key for the `MatchEvent` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `MatchEvent` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "MatchEvent_matchId_seq_idx";

-- DropIndex
DROP INDEX "MatchEvent_matchId_seq_key";

-- AlterTable
ALTER TABLE "MatchEvent" DROP CONSTRAINT "MatchEvent_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("matchId", "seq");
