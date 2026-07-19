import { describe, it, expect } from "vitest";
import { inferDirection, instantiatePorts } from "$lib/utils/port-utils";
import { PlacedPortSchema } from "$lib/schemas";
import type { DeviceType } from "$lib/types";

describe("inferDirection", () => {
  it("returns input for mgmt-only ports regardless of type", () => {
    expect(inferDirection("1000base-t", true)).toBe("input");
  });
  it("returns input for console", () => {
    expect(inferDirection("console")).toBe("input");
  });
  it("returns undefined for AV types (explicit direction required)", () => {
    expect(inferDirection("xlr-3")).toBeUndefined();
    expect(inferDirection("adat-optical")).toBeUndefined();
  });
  it("returns bidirectional for network types", () => {
    expect(inferDirection("1000base-t")).toBe("bidirectional");
  });
});

describe("instantiatePorts direction", () => {
  const deviceType = {
    slug: "test-pre", model: "Test Pre", u_height: 1, category: "av-media",
    colour: "#000000",
    interfaces: [
      { name: "Mic In", type: "xlr-3", direction: "input" },
      { name: "Eth", type: "1000base-t" },
    ],
  } as unknown as DeviceType;

  it("copies explicit template direction and infers the rest", () => {
    const ports = instantiatePorts(deviceType);
    expect(ports[0].direction).toBe("input");
    expect(ports[1].direction).toBe("bidirectional");
  });
});

describe("backward compatibility", () => {
  it("PlacedPort without direction still validates", () => {
    const result = PlacedPortSchema.safeParse({
      id: "p1", template_name: "1", template_index: 0, type: "1000base-t",
    });
    expect(result.success).toBe(true);
  });
});
