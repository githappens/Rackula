import { describe, it, expect, beforeEach } from "vitest";
import {
  getConnectionFilterStore,
  resetConnectionFilterStore,
  filterConnections,
  type FilterableRow,
} from "$lib/stores/connection-filters.svelte";

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
