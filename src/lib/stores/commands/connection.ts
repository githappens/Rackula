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
    updates: Partial<Pick<Connection, "label" | "color">>,
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
  const connectionCopy = structuredClone(connection);
  return {
    type: "ADD_CONNECTION",
    description: "Add connection",
    timestamp: Date.now(),
    execute() {
      store.addConnectionRaw(structuredClone(connectionCopy));
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
  const connectionCopy = structuredClone(connection);
  return {
    type: "REMOVE_CONNECTION",
    description: "Remove connection",
    timestamp: Date.now(),
    execute() {
      store.removeConnectionRaw(connectionCopy.id);
    },
    undo() {
      store.addConnectionRaw(structuredClone(connectionCopy));
    },
  };
}

/**
 * Create a command to update a connection's label/color.
 * Captures the previous values for undo.
 */
export function createUpdateConnectionCommand(
  id: string,
  previous: Partial<Pick<Connection, "label" | "color">>,
  updates: Partial<Pick<Connection, "label" | "color">>,
  store: ConnectionCommandStore,
): Command {
  return {
    type: "UPDATE_CONNECTION",
    description: "Update connection",
    timestamp: Date.now(),
    execute() {
      store.updateConnectionRaw(id, updates);
    },
    undo() {
      store.updateConnectionRaw(id, previous);
    },
  };
}
