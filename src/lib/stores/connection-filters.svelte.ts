/**
 * Connection Filter Store
 *
 * View state for the Connections panel: which signal types and racks are
 * selected, and the free-text search. Empty selection sets mean "all" (no
 * filter applied on that axis). The actual filtering is a pure exported
 * function so it can be unit-tested without a component (Task 10).
 */

import { SvelteSet } from "svelte/reactivity";
import type { SignalType } from "$lib/types";

/**
 * The subset of a Connections-panel row that filtering reads. The panel's full
 * row model is a superset of this shape.
 */
export interface FilterableRow {
  id: string;
  /** Effective signal of the cable, or undefined if it cannot be resolved. */
  signal_type: SignalType | undefined;
  aDeviceName: string;
  bDeviceName: string;
  label: string;
  rackId: string;
  /**
   * False when the connection's ports could not be resolved. Unresolved rows
   * are never hidden by any filter so the broken connection stays visible.
   */
  resolved?: boolean;
}

/**
 * Snapshot of the active filters read by the pure filter function.
 */
export interface ConnectionFilterState {
  signalTypes: ReadonlySet<SignalType>;
  rackIds: ReadonlySet<string>;
  search: string;
}

const signalTypes = new SvelteSet<SignalType>();
const rackIds = new SvelteSet<string>();
let search = $state("");

/**
 * A row passes when it satisfies every active axis: signal-type (empty set =
 * all), rack (empty set = all), and free-text (empty = all, otherwise a
 * case-insensitive substring match across both device names and the label).
 * Pure: reads only its arguments, so it is testable without the reactive store.
 */
export function filterConnections<T extends FilterableRow>(
  rows: readonly T[],
  state: ConnectionFilterState,
): T[] {
  const needle = state.search.trim().toLowerCase();
  return rows.filter((row) => {
    // Unresolved rows can't meaningfully satisfy any axis and must stay
    // visible (loud error style) so the user can see and delete them.
    if (row.resolved === false) return true;
    if (state.signalTypes.size > 0) {
      if (!row.signal_type || !state.signalTypes.has(row.signal_type)) {
        return false;
      }
    }
    if (state.rackIds.size > 0 && !state.rackIds.has(row.rackId)) {
      return false;
    }
    if (needle) {
      const haystack =
        `${row.aDeviceName} ${row.bDeviceName} ${row.label}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function getConnectionFilterStore() {
  return {
    get state(): ConnectionFilterState {
      return { signalTypes, rackIds, search };
    },
    get signalTypes(): ReadonlySet<SignalType> {
      return signalTypes;
    },
    get rackIds(): ReadonlySet<string> {
      return rackIds;
    },
    get search(): string {
      return search;
    },
    toggleSignalType(signal: SignalType): void {
      if (signalTypes.has(signal)) signalTypes.delete(signal);
      else signalTypes.add(signal);
    },
    toggleRackId(rackId: string): void {
      if (rackIds.has(rackId)) rackIds.delete(rackId);
      else rackIds.add(rackId);
    },
    setRackIds(ids: Iterable<string>): void {
      rackIds.clear();
      for (const id of ids) rackIds.add(id);
    },
    setSearch(value: string): void {
      search = value;
    },
    clear(): void {
      signalTypes.clear();
      rackIds.clear();
      search = "";
    },
  };
}

/**
 * Reset the filter store to its empty (no-filter) state. For tests.
 */
export function resetConnectionFilterStore(): void {
  signalTypes.clear();
  rackIds.clear();
  search = "";
}
