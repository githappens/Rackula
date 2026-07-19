import { describe, it, expect, beforeEach } from "vitest";
import {
  getPendingConnectionStore,
  resetPendingConnectionStore,
} from "$lib/stores/pending-connection.svelte";
import {
  getConnectionStore,
  resetConnectionStore,
} from "$lib/stores/connection.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetToastStore } from "$lib/stores/toast.svelte";
import { placeTwoAvDevices } from "./factories";

describe("pending connection workflow", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetConnectionStore();
    resetPendingConnectionStore();
    resetToastStore();
  });

  it("first port click arms, second click creates the connection", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const pending = getPendingConnectionStore();
    pending.clickPort(outPort.id);
    expect(pending.sourcePortId).toBe(outPort.id);
    pending.clickPort(inPort1.id);
    expect(pending.sourcePortId).toBeNull();
    expect(getConnectionStore().getConnectionsForPort(inPort1.id).length).toBe(
      1,
    );
  });

  it("clicking the armed port again disarms without creating", () => {
    const { outPort } = placeTwoAvDevices();
    const pending = getPendingConnectionStore();
    pending.clickPort(outPort.id);
    expect(pending.sourcePortId).toBe(outPort.id);
    pending.clickPort(outPort.id);
    expect(pending.sourcePortId).toBeNull();
    expect(getConnectionStore().getConnectionsForPort(outPort.id).length).toBe(
      0,
    );
  });

  it("cancel() disarms", () => {
    const { outPort } = placeTwoAvDevices();
    const pending = getPendingConnectionStore();
    pending.clickPort(outPort.id);
    expect(pending.sourcePortId).toBe(outPort.id);
    pending.cancel();
    expect(pending.sourcePortId).toBeNull();
    expect(pending.lastErrors.length).toBe(0);
  });

  it("failed validation keeps the source armed and surfaces errors", () => {
    const { outPort, inPort1, inPort2 } = placeTwoAvDevices();
    const pending = getPendingConnectionStore();

    // First, occupy inPort1 with a real connection (outPort -> inPort1).
    pending.clickPort(outPort.id);
    pending.clickPort(inPort1.id);
    expect(pending.sourcePortId).toBeNull();

    // Arm a fresh source (inPort2) and click the already-connected inPort1.
    pending.clickPort(inPort2.id);
    pending.clickPort(inPort1.id);

    // Source stays armed so the user can retry; errors are surfaced.
    expect(pending.sourcePortId).toBe(inPort2.id);
    expect(pending.lastErrors.length).toBeGreaterThan(0);
    // No new connection was created on inPort2.
    expect(getConnectionStore().getConnectionsForPort(inPort2.id).length).toBe(
      0,
    );
  });
});
