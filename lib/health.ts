export type HealthResult = {
  status: "ok" | "error";
  db: "ok" | "error";
  timestamp: string;
};

export async function checkHealth(
  ping: () => Promise<unknown>,
): Promise<HealthResult> {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await ping();
  } catch {
    dbStatus = "error";
  }
  return {
    status: dbStatus === "ok" ? "ok" : "error",
    db: dbStatus,
    timestamp: new Date().toISOString(),
  };
}
