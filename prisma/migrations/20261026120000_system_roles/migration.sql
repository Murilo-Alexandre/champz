-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPERADMIN', 'ADMIN', 'USER');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "GlobalRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);


-- Superadmin único: no máximo um usuário com papel SUPERADMIN.
CREATE UNIQUE INDEX "user_single_superadmin" ON "user" ("role") WHERE "role" = 'SUPERADMIN';

-- Identidade do Superadmin é gravada uma vez e não pode ser trocada nem removida pela aplicação.
CREATE OR REPLACE FUNCTION champz_superadmin_setting_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."key" = 'superadminUserId' THEN
    RAISE EXCEPTION 'superadminUserId é imutável';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SystemSetting_superadmin_immutable" BEFORE UPDATE OR DELETE ON "SystemSetting"
  FOR EACH ROW EXECUTE FUNCTION champz_superadmin_setting_immutable();
