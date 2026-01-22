"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getSessions(filters?: {
  productAreaId?: string;
  buildId?: string;
  testerName?: string;
  status?: string;
}) {
  return prisma.session.findMany({
    where: {
      ...(filters?.productAreaId && {
        charter: { productAreaId: filters.productAreaId },
      }),
      ...(filters?.buildId && { buildId: filters.buildId }),
      ...(filters?.testerName && {
        testerName: { contains: filters.testerName },
      }),
      ...(filters?.status && { status: filters.status }),
    },
    orderBy: { startTime: "desc" },
    include: {
      charter: { include: { productArea: true } },
      build: true,
      notes: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      charter: { include: { productArea: true } },
      build: true,
      notes: {
        orderBy: { createdAt: "asc" },
        include: { outcomes: true },
      },
    },
  });
}

export async function getActiveSession() {
  return prisma.session.findFirst({
    where: { status: "active" },
    include: {
      charter: { include: { productArea: true } },
      build: true,
      notes: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function createSession(data: {
  charterId: string;
  buildId?: string;
  testerName: string;
  timeboxMinutes: number;
}) {
  const session = await prisma.session.create({
    data: {
      charterId: data.charterId,
      buildId: data.buildId || null,
      testerName: data.testerName,
      timeboxMinutes: data.timeboxMinutes,
      status: "active",
      startTime: new Date(),
    },
    include: {
      charter: { include: { productArea: true } },
      build: true,
    },
  });
  revalidatePath("/");
  revalidatePath(`/session/${session.id}`);
  return session;
}

export async function endSession(id: string) {
  const session = await prisma.session.update({
    where: { id },
    data: {
      status: "completed",
      endTime: new Date(),
    },
  });
  revalidatePath("/");
  revalidatePath(`/session/${id}`);
  revalidatePath(`/debrief/${id}`);
  return session;
}

export async function updateSessionDebrief(
  id: string,
  data: {
    whatWasCovered?: string;
    whatWasNotCovered?: string;
    keyRisks?: string;
    obstacles?: string;
  }
) {
  const session = await prisma.session.update({
    where: { id },
    data,
  });
  revalidatePath(`/debrief/${id}`);
  revalidatePath(`/session/${id}`);
  revalidatePath("/history");
  return session;
}

export async function deleteSession(id: string) {
  await prisma.session.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/history");
}
