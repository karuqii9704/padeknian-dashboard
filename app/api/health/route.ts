import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkHealth } from "@/lib/health";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth(() => db.$queryRaw`SELECT 1`);
  if (result.status !== "ok") logger.error({ result }, "health check gagal");
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
