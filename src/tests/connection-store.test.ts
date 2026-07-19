import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getConnectionStore,
  resetConnectionStore,
} from "$lib/stores/connection.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestDeviceType } from "./factories";
import type { PlacedPort } from "$lib/types";

/**
 * Place two devices with AV ports through the real layout-store placement
 * path (addRack + addDeviceTypeRaw + placeDevice), so their PlacedPort UUIDs
 * exist on layout.racks[].devices[].ports[]. Returns the placed ports and the
 * placed device ids for connection tests.
 */
function placeTwoAvDevices(): {
  outPort: PlacedPort;
  inPort1: PlacedPort;
  inPort2: PlacedPort;
  preDeviceId: string;
  compDeviceId: string;
} {
  const layout = getLayoutStore();
  const rack = layout.addRack("Test Rack", 42);
  if (!rack) throw new Error("placeTwoAvDevices: addRack failed");

  const pre = createTestDeviceType({
    slug: "pre",
    interfaces: [{ name: "Out L", type: "xlr-3", direction: "output" }],
  });
  const comp = createTestDeviceType({
    slug: "comp",
    interfaces: [
      { name: "In 1", type: "trs-1-4", direction: "input" },
      { name: "In 2", type: "trs-1-4", direction: "input" },
    ],
  });
  layout.addDeviceTypeRaw(pre);
  layout.addDeviceTypeRaw(comp);

  if (!layout.placeDevice(rack.id, "pre", 1))
    throw new Error("placeTwoAvDevices: placeDevice(pre) failed");
  if (!layout.placeDevice(rack.id, "comp", 5))
    throw new Error("placeTwoAvDevices: placeDevice(comp) failed");

  // Read devices from the live rack: placeDevice replaces layout.racks
  // immutably, so the object returned by addRack is a stale snapshot.
  const liveRack = layout.racks.find((r) => r.id === rack.id)!;
  const preDevice = liveRack.devices.find((d) => d.device_type === "pre")!;
  const compDevice = liveRack.devices.find((d) => d.device_type === "comp")!;

  const outPort = preDevice.ports!.find((p) => p.template_name === "Out L")!;
  const inPort1 = compDevice.ports!.find((p) => p.template_name === "In 1")!;
  const inPort2 = compDevice.ports!.find((p) => p.template_name === "In 2")!;

  return {
    outPort,
    inPort1,
    inPort2,
    preDeviceId: preDevice.id,
    compDeviceId: compDevice.id,
  };
}

/**
 * Place two devices that each expose a single output port, for the
 * output->output warning case.
 */
function placeTwoOutputs(): { outA: PlacedPort; outB: PlacedPort } {
  const layout = getLayoutStore();
  const rack = layout.addRack("Test Rack", 42);
  if (!rack) throw new Error("placeTwoOutputs: addRack failed");

  const srcA = createTestDeviceType({
    slug: "src-a",
    interfaces: [{ name: "Out", type: "xlr-3", direction: "output" }],
  });
  const srcB = createTestDeviceType({
    slug: "src-b",
    interfaces: [{ name: "Out", type: "xlr-3", direction: "output" }],
  });
  layout.addDeviceTypeRaw(srcA);
  layout.addDeviceTypeRaw(srcB);
  layout.placeDevice(rack.id, "src-a", 1);
  layout.placeDevice(rack.id, "src-b", 5);

  const liveRack = layout.racks.find((r) => r.id === rack.id)!;
  const devA = liveRack.devices.find((d) => d.device_type === "src-a")!;
  const devB = liveRack.devices.find((d) => d.device_type === "src-b")!;
  return {
    outA: devA.ports!.find((p) => p.template_name === "Out")!,
    outB: devB.ports!.find((p) => p.template_name === "Out")!,
  };
}

/**
 * Place one AV output port and one network port, for the cross-category
 * warning case.
 */
