import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getConnectionStore,
  resetConnectionStore,
} from "$lib/stores/connection.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  placeTwoAvDevices,
  placeTwoOutputs,
  placeAvAndNetwork,
} from "./factories";

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
