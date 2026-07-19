<!--
  ConnectionsPanel Component

  Interactive, filterable list of every port-to-port connection in the layout.
  Rows join connections -> ports -> devices -> racks (see buildConnectionRows).
  Filter by signal type (chips), rack (select), and free text. Hovering a row
  highlights its cable on the canvas (bidirectional with the render layer).
  Signal and label are inline-editable and delete is per row; both go through
  the layout facade's recorded operations so they undo/redo.
-->
<script lang="ts">
  import type { SignalType } from "$lib/types";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getConnectionStore } from "$lib/stores/connection.svelte";
  import {
    getConnectionFilterStore,
    filterConnections,
  } from "$lib/stores/connection-filters.svelte";
  import { buildConnectionRows } from "$lib/utils/connection-rows";
  import { SIGNAL_LABELS, getSignalLabel } from "$lib/utils/port-utils";

  const layoutStore = getLayoutStore();
  const connectionStore = getConnectionStore();
  const filterStore = getConnectionFilterStore();

  const SIGNAL_TYPES = Object.keys(SIGNAL_LABELS) as SignalType[];

  const rows = $derived(
    buildConnectionRows(
      connectionStore.connections,
      layoutStore.racks,
      layoutStore.device_types,
    ),
  );

  const visibleRows = $derived(filterConnections(rows, filterStore.state));

  // Racks that actually hold a connection endpoint, for the rack filter select.
  const rackOptions = $derived(
    layoutStore.racks.map((r) => ({ id: r.id, name: r.name })),
  );

  function handleRackChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    filterStore.setRackIds(value ? [value] : []);
  }

  const selectedRackId = $derived(
    filterStore.rackIds.size === 1 ? [...filterStore.rackIds][0] : "",
  );

  function handleSignalEdit(id: string, event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    // Empty string clears the per-cable override (signal falls back to ports).
    layoutStore.updateConnectionRecorded(id, {
      signal_type: value ? (value as SignalType) : undefined,
    });
  }

  function handleLabelEdit(id: string, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    layoutStore.updateConnectionRecorded(id, { label: value });
  }

  function handleDelete(id: string) {
    connectionStore.setHoveredConnection(null);
    layoutStore.removeConnectionRecorded(id);
  }
</script>

<div class="connections-panel" data-testid="connections-panel">
  <div class="filters">
    <input
      type="search"
      class="search"
      placeholder="Search connections"
      aria-label="Search connections"
      data-testid="connections-search"
      value={filterStore.search}
      oninput={(e) =>
        filterStore.setSearch((e.currentTarget as HTMLInputElement).value)}
    />

    {#if rackOptions.length > 1}
      <select
        class="rack-select"
        aria-label="Filter by rack"
        data-testid="connections-rack-filter"
        value={selectedRackId}
        onchange={handleRackChange}
      >
        <option value="">All racks</option>
        {#each rackOptions as rack (rack.id)}
          <option value={rack.id}>{rack.name}</option>
        {/each}
      </select>
    {/if}

    <div class="chips" role="group" aria-label="Filter by signal type">
      {#each SIGNAL_TYPES as signal (signal)}
        <button
          type="button"
          class="chip"
          class:chip--active={filterStore.signalTypes.has(signal)}
          aria-pressed={filterStore.signalTypes.has(signal)}
          onclick={() => filterStore.toggleSignalType(signal)}
        >
          {getSignalLabel(signal)}
        </button>
      {/each}
    </div>
  </div>

  {#if visibleRows.length === 0}
    <p class="empty" data-testid="connections-empty">
      No connections match the filters
    </p>
  {:else}
    <table class="connections-table">
      <thead>
        <tr>
          <th scope="col">A</th>
          <th scope="col">B</th>
          <th scope="col">Signal</th>
          <th scope="col">Label</th>
          <th scope="col"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.id)}
          <tr
            class="row"
            class:row--error={!row.resolved}
            data-testid="connection-row"
            onmouseenter={() => connectionStore.setHoveredConnection(row.id)}
            onmouseleave={() => connectionStore.setHoveredConnection(null)}
          >
            {#if row.resolved}
              <td>
                <span class="device">{row.a?.deviceName}</span>
                <span class="port">{row.a?.portLabel}</span>
              </td>
              <td>
                <span class="device">{row.b?.deviceName}</span>
                <span class="port">{row.b?.portLabel}</span>
              </td>
              <td>
                <select
                  class="signal-select"
                  aria-label="Signal type"
                  value={row.signalOverride ?? ""}
                  onchange={(e) => handleSignalEdit(row.id, e)}
                >
                  <option value="">
                    {row.signal_type
                      ? `Auto (${getSignalLabel(row.signal_type)})`
                      : "Auto"}
                  </option>
                  {#each SIGNAL_TYPES as signal (signal)}
                    <option value={signal}>{getSignalLabel(signal)}</option>
                  {/each}
                </select>
              </td>
              <td>
                <input
                  type="text"
                  class="label-input"
                  aria-label="Connection label"
                  value={row.label}
                  onchange={(e) => handleLabelEdit(row.id, e)}
                />
              </td>
            {:else}
              <td class="missing" colspan="4">
                Missing port: connection references a port that no longer exists.
              </td>
            {/if}
            <td class="actions">
              <button
                type="button"
                class="delete-btn"
                aria-label="Delete connection"
                data-testid="connection-delete"
                onclick={() => handleDelete(row.id)}
              >
                Delete
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .connections-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    min-height: 0;
    overflow-y: auto;
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .search,
  .rack-select {
    width: 100%;
    padding: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .chip {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-full, 999px);
    cursor: pointer;
  }

  .chip:hover {
    background: var(--colour-surface-hover);
    color: var(--colour-text);
  }

  .chip--active {
    background: color-mix(in srgb, var(--colour-selection) 20%, transparent);
    border-color: var(--colour-selection);
    color: var(--colour-text);
  }

  .empty {
    margin: 0;
    color: var(--colour-text-muted);
    font-size: var(--font-size-sm);
  }

  .connections-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .connections-table th {
    text-align: left;
    padding: var(--space-1) var(--space-2);
    color: var(--colour-text-muted);
    font-weight: var(--font-weight-medium);
    border-bottom: 1px solid var(--colour-border);
  }

  .connections-table td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--colour-border);
    vertical-align: top;
  }

  .row:hover {
    background: var(--colour-surface-hover);
  }

  .row--error {
    background: color-mix(in srgb, var(--colour-danger, #d33) 12%, transparent);
  }

  .missing {
    color: var(--colour-danger, #d33);
    font-weight: var(--font-weight-medium);
  }

  .device {
    display: block;
    color: var(--colour-text);
  }

  .port {
    display: block;
    color: var(--colour-text-muted);
    font-size: var(--font-size-xs);
  }

  .signal-select,
  .label-input {
    width: 100%;
    min-width: 0;
    padding: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--colour-text);
    background: var(--colour-surface);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
  }

  .actions {
    white-space: nowrap;
  }

  .delete-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--colour-danger, #d33);
    background: transparent;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .delete-btn:hover {
    background: color-mix(in srgb, var(--colour-danger, #d33) 12%, transparent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
