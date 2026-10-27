-- Catálogo categorizado com escudos estáticos e modo "escolha do adversário". Só adiciona; nada é apagado.
ALTER TYPE "ClubAssignmentMode" ADD VALUE IF NOT EXISTS 'OPPONENT_CHOICE';

CREATE TYPE "ClubCategory" AS ENUM ('NATIONAL', 'INTERNATIONAL', 'NATIONAL_TEAM');

ALTER TABLE "Club" ADD COLUMN "crestPath" TEXT;
ALTER TABLE "Club" ADD COLUMN "slug" TEXT;
ALTER TABLE "Club" ADD COLUMN "category" "ClubCategory" NOT NULL DEFAULT 'INTERNATIONAL';

CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");
