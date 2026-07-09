-- AlterTable
ALTER TABLE "Account" ADD COLUMN "lastApiSyncAt" DATETIME;
ALTER TABLE "Account" ADD COLUMN "apiSyncError" TEXT;
