import { z } from "zod";

// Skema murni (tanpa dependensi server) yang aman diimpor dari komponen client.

export const uuidSchema = z.string().uuid("ID tidak valid.");

export const tanggalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, "Tanggal tidak valid.");

export const volumeSchema = z
  .number({ message: "Target volume harus berupa angka." })
  .positive("Target volume harus lebih dari 0.")
  .max(9_999_999_999.99, "Target volume terlalu besar.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Target volume maksimal 2 angka desimal.");

export const PRIORITAS = ["RENDAH", "SEDANG", "TINGGI"] as const;
export type Prioritas = (typeof PRIORITAS)[number];
