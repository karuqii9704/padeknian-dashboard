import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "padeknian-dashboard" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