function placeAvAndNetwork(): { avPort: PlacedPort; netPort: PlacedPort } {
  const layout = getLayoutStore();
  const rack = layout.addRack("Test Rack", 42);
  if (!rack) throw new Error("placeAvAndNetwork: addRack failed");

  const avDev = createTestDeviceType({
    slug: "av-dev",
    interfaces: [{ name: "Out", type: "xlr-3", direction: "output" }],
  });
  const netDev = createTestDeviceType({
    slug: "net-dev",
    interfaces: [{ name: "eth0", type: "1000base-t" }],
  });
  layout.addDeviceTypeRaw(avDev);
  layout.addDeviceTypeRaw(netDev);
  layout.placeDevice(rack.id, "av-dev", 1);
  layout.placeDevice(rack.id, "net-dev", 5);

  const liveRack = layout.racks.find((r) => r.id === rack.id)!;
  const dAv = liveRack.devices.find((d) => d.device_type === "av-dev")!;
  const dNet = liveRack.devices.find((d) => d.device_type === "net-dev")!;
  return {
    avPort: dAv.ports!.find((p) => p.template_name === "Out")!,
    netPort: dNet.ports!.find((p) => p.template_name === "eth0")!,
  };
}

describe("Connection store", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    resetConnectionStore();
  });

  it("addConnection creates a connection between two ports", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const store = getConnectionStore();
    const result = store.addConnection({
      a_port_id: outPort.id,
      b_port_id: inPort1.id,
    });
    expect("connection" in result).toBe(true);
    expect(store.getConnectionsForPort(outPort.id).length).toBe(1);
  });

  it("rejects connecting a port to itself", () => {
    const { outPort } = placeTwoAvDevices();
    const result = getConnectionStore().addConnection({
      a_port_id: outPort.id,
      b_port_id: outPort.id,
    });
    expect("errors" in result).toBe(true);
  });

  it("rejects a second connection on an already-connected port", () => {
    const { outPort, inPort1, inPort2 } = placeTwoAvDevices();
    const store = getConnectionStore();
    store.addConnection({ a_port_id: outPort.id, b_port_id: inPort1.id });
    const result = store.addConnection({
      a_port_id: outPort.id,
      b_port_id: inPort2.id,
    });
    expect("errors" in result).toBe(true);
  });

  it("rejects duplicates in either direction", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const store = getConnectionStore();
    store.addConnection({ a_port_id: outPort.id, b_port_id: inPort1.id });
    const result = store.addConnection({
      a_port_id: inPort1.id,
      b_port_id: outPort.id,
    });
    expect("errors" in result).toBe(true);
  });

  it("warns (but allows) output->output connections", () => {
    const { outA, outB } = placeTwoOutputs();
    const result = getConnectionStore().addConnection({
      a_port_id: outA.id,
      b_port_id: outB.id,
    });
    expect("connection" in result).toBe(true);
    if ("connection" in result) {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("warns (but allows) cross-category connections (av to network)", () => {
    const { avPort, netPort } = placeAvAndNetwork();
    const result = getConnectionStore().addConnection({
      a_port_id: avPort.id,
      b_port_id: netPort.id,
    });
    expect("connection" in result).toBe(true);
    if ("connection" in result) {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it("rejects connections referencing a non-existent port (loud, not silent)", () => {
    const store = getConnectionStore();
    const result = store.addConnection({
      a_port_id: "ghost-a",
      b_port_id: "ghost-b",
    });
    expect("errors" in result).toBe(true);
  });

  it("supports undo/redo through the history", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const layout = getLayoutStore();
    layout.addConnectionRecorded({
      a_port_id: outPort.id,
      b_port_id: inPort1.id,
    });
    expect(getConnectionStore().connections.length).toBe(1);
    layout.undo();
    expect(getConnectionStore().connections.length).toBe(0);
    layout.redo();
    expect(getConnectionStore().connections.length).toBe(1);
  });
});
