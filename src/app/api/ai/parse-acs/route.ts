import { NextRequest, NextResponse } from "next/server";
import { previewParseACs } from "@/lib/actions/exploration";

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text?: string };
    if (!text) return NextResponse.json([], { status: 200 });
    const parsed = await previewParseACs(text);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("Failed to parse ACs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Parse failed" },
      { status: 500 }
    );
  }
}
