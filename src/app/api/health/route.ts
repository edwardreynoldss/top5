import { NextResponse } from "next/server";
import { whichTools } from "@/lib/bins";

export const runtime = "nodejs";

export async function GET() {
  const tools = whichTools();
  const ok = Object.values(tools).every((t) => t.ok);
  return NextResponse.json({ ok, tools });
}
