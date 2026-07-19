import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionFilterStore,
  resetConnectionFilterStore,
  filterConnections,
  type FilterableRow,
} from "$lib/stores/connection-filters.svelte";
import { visibleConnectionIdsForRack } from "$lib/utils/connection-rows";
import type { Connection, Rack, DeviceType, PlacedPort } from "$lib/types";

describe("connection filters", () => {
  beforeEach(() => resetConnectionFilterStore());

  const rows: FilterableRow[] = [
    {
      id: "c1",
      signal_type: "digital-audio-adat",
      aDeviceName: "Interface",
      bDeviceName: "Converter",
      label: "",
      rackId: "rack-1",
    },
    {
      id: "c2",
      signal_type: "analog-audio-line",
      aDeviceName: "Preamp",
      bDeviceName: "Compressor",
      label: "vox chain",
      rackId: "rack-2",
    },
  ];

  it("passes everything with no active filters", () => {
    const passed = filterConnections(rows, getConnectionFilterStore().state);
    // eslint-disable-next-line no-restricted-syntax -- no active filter must pass every row
    expect(passed).toHaveLength(2);
  });

  it("filters by signal type", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("digital-audio-adat");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual([
      "c1",
    ]);
  });

  it("filters by rack", () => {
    const store = getConnectionFilterStore();
    store.toggleRackId("rack-2");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual([
      "c2",
    ]);
  });

  it("filters by free-text across device names and label", () => {
    const store = getConnectionFilterStore();
    store.setSearch("vox");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual([
      "c2",
    ]);
  });

  it("free-text search is case-insensitive and matches device names", () => {
    const store = getConnectionFilterStore();
    store.setSearch("preamp");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual([
      "c2",
    ]);
  });

  const unresolvedRow: FilterableRow = {
    id: "broken",
    resolved: false,
    signal_type: undefined,
    aDeviceName: "",
    bDeviceName: "",
    label: "",
    rackId: "",
  };

  it("keeps unresolved rows visible under a signal-type filter", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("digital-audio-adat");
    const ids = filterConnections([...rows, unresolvedRow], store.state).map(
      (r) => r.id,
    );
    expect(ids).toContain("broken");
  });

  it("keeps unresolved rows visible under a rack filter", () => {
    const store = getConnectionFilterStore();
    store.toggleRackId("rack-2");
    const ids = filterConnections([...rows, unresolvedRow], store.state).map(
      (r) => r.id,
    );
    expect(ids).toContain("broken");
  });

  it("keeps unresolved rows visible under a search filter", () => {
    const store = getConnectionFilterStore();
    store.setSearch("something");
    const ids = filterConnections([...rows, unresolvedRow], store.state).map(
      (r) => r.id,
    );
    expect(ids).toContain("broken");
  });

  it("clear resets all filters", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("digital-audio-adat");
    store.setSearch("vox");
    store.clear();
    const passed = filterConnections(rows, store.state);
    // eslint-disable-next-line no-restricted-syntax -- cleared filters must pass every row
    expect(passed).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// visibleConnectionIdsForRack integration tests
// ---------------------------------------------------------------------------

describe("visibleConnectionIdsForRack", () => {
  // Build minimal test fixtures: two racks, two devices, two connections.
  // c1 is rack-A (ADAT), c2 is rack-B (analog-audio-line).
  // c3 is rack-A but its b-port is unresolved (simulates hand-edited YAML).

  const portA1: PlacedPort = {
    id: "port-a1",
    template_name: "Out 1",
    template_index: 0,
    type: "adat-optical",
    direction: "output",
    signal_type: "digital-audio-adat",
  };
  const portA2: PlacedPort = {
    id: "port-a2",
    template_name: "In 1",
    template_index: 1,
    type: "adat-optical",
    direction: "input",
    signal_type: "digital-audio-adat",
  };
  const portB1: PlacedPort = {
    id: "port-b1",
    template_name: "Line Out 1",
    template_index: 0,
    type: "xlr-3",
    direction: "output",
    signal_type: "analog-audio-line",
  };
  const portB2: PlacedPort = {
    id: "port-b2",
    template_name: "Line In 1",
    template_index: 1,
    type: "xlr-3",
    direction: "input",
    signal_type: "analog-audio-line",
  };
  // port for the unresolved connection test - only a-side placed
  const portA3: PlacedPort = {
    id: "port-a3",
    template_name: "Out 2",
    template_index: 2,
    type: "adat-optical",
    direction: "output",
  };

  const rackA: Rack = {
    id: "rack-A",
    name: "Rack A",
    height: 12,
    width: 19,
    position: 0,
    desc_units: false,
    show_rear: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [
      {
        id: "dev-a",
        device_type: "interface-a",
        position: 6,
        face: "front",
        ports: [portA1, portA2, portA3],
      },
    ],
  };

  const rackB: Rack = {
    id: "rack-B",
    name: "Rack B",
    height: 12,
    width: 19,
    position: 1,
    desc_units: false,
    show_rear: false,
    form_factor: "4-post",
    starting_unit: 1,
    devices: [
      {
        id: "dev-b",
        device_type: "interface-b",
        position: 6,
        face: "front",
        ports: [portB1, portB2],
      },
    ],
  };

  const deviceTypeA: DeviceType = {
    slug: "interface-a",
    model: "Interface A",
    u_height: 1,
    category: "av-media",
    colour: "#000",
  };

  const deviceTypeB: DeviceType = {
    slug: "interface-b",
    model: "Interface B",
    u_height: 1,
    category: "av-media",
    colour: "#000",
  };

  // c1: rack-A, ADAT (both ports in rack-A)
  const c1: Connection = { id: "c1", a_port_id: "port-a1", b_port_id: "port-a2" };
  // c2: rack-B, analog-audio-line (both ports in rack-B)
  const c2: Connection = { id: "c2", a_port_id: "port-b1", b_port_id: "port-b2" };
  // c3: rack-A but b-port doesn't exist in any rack -> unresolved
  const c3: Connection = { id: "c3", a_port_id: "port-a3", b_port_id: "missing-port" };

  const racks = [rackA, rackB];
  const deviceTypes = [deviceTypeA, deviceTypeB];
  const connections = [c1, c2, c3];

  beforeEach(() => resetConnectionFilterStore());

  it("returns all resolvable connections for a rack when no filters are active", () => {
    const store = getConnectionFilterStore();
    const ids = visibleConnectionIdsForRack(connections, racks, deviceTypes, store.state, "rack-A");
    expect(ids.has("c1")).toBe(true);
  });

  it("excludes connections from other racks", () => {
    const store = getConnectionFilterStore();
    const ids = visibleConnectionIdsForRack(connections, racks, deviceTypes, store.state, "rack-A");
    expect(ids.has("c2")).toBe(false);
  });

  it("hides a resolved connection when a signal-type filter excludes it", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("analog-audio-line");
    // rack-A only has ADAT connections; analog filter should exclude c1
    const ids = visibleConnectionIdsForRack(connections, racks, deviceTypes, store.state, "rack-A");
    expect(ids.has("c1")).toBe(false);
  });

  it("still includes c1 when the matching signal-type filter is active", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("digital-audio-adat");
    const ids = visibleConnectionIdsForRack(connections, racks, deviceTypes, store.state, "rack-A");
    expect(ids.has("c1")).toBe(true);
  });

  it("always includes an unresolved connection regardless of filter (never hidden)", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("analog-audio-line");
    const ids = visibleConnectionIdsForRack(connections, racks, deviceTypes, store.state, "rack-A");
    // c3 is unresolved (missing-port doesn't exist) - must still be visible
    expect(ids.has("c3")).toBe(true);
  });
});
