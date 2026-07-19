/**
 * Pending Connection Store
 *
 * Drives the click-port-to-port connection workflow. The first port click
 * arms a source; the second click on a different port creates the connection
 * through the layout facade's undoable `addConnectionRecorded`. Clicking the
 * armed port again toggles it off.
 *
 * State is module-level so the singleton survives the per-call get-store
 * pattern (mirrors how connection.svelte.ts holds `hoveredConnectionId`).
 */

import { getLayoutStore } from "./layout.svelte";
import { getToastStore } from "./toast.svelte";

/** The port currently armed as the source of a pending connection, or null. */
let sourcePortId = $state<string | null>(null);

/**
 * Validation errors from the most recent failed creation attempt. Surfaced to
 * a toast and readable by tests; cleared on a successful create, a new arm, or
 * cancel().
 */
let lastErrors = $state<string[]>([]);

/**
 * Handle a port click in the connection workflow.
 *
 * - Nothing armed: arm this port as the source, clear prior errors.
 * - Same port clicked again: disarm (toggle off), no creation.
 * - A different port: create the connection via the undoable
 *   `addConnectionRecorded`. On success, disarm and surface any warnings. On
 *   failure, keep the source armed, record the errors, and surface them. Never
 *   swallow warnings or errors.
 */
function clickPort(portId: string): void {
  const toastStore = getToastStore();

  if (sourcePortId === null) {
    sourcePortId = portId;
    lastErrors = [];
    return;
  }

  if (sourcePortId === portId) {
    sourcePortId = null;
    return;
  }

  const layoutStore = getLayoutStore();
  const result = layoutStore.addConnectionRecorded({
    a_port_id: sourcePortId,
    b_port_id: portId,
  });

  if ("connection" in result) {
    sourcePortId = null;
    lastErrors = [];
    for (const warning of result.warnings) {
      toastStore.showToast(warning, "warning");
    }
    return;
  }

  // Failure: keep the source armed so the user can retry a different target.
  lastErrors = result.errors;
  for (const error of result.errors) {
    toastStore.showToast(error, "error");
  }
}

/** Disarm the pending source and clear any recorded errors. */
function cancel(): void {
  sourcePortId = null;
  lastErrors = [];
}

/**
 * Get the pending-connection store. Returns a fresh view object per call over
 * the module-level singleton state.
 */
export function getPendingConnectionStore() {
  return {
    get sourcePortId() {
      return sourcePortId;
    },
    get lastErrors() {
      return lastErrors;
    },
    clickPort,
    cancel,
  };
}

/** Reset the pending-connection store (for testing). */
export function resetPendingConnectionStore(): void {
  sourcePortId = null;
  lastErrors = [];
}
