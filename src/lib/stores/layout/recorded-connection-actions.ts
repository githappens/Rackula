/**
 * Recorded Connection Actions for Layout Store
 *
 * Port-to-port connection operations with undo/redo support (upstream #369).
 * Each function validates through the connection store, and only when there
 * are no errors constructs the Connection, wraps it in a Command, and runs it
 * through this layout instance's history. Validation errors are surfaced to
 * the caller and never silently swallowed.
 */

import type { Connection } from "$lib/types";
import { generateId } from "$lib/utils/device";
import {
  getConnectionStore,
  type CreateConnectionInput,
} from "../connection.svelte";
import {
  createAddConnectionCommand,
  createRemoveConnectionCommand,
  createUpdateConnectionCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";

/**
 * Result of a recorded add: the created connection plus non-blocking warnings,
 * or the validation errors that blocked creation.
 */
export type AddConnectionResult =
  { connection: Connection; warnings: string[] } | { errors: string[] };

/**
 * Add a connection with undo/redo support. Validates first; on any error the
 * connection is not recorded and the errors are returned. Warnings do not
 * block and are returned alongside the created connection.
 */
export function addConnectionRecorded(
  ctx: LayoutStateAccess,
  input: CreateConnectionInput,
): AddConnectionResult {
  const connectionStore = getConnectionStore();
  const validation = connectionStore.validateConnection(input);
  if (validation.errors.length > 0) {
    return { errors: validation.errors };
  }

  const connection: Connection = {
    id: generateId(),
    a_port_id: input.a_port_id,
    b_port_id: input.b_port_id,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  };

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  history.execute(createAddConnectionCommand(connection, adapter));
  ctx.markDirty();

  return { connection, warnings: validation.warnings };
}

/**
 * Update a connection's label/color/signal_type override with undo/redo
 * support. The signal_type field is the per-cable override that wins over
 * port-level signals; writing it here leaves both ports untouched.
 * @returns true if the connection existed and the update was recorded.
 */
export function updateConnectionRecorded(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<Pick<Connection, "label" | "color" | "signal_type">>,
): boolean {
  const connectionStore = getConnectionStore();
  const existing = connectionStore.getConnection(id);
  if (!existing) return false;

  const previous: Partial<Pick<Connection, "label" | "color" | "signal_type">> =
    {
      label: existing.label,
      color: existing.color,
      signal_type: existing.signal_type,
    };

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  history.execute(
    createUpdateConnectionCommand(id, previous, updates, adapter),
  );
  ctx.markDirty();
  return true;
}

/**
 * Remove a connection with undo/redo support.
 * @returns the removed connection, or undefined if the id did not match.
 */
export function removeConnectionRecorded(
  ctx: LayoutStateAccess,
  id: string,
): Connection | undefined {
  const connectionStore = getConnectionStore();
  const existing = connectionStore.getConnection(id);
  if (!existing) return undefined;

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  history.execute(createRemoveConnectionCommand(existing, adapter));
  ctx.markDirty();
  return existing;
}
