"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type OutcomeType = "ticket" | "new_charter" | "automation_idea";

export async function getOutcomes(noteId?: string) {
  return prisma.outcome.findMany({
    where: noteId ? { noteId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { note: { include: { session: true } } },
  });
}

export async function getOutcome(id: string) {
  return prisma.outcome.findUnique({
    where: { id },
    include: { note: { include: { session: true } } },
  });
}

export async function createOutcome(data: {
  noteId: string;
  outcomeType: OutcomeType;
  externalLink?: string;
  description?: string;
}) {
  const outcome = await prisma.outcome.create({
    data: {
      noteId: data.noteId,
      outcomeType: data.outcomeType,
      externalLink: data.externalLink || null,
      description: data.description || null,
    },
    include: { note: { include: { session: true } } },
  });

  if (outcome.note?.sessionId) {
    revalidatePath(`/debrief/${outcome.note.sessionId}`);
    revalidatePath(`/session/${outcome.note.sessionId}`);
  }
  return outcome;
}

export async function updateOutcome(
  id: string,
  data: {
    outcomeType?: OutcomeType;
    externalLink?: string;
    description?: string;
  }
) {
  const outcome = await prisma.outcome.update({
    where: { id },
    data,
    include: { note: { include: { session: true } } },
  });

  if (outcome.note?.sessionId) {
    revalidatePath(`/debrief/${outcome.note.sessionId}`);
  }
  return outcome;
}

export async function deleteOutcome(id: string) {
  const outcome = await prisma.outcome.findUnique({
    where: { id },
    include: { note: true },
  });

  if (outcome) {
    await prisma.outcome.delete({ where: { id } });
    if (outcome.note?.sessionId) {
      revalidatePath(`/debrief/${outcome.note.sessionId}`);
    }
  }
}

// Create a new charter from a note (for follow-up charters)
export async function createCharterFromNote(
  noteId: string,
  charterData: {
    mission: string;
    riskFocus?: string;
    scope?: string;
    constraints?: string;
    productAreaId?: string;
  }
) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { session: { include: { charter: true } } },
  });

  if (!note) throw new Error("Note not found");

  // Create the new charter
  const charter = await prisma.charter.create({
    data: {
      mission: charterData.mission,
      riskFocus: charterData.riskFocus || null,
      scope: charterData.scope || null,
      constraints: charterData.constraints || null,
      productAreaId: charterData.productAreaId || note.session?.charter?.productAreaId || null,
      isTemplate: false,
    },
  });

  // Create an outcome linking back to the note
  await prisma.outcome.create({
    data: {
      noteId: noteId,
      outcomeType: "new_charter",
      description: `Created follow-up charter: ${charter.mission}`,
    },
  });

  revalidatePath(`/debrief/${note.sessionId}`);
  revalidatePath("/");

  return charter;
}
