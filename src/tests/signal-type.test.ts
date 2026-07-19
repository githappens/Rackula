import { describe, it, expect, beforeEach } from "vitest";
import {
  inferSignalType,
  getConnectionSignalType,
} from "$lib/utils/port-utils";
import type { Connection, PlacedPort } from "$lib/types";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getConnectionStore,
  resetConnectionStore,
} from "$lib/stores/connection.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestDeviceType } from "./factories";

describe("inferSignalType", () => {
  it("maps unambiguous connectors directly", () => {
    expect(inferSignalType("adat-optical")).toBe("digital-audio-adat");
    expect(inferSignalType("midi-din")).toBe("control-midi");
    expect(inferSignalType("bnc")).toBe("clock-word");
    expect(inferSignalType("usb-c")).toBe("data-usb");
  });
  it("uses direction to split XLR into mic-in vs line-out", () => {
    expect(inferSignalType("xlr-3", "input")).toBe("analog-audio-mic");
    expect(inferSignalType("xlr-3", "output")).toBe("analog-audio-line");
    expect(inferSignalType("xlr-3")).toBe("analog-audio-line");
  });
  it("defaults other analog connectors to line level", () => {
    expect(inferSignalType("trs-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("ts-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("rca")).toBe("analog-audio-line");
    expect(inferSignalType("db25-audio")).toBe("analog-audio-line");
  });
  it("returns undefined for network types (ethernet is implied, not stored)", () => {
    expect(inferSignalType("1000base-t")).toBeUndefined();
  });
});

describe("getConnectionSignalType precedence", () => {
  const port = (over: Partial<PlacedPort>): PlacedPort =>
    ({
      id: "p",
      template_name: "1",
      template_index: 0,
      type: "trs-1-4",
      ...over,
    }) as PlacedPort;
  const conn = (over: Partial<Connection>): Connection =>
    ({ id: "c", a_port_id: "a", b_port_id: "b", ...over }) as Connection;

  it("connection override wins over everything", () => {
    expect(
      getConnectionSignalType(
        conn({ signal_type: "clock-word" }),
        port({ signal_type: "analog-audio-mic" }),
        port({}),
      ),
    ).toBe("clock-word");
  });
  it("explicit port signal beats inference", () => {
    expect(
      getConnectionSignalType(
        conn({}),
        port({ signal_type: "digital-audio-spdif", type: "rca" }),
        port({ type: "rca" }),
      ),
    ).toBe("digital-audio-spdif");
  });
  it("falls back to inference from the a-side port", () => {
    expect(
      getConnectionSignalType(
        conn({}),
        port({ type: "adat-optical" }),
        port({ type: "adat-optical" }),
      ),
    ).toBe("digital-audio-adat");
  });
});

describe("connection store signal-mismatch warning", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    resetConnectionStore();
  });

  it("allows connecting mismatched signal types but warns", () => {
    const layout = getLayoutStore();
    const rack = layout.addRack("Test Rack", 42);
    if (!rack) throw new Error("addRack failed");

    // adat-optical infers digital-audio-adat; bnc infers clock-word.
    const adatDev = createTestDeviceType({
      slug: "adat-dev",
      interfaces: [
        { name: "ADAT Out", type: "adat-optical", direction: "output" },
      ],
    });
    const bncDev = createTestDeviceType({
      slug: "bnc-dev",
      interfaces: [{ name: "Word In", type: "bnc", direction: "input" }],
    });
    layout.addDeviceTypeRaw(adatDev);
    layout.addDeviceTypeRaw(bncDev);
    layout.placeDevice(rack.id, "adat-dev", 1);
    layout.placeDevice(rack.id, "bnc-dev", 5);

    const liveRack = layout.racks.find((r) => r.id === rack.id)!;
    const dAdat = liveRack.devices.find((d) => d.device_type === "adat-dev")!;
    const dBnc = liveRack.devices.find((d) => d.device_type === "bnc-dev")!;
    const adatPort = dAdat.ports!.find((p) => p.template_name === "ADAT Out")!;
    const bncPort = dBnc.ports!.find((p) => p.template_name === "Word In")!;

    const result = getConnectionStore().addConnection({
      a_port_id: adatPort.id,
      b_port_id: bncPort.id,
    });

    expect("connection" in result).toBe(true);
    if ("connection" in result) {
      expect(result.warnings.some((w) => /signal/i.test(w))).toBe(true);
    }
  });
});
