import { describe, it, expect } from "vitest";
import { buildConnectionRows } from "$lib/utils/connection-rows";
import type { Connection, DeviceType, PlacedPort, Rack } from "$lib/types";

function port(id: string, overrides: Partial<PlacedPort> = {}): PlacedPort {
  return {
    id,
    template_name: "port",
    template_index: 0,
    type: "xlr-3",
    ...overrides,
  };
}

const deviceType: DeviceType = {
  slug: "preamp",
  model: "Mic Preamp",
  u_height: 1,
} as DeviceType;

function rackWith(devices: Rack["devices"], id = "rack-1"): Rack {
  return {
    id,
    name: "Rack",
    height: 42,
    width: 19,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post",
    starting_unit: 1,
    position: 0,
    devices,
  } as Rack;
}

describe("buildConnectionRows", () => {
  it("joins a resolvable connection to device names, port labels and rack", () => {
    const rack = rackWith([
      {
        id: "dev-a",
        device_type: "preamp",
        position: 0,
        face: "front",
        name: "Interface",
        ports: [port("pa", { label: "Out 1", direction: "output" })],
      },
      {
        id: "dev-b",
        device_type: "preamp",
        position: 6,
        face: "front",
        ports: [port("pb", { label: "In 1", direction: "input" })],
      },
    ]);
    const connection: Connection = {
      id: "c1",
      a_port_id: "pa",
      b_port_id: "pb",
      label: "vox",
    };

    const [row] = buildConnectionRows([connection], [rack], [deviceType]);
    expect(row.resolved).toBe(true);
    expect(row.aDeviceName).toBe("Interface");
    // dev-b has no custom name -> falls back to device type model
    expect(row.bDeviceName).toBe("Mic Preamp");
    expect(row.a?.portLabel).toBe("Out 1");
    expect(row.rackId).toBe("rack-1");
    expect(row.label).toBe("vox");
  });

  it("marks a connection with a missing endpoint as unresolved", () => {
    const rack = rackWith([
      {
        id: "dev-a",
        device_type: "preamp",
        position: 0,
        face: "front",
        ports: [port("pa")],
      },
    ]);
    const connection: Connection = {
      id: "c-bad",
      a_port_id: "pa",
      b_port_id: "does-not-exist",
    };

    const [row] = buildConnectionRows([connection], [rack], [deviceType]);
    expect(row.resolved).toBe(false);
    expect(row.b).toBeUndefined();
  });

  it("prefers the connection signal override for effective signal", () => {
    const rack = rackWith([
      {
        id: "dev-a",
        device_type: "preamp",
        position: 0,
        face: "front",
        ports: [port("pa", { signal_type: "analog-audio-line" })],
      },
      {
        id: "dev-b",
        device_type: "preamp",
        position: 6,
        face: "front",
        ports: [port("pb", { signal_type: "analog-audio-line" })],
      },
    ]);
    const connection: Connection = {
      id: "c1",
      a_port_id: "pa",
      b_port_id: "pb",
      signal_type: "digital-audio-adat",
    };

    const [row] = buildConnectionRows([connection], [rack], [deviceType]);
    expect(row.signal_type).toBe("digital-audio-adat");
    expect(row.signalOverride).toBe("digital-audio-adat");
  });
});
