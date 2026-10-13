export const LEGACY_TABLES = ["external_records", "outreach_sequences", "outreach_sequence_runs"] as const;
export const canDeleteEventMessage = (status: string) => ["pending", "review", "failed", "cancelled", "skipped"].includes(status);

/** Read every page; never turn a partial or failed read into a successful backup. */
export async function readAllPages<T>(read: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data) throw new Error("The outreach data could not be read completely.");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export function legacyCsv(rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap(Object.keys)));
  const cell = (value: unknown) => {
    let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    // Keep spreadsheet programs from treating imported contact data as formulas.
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [keys.map(cell).join(","), ...rows.map((row) => keys.map((key) => cell(row[key])).join(","))].join("\r\n");
}