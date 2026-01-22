"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getCharters() {
  return prisma.charter.findMany({
    orderBy: { createdAt: "desc" },
    include: { productArea: true },
  });
}

export async function getCharterTemplates() {
  return prisma.charter.findMany({
    where: { isTemplate: true },
    orderBy: { mission: "asc" },
    include: { productArea: true },
  });
}

export async function getCharter(id: string) {
  return prisma.charter.findUnique({
    where: { id },
    include: { productArea: true, sessions: true },
  });
}

export async function createCharter(data: {
  mission: string;
  riskFocus?: string;
  scope?: string;
  constraints?: string;
  isTemplate?: boolean;
  productAreaId?: string;
}) {
  const charter = await prisma.charter.create({
    data: {
      mission: data.mission,
      riskFocus: data.riskFocus || null,
      scope: data.scope || null,
      constraints: data.constraints || null,
      isTemplate: data.isTemplate || false,
      productAreaId: data.productAreaId || null,
    },
  });
  revalidatePath("/");
  return charter;
}

export async function updateCharter(
  id: string,
  data: {
    mission?: string;
    riskFocus?: string;
    scope?: string;
    constraints?: string;
    isTemplate?: boolean;
    productAreaId?: string;
  }
) {
  const charter = await prisma.charter.update({
    where: { id },
    data,
  });
  revalidatePath("/");
  return charter;
}

export async function deleteCharter(id: string) {
  await prisma.charter.delete({ where: { id } });
  revalidatePath("/");
}
