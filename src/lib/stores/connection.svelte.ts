/**
 * Connection Store
 *
 * CRUD + validation for port-to-port connections (upstream #369). State lives
 * in `layout.connections`; this store is a thin, per-call view over the active
 * layout store (mirroring the removed cable store's structure) plus the
 * validation rules for creating connections.
 */

import type { Connection, PlacedPort, SignalType } from "$lib/types";
import { generateId } from "$lib/utils/device";
import { getPortCategory, inferSignalType } from "$lib/utils/port-utils";
import { getLayoutStore } from "./layout.svelte";

/**
 * Input for creating a connection. Endpoints reference PlacedPort.id.
 */
export interface CreateConnectionInput {
  a_port_id: string;
  b_port_id: string;
  label?: string;
  color?: string;
  signal_type?: SignalType;
}

/**
 * Resolved port with its owning placed-device id.
 */
export interface ResolvedPort {
  port: PlacedPort;
  deviceId: string;
}

/**
 * Validation outcome: hard errors block creation, warnings do not.
 */
export interface ConnectionValidation {
  errors: string[];
  warnings: string[];
}

/**
 * Validate a proposed connection against the existing connections and the
 * resolvable ports. Errors block creation (self-connect, missing port, port
 * already connected, duplicate). Warnings surface questionable-but-allowed
 * cases (output->output, input->input, cross-category) per the no-silent
 * house rule: the caller sees them rather than the store silently accepting
 * or rejecting them.
 *
 * Exported for unit testing; application code uses the store's addConnection,
 * which supplies `existing` and `resolvePort` from the current layout.
 */
export function validateConnection(
  input: CreateConnectionInput,
  existing: Connection[],
  resolvePort: (id: string) => ResolvedPort | undefined,
): ConnectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.a_port_id === input.b_port_id) {
    errors.push("Cannot connect a port to itself");
  }

  const a = resolvePort(input.a_port_id);
  const b = resolvePort(input.b_port_id);
  if (!a) errors.push(`Port not found: ${input.a_port_id}`);
  if (!b) errors.push(`Port not found: ${input.b_port_id}`);

  if (a && b) {
    for (const c of existing) {
      const ports = [c.a_port_id, c.b_port_id];
      const touchesA = ports.includes(input.a_port_id);
      const touchesB = ports.includes(input.b_port_id);
      if (touchesA || touchesB) {
        const isDuplicate = touchesA && touchesB;
        errors.push(
          isDuplicate
            ? "These ports are already connected"
            : "Port already has a connection",
        );
        break;
      }
    }

    if (a.port.direction === "output" && b.port.direction === "output") {
      warnings.push("Both ports are outputs");
    }
    if (a.port.direction === "input" && b.port.direction === "input") {
      warnings.push("Both ports are inputs");
    }
    if (getPortCategory(a.port.type) !== getPortCategory(b.port.type)) {
      warnings.push(
        `Connecting ${a.port.type} to ${b.port.type} (different categories)`,
      );
    }

    // Effective signal per side: explicit port value, else inference. Warn-only
    // when both are known and differ; never blocks (connectors can legitimately
    // carry different signals, and the user may still want the cable).
    const aSignal =
      a.port.signal_type ?? inferSignalType(a.port.type, a.port.direction);
    const bSignal =
      b.port.signal_type ?? inferSignalType(b.port.type, b.port.direction);
    if (aSignal && bSignal && aSignal !== bSignal) {
      warnings.push(`Signal mismatch: ${aSignal} to ${bSignal}`);
    }
  }

  return { errors, warnings };
}

/**
 * Transient hover highlight, shared across every per-call store view. Not part
 * of the layout: it is view state (which connection the pointer is over), read
 * by the render layer to thicken the hovered path. Task 10 also reads it.
 */
let hoveredConnectionId = $state<string | null>(null);

/**
 * Get the connection store: CRUD + queries over `layout.connections`.
 *
 * Returns a fresh view object per call (no independent state); all data lives
 * in the layout store, so resetting the layout resets connections too.
 */
