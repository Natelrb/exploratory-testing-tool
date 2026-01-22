-- CreateTable
CREATE TABLE "exploration_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "aiProvider" TEXT NOT NULL DEFAULT 'heuristic',
    "aiModel" TEXT,
    "config" TEXT,
    "charter" TEXT,
    "currentStep" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalActions" INTEGER NOT NULL DEFAULT 0,
    "completedActions" INTEGER NOT NULL DEFAULT 0,
    "startTime" DATETIME,
    "endTime" DATETIME,
    "sessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exploration_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exploration_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "target" TEXT,
    "value" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "duration" INTEGER,
    "observations" TEXT,
    "beforeScreenshot" TEXT,
    "afterScreenshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exploration_actions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "exploration_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exploration_findings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "evidence" TEXT,
    "stepsToReproduce" TEXT,
    "recommendation" TEXT,
    "noteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exploration_findings_runId_fkey" FOREIGN KEY ("runId") REFERENCES "exploration_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exploration_findings_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exploration_evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exploration_evidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "exploration_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exploration_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exploration_logs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "exploration_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
