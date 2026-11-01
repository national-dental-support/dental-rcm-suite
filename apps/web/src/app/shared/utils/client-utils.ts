// src/app/shared/utils/client-utils.ts
export const CLIENT_MAP: Record<number, string> = {
  1: "",
  2: "Fairfield Oral Surgery",
  3: "Greenberg Oral and Maxillofacial Surgery",
  4: "Rothman and Kim (Cinnaminson)",
  5: "Rothman and Kim (Philadelphia)",
  6: "OMS or Westfield",
};

export function getClientFromFileName(
  fileName: string
): { id: number | null; name: string } {
  const m = fileName.match(/^(\d+)_/);
  if (!m) return { id: null, name: "Unknown Client" };

  const id = parseInt(m[1], 10);
  const name = CLIENT_MAP[id] ?? "Unknown Client";
  return { id, name };
}