export function getConnectionStore() {
  const layoutStore = getLayoutStore();

  function getConnections(): Connection[] {
    return layoutStore.layout.connections ?? [];
  }

  /**
   * Build an id -> { port, deviceId } index over every placed device's ports
   * across all racks. Rebuilt per resolve call: connection edits are rare
   * relative to how often the layout mutates, so a cached index would need
   * invalidation plumbing for no measured win. Revisit only if profiling shows
   * this on a hot path.
   */
  function resolvePort(id: string): ResolvedPort | undefined {
    for (const rack of layoutStore.layout.racks) {
      for (const device of rack.devices) {
        const port = device.ports?.find((p) => p.id === id);
        if (port) return { port, deviceId: device.id };
      }
    }
    return undefined;
  }

  function getConnection(id: string): Connection | undefined {
    return getConnections().find((c) => c.id === id);
  }

  function getConnectionsForPort(portId: string): Connection[] {
    return getConnections().filter(
      (c) => c.a_port_id === portId || c.b_port_id === portId,
    );
  }

  function getConnectionsForDevice(deviceId: string): Connection[] {
    const portIds: string[] = [];
    for (const rack of layoutStore.layout.racks) {
      const device = rack.devices.find((d) => d.id === deviceId);
      if (!device) continue;
      for (const port of device.ports ?? []) portIds.push(port.id);
    }
    return getConnections().filter(
      (c) => portIds.includes(c.a_port_id) || portIds.includes(c.b_port_id),
    );
  }

  /**
   * Add a connection. Returns the created connection plus any warnings, or the
   * validation errors when creation is blocked. Warnings never block: the
   * caller decides how to surface them.
   */
  function addConnection(
    input: CreateConnectionInput,
  ): { connection: Connection; warnings: string[] } | { errors: string[] } {
    const validation = validateConnection(input, getConnections(), resolvePort);
    if (validation.errors.length > 0) {
      return { errors: validation.errors };
    }

    const connection: Connection = {
      id: generateId(),
      a_port_id: input.a_port_id,
      b_port_id: input.b_port_id,
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.signal_type !== undefined
        ? { signal_type: input.signal_type }
        : {}),
    };

    layoutStore.addConnectionRaw(connection);
    layoutStore.markDirty();

    return { connection, warnings: validation.warnings };
  }

  /**
   * Update a connection's mutable fields (label/color). Endpoint changes are
   * not supported here; delete and re-add to re-route.
   */
  function updateConnection(
    id: string,
    updates: Partial<Pick<Connection, "label" | "color">>,
  ): { success: true } | { errors: string[] } {
    if (!getConnection(id)) {
      return { errors: ["Connection not found"] };
    }
    layoutStore.updateConnectionRaw(id, updates);
    layoutStore.markDirty();
    return { success: true };
  }

  /**
   * Remove a connection. Returns the removed connection, or undefined if the
   * id did not match.
   */
  function removeConnection(id: string): Connection | undefined {
    const removed = layoutStore.removeConnectionRaw(id);
    if (removed) layoutStore.markDirty();
    return removed;
  }

  /**
   * Remove every connection that touches any port of the given device. Returns
   * the removed connections so a caller (device-delete cascade) can restore
   * them on undo.
   */
  function removeConnectionsForDevice(deviceId: string): Connection[] {
    const toRemove = getConnectionsForDevice(deviceId);
    for (const c of toRemove) layoutStore.removeConnectionRaw(c.id);
    if (toRemove.length > 0) layoutStore.markDirty();
    return toRemove;
  }

  return {
    get connections() {
      return getConnections();
    },
    get hoveredConnectionId() {
      return hoveredConnectionId;
    },
    setHoveredConnection(id: string | null) {
      hoveredConnectionId = id;
    },
    getConnection,
    getConnectionsForPort,
    getConnectionsForDevice,
    resolvePort,

    addConnection,
    updateConnection,
    removeConnection,
    removeConnectionsForDevice,

    // Raw operations (for undo/redo)
    addConnectionRaw: (connection: Connection) =>
      layoutStore.addConnectionRaw(connection),
    updateConnectionRaw: (
      id: string,
      updates: Partial<Pick<Connection, "label" | "color">>,
    ) => layoutStore.updateConnectionRaw(id, updates),
    removeConnectionRaw: (id: string) => layoutStore.removeConnectionRaw(id),

    // Validation (supplies current layout state)
    validateConnection: (input: CreateConnectionInput) =>
      validateConnection(input, getConnections(), resolvePort),
  };
}

/**
 * Reset the connection store (for testing). Connection data lives in the layout
 * store (call resetLayoutStore() to clear it); the only independent state here
 * is the transient hover highlight, which this clears.
 */
export function resetConnectionStore(): void {
  hoveredConnectionId = null;
}
