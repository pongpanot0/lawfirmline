-- ฝ่ายเรา (โจทก์/จำเลย) บน Intake และ Case
CREATE TYPE "PartyRole" AS ENUM ('PLAINTIFF', 'DEFENDANT');
ALTER TABLE "Intake" ADD COLUMN "partyRole" "PartyRole";
ALTER TABLE "Case" ADD COLUMN "partyRole" "PartyRole";
