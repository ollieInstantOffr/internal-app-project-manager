-- AlterTable
ALTER TABLE "Assistant" ADD COLUMN     "oauthClientId" TEXT;

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "logoUri" TEXT,
    "clientUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "scope" TEXT NOT NULL DEFAULT 'mcp',
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccessToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "refreshHash" TEXT,
    "clientId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'mcp',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthCode_codeHash_key" ON "OAuthAuthCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthAuthCode_clientId_idx" ON "OAuthAuthCode"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccessToken_tokenHash_key" ON "OAuthAccessToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccessToken_refreshHash_key" ON "OAuthAccessToken"("refreshHash");

-- CreateIndex
CREATE INDEX "OAuthAccessToken_assistantId_idx" ON "OAuthAccessToken"("assistantId");

-- AddForeignKey
ALTER TABLE "OAuthAuthCode" ADD CONSTRAINT "OAuthAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthCode" ADD CONSTRAINT "OAuthAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "Assistant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
