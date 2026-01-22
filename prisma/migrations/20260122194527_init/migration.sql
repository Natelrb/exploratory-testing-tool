-- CreateTable
CREATE TABLE "product_areas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "builds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "environment" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "deployedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "charters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mission" TEXT NOT NULL,
    "riskFocus" TEXT,
    "scope" TEXT,
    "constraints" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "productAreaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "charters_productAreaId_fkey" FOREIGN KEY ("productAreaId") REFERENCES "product_areas" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "charterId" TEXT NOT NULL,
    "buildId" TEXT,
    "testerName" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "timeboxMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'active',
    "whatWasCovered" TEXT,
    "whatWasNotCovered" TEXT,
    "keyRisks" TEXT,
    "obstacles" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sessions_charterId_fkey" FOREIGN KEY ("charterId") REFERENCES "charters" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sessions_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "builds" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "outcomeType" TEXT NOT NULL,
    "externalLink" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outcomes_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
