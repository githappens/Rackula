import { describe, it, expect } from "vitest";
import { getStarterLibrary } from "$lib/data/starterLibrary";

describe("audio starter devices", () => {
  const bySlug = (slug: string) =>
    getStarterLibrary().find((d) => d.slug === slug);

  it("includes an audio interface with directional AV ports", () => {
    const dev = bySlug("audio-interface");
    expect(dev).toBeDefined();
    const mic = dev!.interfaces!.find((i) => i.name === "Mic/Line 1");
    expect(mic).toMatchObject({ type: "xlr-3", direction: "input" });
    const out = dev!.interfaces!.find((i) => i.name === "Main Out L");
    expect(out).toMatchObject({ type: "trs-1-4", direction: "output" });
  });

  it("includes a patchbay whose ports are explicitly bidirectional", () => {
    const dev = bySlug("patchbay-48");
    expect(dev).toBeDefined();
    expect(dev!.interfaces!.every((i) => i.direction === "bidirectional")).toBe(
      true,
    );
  });
});
