import { describe, it, expect } from "vitest";
import {
  getPortAnchor,
  buildConnectionPath,
} from "$lib/utils/connection-geometry";

describe("connection geometry", () => {
  it("anchors a port at the device position plus port-layout offset", () => {
    // Device at U10 in a 12U rack, 1U high (deviceUHeight in U, uHeight in px):
    //   deviceY = (12 - 10 - 1 + 1) * 22 = 44  (top of the device band)
    // The port row sits PORT_Y_OFFSET (8px) above the device's bottom edge,
    // so the anchor lands inside the 22px-tall device band, below its top.
    const anchor = getPortAnchor({
      rackHeight: 12,
      positionHuman: 10,
      uHeight: 22,
      deviceUHeight: 1,
      deviceWidth: 186,
      portIndex: 0,
      portCount: 4,
    });
    expect(anchor.y).toBeGreaterThan(44); // inside the device band
    expect(anchor.y).toBeLessThan(44 + 22);
  });

  it("builds a cubic bezier path string routed through the side channel", () => {
    const d = buildConnectionPath(
      { x: 100, y: 44 },
      { x: 100, y: 110 },
      { channelX: 210 },
    );
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("C"); // cubic bezier, per spike #262
    // The control points ride out to the channel, so the channel x appears.
    expect(d).toContain("210");
  });

  it("gives distinct channel offsets to overlapping connections", () => {
    const a = { x: 100, y: 44 };
    const b = { x: 100, y: 110 };
    // Two connections spanning the same U range must not produce identical
    // paths: a per-connection lane offset shifts the channel so they don't
    // draw on top of each other.
    const path0 = buildConnectionPath(a, b, { channelX: 210, lane: 0 });
    const path1 = buildConnectionPath(a, b, { channelX: 210, lane: 1 });
    expect(path0).not.toBe(path1);
  });
});
