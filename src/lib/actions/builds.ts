"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getBuilds() {
  return prisma.build.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getBuild(id: string) {
  return prisma.build.findUnique({
    where: { id },
    include: { sessions: true },
  });
}

export async function createBuild(data: {
  environment: string;
  version: string;
  deployedAt?: Date;
  notes?: string;
}) {
  const build = await prisma.build.create({
    data: {
      environment: data.environment,
      version: data.version,
      deployedAt: data.deployedAt || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/");
  return build;
}

export async function updateBuild(
  id: string,
  data: {
    environment?: string;
    version?: string;
    deployedAt?: Date;
    notes?: string;
  }
) {
  const build = await prisma.build.update({
    where: { id },
    data,
  });
  revalidatePath("/");
  return build;
}

export async function deleteBuild(id: string) {
  await prisma.build.delete({ where: { id } });
  revalidatePath("/");
}
