import { escapeCSVField } from "./data";

/**
 * One row of patch-list data, mapped from a ConnectionRow before calling
 * buildPatchListCsv. Keeping the input shape flat and string-only lets the
 * function remain pure and easy to test without a full layout store.
 */
export interface PatchListRow {
  aDevice: string;
  aPort: string;
  bDevice: string;
  bPort: string;
  /** Connector type (port type of the a-side endpoint). */
  type: string;
  /** Effective signal type of the cable. */
  signal: string;
  label: string;
}

const HEADER = "From Device,From Port,To Device,To Port,Connector,Signal,Label";

/**
 * Build a CSV string for the given patch-list rows.
 * - Header is always emitted first.
 * - Every field is passed through the shared escapeCSVField helper so formula
 *   injection is neutralized (same rules as the rack-inventory CSV export).
 * - Lines are joined with "\n" (LF only) so the caller can split on "\n" and
 *   read lines[0] as the header without a trailing "\r".
 */
export function buildPatchListCsv(rows: PatchListRow[]): string {
  const csvRows = rows.map((r) =>
    [
      escapeCSVField(r.aDevice),
      escapeCSVField(r.aPort),
      escapeCSVField(r.bDevice),
      escapeCSVField(r.bPort),
      escapeCSVField(r.type),
      escapeCSVField(r.signal),
      escapeCSVField(r.label),
    ].join(","),
  );

  return [HEADER, ...csvRows].join("\n");
}
