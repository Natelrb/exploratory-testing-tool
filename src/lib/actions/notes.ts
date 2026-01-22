"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type NoteType = "observation" | "question" | "risk" | "bug" | "follow_up";

export async function getNotes(sessionId: string) {
  return prisma.note.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: { outcomes: true },
  });
}

export async function getNote(id: string) {
  return prisma.note.findUnique({
    where: { id },
    include: { outcomes: true, session: true },
  });
}

export async function createNote(data: {
  sessionId: string;
  type: NoteType;
  text: string;
}) {
  const note = await prisma.note.create({
    data: {
      sessionId: data.sessionId,
      type: data.type,
      text: data.text,
    },
  });
  revalidatePath(`/session/${data.sessionId}`);
  revalidatePath(`/debrief/${data.sessionId}`);
  return note;
}

export async function updateNote(
  id: string,
  data: {
    type?: NoteType;
    text?: string;
  }
) {
  const note = await prisma.note.update({
    where: { id },
    data,
    include: { session: true },
  });
  revalidatePath(`/session/${note.sessionId}`);
  revalidatePath(`/debrief/${note.sessionId}`);
  return note;
}

export async function deleteNote(id: string) {
  const note = await prisma.note.findUnique({ where: { id } });
  if (note) {
    await prisma.note.delete({ where: { id } });
    revalidatePath(`/session/${note.sessionId}`);
    revalidatePath(`/debrief/${note.sessionId}`);
  }
}
