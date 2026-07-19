import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getConnectionStore,
  resetConnectionStore,
} from "$lib/stores/connection.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { placeTwoAvDevices } from "./factories";
import { CATEGORY_COLOURS } from "$lib/types/constants";

/**
 * Resolve the rack id and array index of a placed device by its id, so tests
 * can call the real removeDeviceRecorded(rackId, deviceIndex) facade.
 */
function locateDevice(deviceId: string): { rackId: string; index: number } {
  const layout = getLayoutStore();
  for (const rack of layout.racks) {
    const index = rack.devices.findIndex((d) => d.id === deviceId);
    if (index >= 0) return { rackId: rack.id, index };
  }
  throw new Error(`locateDevice: device ${deviceId} not found`);
}

/**
 * Place a carrier (container) with one AV output port holding a child device
 * with one AV input port, through the real placement path so both devices'
 * PlacedPort UUIDs exist. Returns the ids needed to connect the carrier's port
 * to its child's port and to remove the carrier.
 */
function placeCarrierWithChild(): {
  rackId: string;
  carrierId: string;
  carrierOutPortId: string;
  childInPortId: string;
} {
  const store = getLayoutStore();

  const carrierType = store.addDeviceType({
    name: "AV Carrier",
    u_height: 2,
    category: "server",
    colour: CATEGORY_COLOURS.server,
    interfaces: [{ name: "Carrier Out", type: "xlr-3", direction: "output" }],
    slots: [
      {
        id: "slot-left",
        name: "Left",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
      },
    ],
  });
  const childType = store.addDeviceType({
    name: "AV Child",
    u_height: 1,
    category: "server",
    colour: CATEGORY_COLOURS.server,
    slot_width: 1, // half-width, to fit the carrier's half-width slot
    interfaces: [{ name: "Child In", type: "trs-1-4", direction: "input" }],
  });

  const rack = store.addRack("Test Rack", 42);
  const rackId = rack!.id;

  store.placeDevice(rackId, carrierType.slug, 5);
  const carrier = store.rack!.devices.find(
    (d) => d.device_type === carrierType.slug,
  )!;

  store.placeInContainer(rackId, childType.slug, carrier.id, "slot-left", 0);
  const child = store.rack!.devices.find(
    (d) => d.container_id === carrier.id,
  )!;

  const carrierOutPort = carrier.ports!.find(
    (p) => p.template_name === "Carrier Out",
  )!;
  const childInPort = child.ports!.find((p) => p.template_name === "Child In")!;

  return {
    rackId,
    carrierId: carrier.id,
    carrierOutPortId: carrierOutPort.id,
    childInPortId: childInPort.id,
  };
}

describe("connection cascade on device removal", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetHistoryStore();
    resetConnectionStore();
  });

  it("removing a device removes its connections; undo restores, redo removes again", () => {
    const { outPort, inPort1, compDeviceId } = placeTwoAvDevices();
    const layout = getLayoutStore();
    layout.addConnectionRecorded({
      a_port_id: outPort.id,
      b_port_id: inPort1.id,
    });
    expect(getConnectionStore().connections.length).toBe(1);

    const { rackId, index } = locateDevice(compDeviceId);
    layout.removeDeviceRecorded(rackId, index);
    expect(getConnectionStore().connections.length).toBe(0);

    layout.undo(); // device AND its connection come back atomically
    expect(getConnectionStore().connections.length).toBe(1);

    layout.redo(); // re-remove device and cascade its connection back out
    expect(getConnectionStore().connections.length).toBe(0);
  });

  it("a carrier-to-child connection is restored exactly once on undo", () => {
    // The connection links a port on the carrier to a port on its carried
    // child, so getConnectionsForDevice returns it for BOTH devices. Without
    // dedup, undo would re-add it twice, leaving two identical entries.
    const { rackId, carrierId, carrierOutPortId, childInPortId } =
      placeCarrierWithChild();
    const layout = getLayoutStore();

    const result = layout.addConnectionRecorded({
      a_port_id: carrierOutPortId,
      b_port_id: childInPortId,
    });
    expect("connection" in result).toBe(true);
    expect(getConnectionStore().connections.length).toBe(1);

    const { index } = locateDevice(carrierId);
    layout.removeDeviceRecorded(rackId, index);
    expect(getConnectionStore().connections.length).toBe(0);

    layout.undo();
    // Exactly 1, NOT 2: the dedup keeps the single carrier-to-child connection
    // from being restored twice.
    expect(getConnectionStore().connections.length).toBe(1);
  });
});
