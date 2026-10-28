/** Dua huruf inisial untuk avatar; kata yang tidak diawali huruf ("(Demo)", "S.Si.") diabaikan. */
export function inisial(nama: string) {
  const k = nama.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !w.endsWith("."));
  return ((k[0]?.[0] ?? "") + (k.length > 1 ? k[k.length - 1][0] : "")).toUpperCase() || "?";
}
