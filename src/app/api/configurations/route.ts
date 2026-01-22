// API routes for managing saved configurations
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET all saved configurations
export async function GET() {
  try {
    const configs = await prisma.savedConfiguration.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(configs);
  } catch (error) {
    console.error("Failed to fetch configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch configurations" },
      { status: 500 }
    );
  }
}

// POST create new configuration
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, url, username, password, description } = body;

    if (!name || !url) {
      return NextResponse.json(
        { error: "Name and URL are required" },
        { status: 400 }
      );
    }

    const config = await prisma.savedConfiguration.create({
      data: {
        name,
        url,
        username: username || null,
        password: password || null,
        description: description || null,
      },
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error("Failed to create configuration:", error);
    return NextResponse.json(
      { error: "Failed to create configuration" },
      { status: 500 }
    );
  }
}
