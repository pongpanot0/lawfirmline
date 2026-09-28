CREATE TABLE "ClientAnnualReport" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "audience" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "recipientContactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ClientAnnualReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientAnnualReport_firmId_clientId_year_idx" ON "ClientAnnualReport"("firmId", "clientId", "year");
CREATE INDEX "ClientAnnualReport_recipientContactIds_idx" ON "ClientAnnualReport" USING GIN ("recipientContactIds");
ALTER TABLE "ClientAnnualReport" ADD CONSTRAINT "ClientAnnualReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
