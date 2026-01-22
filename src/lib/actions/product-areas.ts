"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getProductAreas() {
  return prisma.productArea.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getProductArea(id: string) {
  return prisma.productArea.findUnique({
    where: { id },
    include: { charters: true },
  });
}

export async function createProductArea(data: {
  name: string;
  description?: string;
  tags?: string;
}) {
  const productArea = await prisma.productArea.create({
    data: {
      name: data.name,
      description: data.description || null,
      tags: data.tags || null,
    },
  });
  revalidatePath("/");
  return productArea;
}

export async function updateProductArea(
  id: string,
  data: {
    name?: string;
    description?: string;
    tags?: string;
  }
) {
  const productArea = await prisma.productArea.update({
    where: { id },
    data,
  });
  revalidatePath("/");
  return productArea;
}

export async function deleteProductArea(id: string) {
  await prisma.productArea.delete({ where: { id } });
  revalidatePath("/");
}
