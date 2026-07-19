/**
 * Connection Commands for Undo/Redo
 *
 * Wrap the connection raw mutators as Command objects (upstream #369). Each
 * command captures the data it needs to both apply and reverse its change.
 */

import type { Command } from "./types";
import type { Connection } from "$lib/types";

/**
 * Interface for the raw connection operations these commands drive.
 * The layout facade supplies an adapter implementing this.
 */
export interface ConnectionCommandStore {
  addConnectionRaw(connection: Connection): void;
  removeConnectionRaw(id: string): Connection | undefined;
  updateConnectionRaw(
    id: string,
    updates: Partial<Pick<Connection, "label" | "color" | "signal_type">>,
  ): void;
}

/**
 * Create a command to add a connection.
 * execute adds it; undo removes it by id.
 */
export function createAddConnectionCommand(
  connection: Connection,
  store: ConnectionCommandStore,
): Command {
  // Connection is a flat, primitive-only shape, so a shallow spread fully
  // detaches it from reactive state. structuredClone would throw
  // DataCloneError on a Svelte 5 $state proxy passed in by a live caller.
  const connectionCopy = { ...connection };
  return {
    type: "ADD_CONNECTION",
    description: "Add connection",
    timestamp: Date.now(),
    execute() {
      store.addConnectionRaw({ ...connectionCopy });
    },
    undo() {
      store.removeConnectionRaw(connectionCopy.id);
    },
  };
}

/**
 * Create a command to remove a connection.
 * execute removes it (capturing the removed object for restore); undo re-adds
 * the captured connection so its id and fields survive an undo.
 */
export function createRemoveConnectionCommand(
  connection: Connection,
  store: ConnectionCommandStore,
): Command {
  // Flat clone, not structuredClone: the caller may pass a live Svelte 5
  // $state proxy (e.g. removeConnectionRecorded), which structuredClone
  // rejects with DataCloneError. Connection holds only primitives.
  const connectionCopy = { ...connection };
  return {
    type: "REMOVE_CONNECTION",
    description: "Remove connection",
    timestamp: Date.now(),
    execute() {
      store.removeConnectionRaw(connectionCopy.id);
    },
    undo() {
      store.addConnectionRaw({ ...connectionCopy });
    },
  };
}

/**
 * Create a command to update a connection's label/color/signal_type override.
 * Captures the previous values for undo.
 */
export function createUpdateConnectionCommand(
  id: string,
  previous: Partial<Pick<Connection, "label" | "color" | "signal_type">>,
  updates: Partial<Pick<Connection, "label" | "color" | "signal_type">>,
  store: ConnectionCommandStore,
): Command {
  // Capture as flat literals of the primitive fields so a live Svelte 5
  // $state proxy passed in as previous/updates does not leak into history.
  const previousCopy: Partial<
    Pick<Connection, "label" | "color" | "signal_type">
  > = {
    ...previous,
  };
  const updatesCopy: Partial<
    Pick<Connection, "label" | "color" | "signal_type">
  > = {
    ...updates,
  };
  return {
    type: "UPDATE_CONNECTION",
    description: "Update connection",
    timestamp: Date.now(),
    execute() {
      store.updateConnectionRaw(id, updatesCopy);
    },
    undo() {
      store.updateConnectionRaw(id, previousCopy);
    },
  };
}
