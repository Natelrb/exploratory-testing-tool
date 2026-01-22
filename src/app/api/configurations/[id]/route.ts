// API routes for managing individual saved configurations
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// DELETE a configuration
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.savedConfiguration.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete configuration:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}

// PATCH update a configuration
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, url, username, password, description } = body;

    const config = await prisma.savedConfiguration.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        username: username !== undefined ? username : undefined,
        password: password !== undefined ? password : undefined,
        description: description !== undefined ? description : undefined,
      },
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to update configuration:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}
