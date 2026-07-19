<!--
  ConnectionLayer SVG Component

  Draws the cables for one rack face. For each connection it resolves both
  endpoints to placed devices in THIS rack and this face, computes their port
  anchors (connection-geometry.ts), and renders a ConnectionPath. Connections
  whose endpoints are not both visible here (other rack, other face, or a port
  that is not drawn on this face) are skipped -- same-rack, same-face only for
  the MVP; multi-rack routing is deferred.

  The whole thing is a $derived over the connection store and the layout store,
  so when a device is dragged its port anchors recompute and the cables follow
  for free -- no manual repositioning.
-->
<script lang="ts">
  import type { PlacedPort, RackView } from "$lib/types";
  import { getConnectionStore } from "$lib/stores/connection.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getPortAnchor, type Point } from "$lib/utils/connection-geometry";
  import { getConnectionSignalType } from "$lib/utils/port-utils";
  import { getInteriorWidth } from "$lib/constants/layout";
  import { toHumanUnits } from "$lib/utils/position";
  import ConnectionPath from "./ConnectionPath.svelte";

  interface Props {
    rackId: string;
    rackHeight: number;
    uHeight: number;
    rackWidth: number;
    /** Which face this Rack instance renders (ports are filtered to it). */
    rackView?: RackView;
  }

  let {
    rackId,
    rackHeight,
    uHeight,
    rackWidth,
    rackView = "front",
  }: Props = $props();

  const connectionStore = getConnectionStore();
  const layoutStore = getLayoutStore();

  // Vertical channel just outside the rail on the right edge; cables route
  // through it. Small offset keeps the curve clear of the frame.
  const CHANNEL_OFFSET = 12;
  const channelX = $derived(rackWidth + CHANNEL_OFFSET);

  const deviceWidth = $derived(getInteriorWidth(rackWidth));

  interface Endpoint {
    anchor: Point;
    direction: PlacedPort["direction"];
    port: PlacedPort;
  }

  /**
   * Resolve one connection endpoint to its anchor on this face, or null if the
   * port is not drawn here (device in another rack, or the interface belongs to
   * the other face).
   */
  function resolveEndpoint(portId: string): Endpoint | null {
    const resolved = connectionStore.resolvePort(portId);
    if (!resolved) return null;

    const rack = layoutStore.getRackById(rackId);
    if (!rack) return null;

    const placed = rack.devices.find((d) => d.id === resolved.deviceId);
    if (!placed) return null; // endpoint is in a different rack

    const deviceType = layoutStore.device_types.find(
      (dt) => dt.slug === placed.device_type,
    );
    const interfaces = deviceType?.interfaces;
    if (!deviceType || !interfaces) return null;

    // Which face circle index does this port occupy? PortIndicators filters
    // interfaces to those on the current face, in array order; the circle index
    // is the port's rank among same-face interfaces. If this port's interface
    // is on the other face, it is not rendered here.
    const templateIndex = resolved.port.template_index;
    const ownFace = interfaces[templateIndex]?.position ?? "front";
    if (ownFace !== rackView) return null;

    let visibleIndex = -1;
    let portCount = 0;
    for (let i = 0; i < interfaces.length; i++) {
      if ((interfaces[i]!.position ?? "front") !== rackView) continue;
      if (i === templateIndex) visibleIndex = portCount;
      portCount++;
    }
    if (visibleIndex < 0) return null;

    const anchor = getPortAnchor({
      rackHeight,
      positionHuman: toHumanUnits(placed.position),
      uHeight,
      deviceUHeight: deviceType.u_height,
      deviceWidth,
      portIndex: visibleIndex,
      portCount,
    });

    return { anchor, direction: resolved.port.direction, port: resolved.port };
  }

  // Resolve every connection to a drawable pair; overlapping connections get a
  // distinct lane so their channel routes do not coincide.
  const drawn = $derived.by(() => {
    return connectionStore.connections
      .map((connection, index) => {
        const a = resolveEndpoint(connection.a_port_id);
        const b = resolveEndpoint(connection.b_port_id);
        if (!a || !b) return null;
        const signalType = getConnectionSignalType(connection, a.port, b.port);
        return { connection, a, b, lane: index, signalType };
      })
      .filter((entry) => entry !== null);
  });
</script>

<g class="connection-layer">
  {#each drawn as { connection, a, b, lane, signalType } (connection.id)}
    <ConnectionPath
      {connection}
      aAnchor={a.anchor}
      bAnchor={b.anchor}
      aDirection={a.direction}
      bDirection={b.direction}
      {signalType}
      {channelX}
      {lane}
      highlighted={connectionStore.hoveredConnectionId === connection.id}
    />
  {/each}
</g>

<style>
  .connection-layer {
    pointer-events: none;
  }
</style>
