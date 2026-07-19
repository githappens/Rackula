import { describe, it, expect } from "vitest";
import { buildPatchListCsv } from "$lib/utils/export/patch-list";

describe("patch list CSV", () => {
  it("emits header plus one row per connection", () => {
    const csv = buildPatchListCsv([
      { aDevice: "Preamp", aPort: "Line Out 1", bDevice: "Compressor", bPort: "In 1",
        type: "trs-1-4", signal: "analog-audio-line", label: "vox chain" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("From Device,From Port,To Device,To Port,Connector,Signal,Label");
    expect(lines[1]).toContain("Preamp");
  });

  it("escapes fields per the existing CSV escaping rules", () => {
    // Reuse upstream's formula-injection-safe CSV escaping (see the existing
    // CSV export util). Import the same escape helper, do NOT write a new one.
    const csv = buildPatchListCsv([
      { aDevice: '=HYPERLINK("x")', aPort: "a,b", bDevice: 'say "hi"', bPort: "1",
        type: "xlr-3", signal: "analog-audio-line", label: "" },
    ]);
    expect(csv).not.toContain('\n=');   // formula injection neutralized
  });
});
