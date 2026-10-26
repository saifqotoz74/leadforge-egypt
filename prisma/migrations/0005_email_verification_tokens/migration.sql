-- Step 1: Remove default on User.emailVerified if set, ensuring fail-closed to NULL
ALTER TABLE "User" ALTER COLUMN "emailVerified" DROP DEFAULT;

-- Step 2: Create EmailVerificationToken table
CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 3: Create Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_lookup_idx" ON "EmailVerificationToken"("tokenHash", "expiresAt", "consumedAt");
