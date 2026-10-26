-- AlterTable: Add emailVerified column to User (nullable, no default to prevent grandfathering legacy accounts)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
