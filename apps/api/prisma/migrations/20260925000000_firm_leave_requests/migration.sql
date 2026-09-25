CREATE TYPE "LeaveType" AS ENUM ('SICK', 'PERSONAL', 'VACATION');

CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveNoticeLog" (
    "key" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "LeaveNoticeLog_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "LeaveRequest_firmId_startDate_endDate_idx" ON "LeaveRequest"("firmId", "startDate", "endDate");
CREATE INDEX "LeaveRequest_userId_startDate_idx" ON "LeaveRequest"("userId", "startDate");
CREATE UNIQUE INDEX "LeaveRequest_firmId_userId_startDate_endDate_key" ON "LeaveRequest"("firmId", "userId", "startDate", "endDate");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
