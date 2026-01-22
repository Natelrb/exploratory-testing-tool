"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import fs from "fs/promises";
import path from "path";

export async function getExplorationRuns(filters?: { status?: string }) {
  return prisma.explorationRun.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      actions: { orderBy: { sequence: "asc" } },
      findings: true,
      evidence: true,
      _count: { select: { actions: true, findings: true, logs: true } },
    },
  });
}

export async function getExplorationRun(id: string) {
  return prisma.explorationRun.findUnique({
    where: { id },
    include: {
      actions: { orderBy: { sequence: "asc" } },
      findings: { orderBy: { createdAt: "asc" } },
      evidence: { orderBy: { timestamp: "asc" } },
      logs: { orderBy: { timestamp: "asc" } },
      session: {
        include: { charter: true },
      },
    },
  });
}

export async function createExplorationRun(data: {
  url: string;
  aiProvider: string;
  aiModel?: string;
  config?: object;
}) {
  const run = await prisma.explorationRun.create({
    data: {
      url: data.url,
      aiProvider: data.aiProvider,
      aiModel: data.aiModel,
      config: data.config ? JSON.stringify(data.config) : null,
      status: "pending",
    },
  });
  revalidatePath("/explore");
  return run;
}

export async function updateExplorationRunStatus(
  id: string,
  status: string,
  data?: {
    currentStep?: string;
    progress?: number;
    charter?: object;
    startTime?: Date;
    endTime?: Date;
    totalActions?: number;
    completedActions?: number;
  }
) {
  const run = await prisma.explorationRun.update({
    where: { id },
    data: {
      status,
      ...(data?.currentStep !== undefined && { currentStep: data.currentStep }),
      ...(data?.progress !== undefined && { progress: data.progress }),
      ...(data?.charter && { charter: JSON.stringify(data.charter) }),
      ...(data?.startTime && { startTime: data.startTime }),
      ...(data?.endTime && { endTime: data.endTime }),
      ...(data?.totalActions !== undefined && { totalActions: data.totalActions }),
      ...(data?.completedActions !== undefined && { completedActions: data.completedActions }),
    },
  });
  revalidatePath(`/explore/${id}`);
  return run;
}

export async function addExplorationAction(
  runId: string,
  data: {
    sequence: number;
    actionType: string;
    target?: string;
    value?: string;
    description: string;
  }
) {
  const action = await prisma.explorationAction.create({
    data: {
      runId,
      sequence: data.sequence,
      actionType: data.actionType,
      target: data.target,
      value: data.value,
      description: data.description,
      status: "pending",
    },
  });
  revalidatePath(`/explore/${runId}`);
  return action;
}

export async function updateExplorationAction(
  id: string,
  data: {
    status?: string;
    error?: string;
    duration?: number;
    observations?: string[];
    beforeScreenshot?: string;
    afterScreenshot?: string;
  }
) {
  const action = await prisma.explorationAction.update({
    where: { id },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.error && { error: data.error }),
      ...(data.duration !== undefined && { duration: data.duration }),
      ...(data.observations && { observations: JSON.stringify(data.observations) }),
      ...(data.beforeScreenshot && { beforeScreenshot: data.beforeScreenshot }),
      ...(data.afterScreenshot && { afterScreenshot: data.afterScreenshot }),
    },
    include: { run: true },
  });
  revalidatePath(`/explore/${action.runId}`);
  return action;
}

export async function addExplorationFinding(
  runId: string,
  data: {
    type: string;
    severity: string;
    title: string;
    description: string;
    location?: string;
    evidence?: string[];
    stepsToReproduce?: string[];
    recommendation?: string;
  }
) {
  const finding = await prisma.explorationFinding.create({
    data: {
      runId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      description: data.description,
      location: data.location,
      evidence: data.evidence ? JSON.stringify(data.evidence) : null,
      stepsToReproduce: data.stepsToReproduce ? JSON.stringify(data.stepsToReproduce) : null,
      recommendation: data.recommendation,
    },
  });
  revalidatePath(`/explore/${runId}`);
  return finding;
}

export async function addExplorationEvidence(
  runId: string,
  data: {
    type: string;
    path: string;
    description: string;
    metadata?: object;
  }
) {
  const evidence = await prisma.explorationEvidence.create({
    data: {
      runId,
      type: data.type,
      path: data.path,
      description: data.description,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    },
  });
  revalidatePath(`/explore/${runId}`);
  return evidence;
}

export async function addExplorationLog(
  runId: string,
  level: string,
  message: string,
  data?: object
) {
  const log = await prisma.explorationLog.create({
    data: {
      runId,
      level,
      message,
      data: data ? JSON.stringify(data) : null,
    },
  });
  return log;
}

export async function getExplorationLogs(runId: string, limit = 100) {
  return prisma.explorationLog.findMany({
    where: { runId },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function deleteExplorationRun(id: string) {
  // Delete evidence files from filesystem
  const evidenceDir = path.join(process.cwd(), "public", "evidence", id);
  try {
    await fs.rm(evidenceDir, { recursive: true, force: true });
  } catch {
    // Directory may not exist, ignore
  }

  // Delete database record (cascades to related tables)
  await prisma.explorationRun.delete({ where: { id } });
  revalidatePath("/explore");
}

// Convert exploration finding to a manual session note
export async function convertFindingToNote(
  findingId: string,
  sessionId: string,
  noteType: string
) {
  const finding = await prisma.explorationFinding.findUnique({
    where: { id: findingId },
  });

  if (!finding) throw new Error("Finding not found");

  const note = await prisma.note.create({
    data: {
      sessionId,
      type: noteType,
      text: `[AI Finding] ${finding.title}\n\n${finding.description}${
        finding.recommendation ? `\n\nRecommendation: ${finding.recommendation}` : ""
      }`,
    },
  });

  // Link the finding to the note
  await prisma.explorationFinding.update({
    where: { id: findingId },
    data: { noteId: note.id },
  });

  revalidatePath(`/explore/${finding.runId}`);
  revalidatePath(`/session/${sessionId}`);

  return note;
}
