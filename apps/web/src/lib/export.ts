// ──────────────────────────────────────────────────────────────
// Growth OS — CSV Export Utility
// Client-side CSV generation and download
// ──────────────────────────────────────────────────────────────

interface Column<T> {
  key: keyof T;
  label: string;
  format?: (value: unknown) => string;
}

export function exportToCSV<T extends object>(
  data: T[],
  filename: string,
  columns?: Column<T>[],
): void {
  if (data.length === 0) return;

  const cols = columns ?? (Object.keys(data[0]!) as Array<keyof T>).map((key) => ({
    key,
    label: String(key),
    format: undefined as ((value: unknown) => string) | undefined,
  }));

  const escapeCell = (value: unknown): string => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = cols.map((c) => escapeCell(c.label)).join(',');
  const rows = data.map((row) =>
    cols.map((c) => {
      const raw = row[c.key];
      const value = c.format ? c.format(raw) : raw;
      return escapeCell(value);
    }).join(','),
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
