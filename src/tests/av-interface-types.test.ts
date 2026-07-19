import { describe, it, expect } from "vitest";
import { getPortCategory, AV_INTERFACE_TYPES } from "$lib/utils/port-utils";
import { InterfaceTemplateSchema } from "$lib/schemas";

const AV_TYPES = [...AV_INTERFACE_TYPES] as const;

describe("AV interface types", () => {
  it.each(AV_TYPES)("categorizes %s as av", (type) => {
    expect(getPortCategory(type)).toBe("av");
  });

  it("still categorizes network and console types unchanged", () => {
    expect(getPortCategory("1000base-t")).toBe("network");
    expect(getPortCategory("console")).toBe("console");
  });

  it.each(AV_TYPES)(
    "schema accepts an interface template of type %s",
    (type) => {
      const result = InterfaceTemplateSchema.safeParse({ name: "Mic 1", type });
      expect(result.success).toBe(true);
    },
  );
});
