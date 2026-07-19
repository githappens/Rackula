<!--
  ConnectionPath SVG Component

  Renders a single connection as a cubic-bezier cable routed through the side
  channel (connection-geometry.ts). A direction arrow is drawn at the path
  midpoint, computed from the two ports' directions at render time (no
  data-model involvement):
    - one output + one input/bidirectional -> single arrow from the output side
    - one input + one bidirectional        -> single arrow toward the input side
    - both bidirectional (or both outputs)  -> plain line, no arrow
  The arrow inherits the connection's stroke colour. Hover thickens the path and
  records the hovered connection id in the connection store (Task 10 reads it).
-->
<script lang="ts">
  import type { Connection, PortDirection, SignalType } from "$lib/types";
  import {
    buildConnectionPath,
    connectionMidpoint,
    type Point,
  } from "$lib/utils/connection-geometry";
  import { getConnectionStore } from "$lib/stores/connection.svelte";

  interface Props {
    connection: Connection;
    aAnchor: Point;
    bAnchor: Point;
    /** Direction of the A-side port (drives the arrow). */
    aDirection?: PortDirection;
    /** Direction of the B-side port (drives the arrow). */
    bDirection?: PortDirection;
    /** Effective signal this cable carries (drives the family colour). */
    signalType?: SignalType;
    channelX: number;
    /** Per-connection routing lane, to separate overlapping cables. */
    lane?: number;
    highlighted?: boolean;
  }

  let {
    connection,
    aAnchor,
    bAnchor,
    aDirection,
    bDirection,
    signalType,
    channelX,
    lane = 0,
    highlighted = false,
  }: Props = $props();

  const connectionStore = getConnectionStore();

  // Map a signal type to its family colour token. Analog audio, digital audio,
  // and video collapse to one token per family; midi/clock/data/ethernet get
  // their own; anything else falls to "other".
  function signalColour(signal: SignalType): string {
    if (signal.startsWith("analog-audio")) return "var(--colour-signal-analog)";
    if (signal.startsWith("digital-audio"))
      return "var(--colour-signal-digital-audio)";
    if (signal.startsWith("digital-video")) return "var(--colour-signal-video)";
    if (signal === "control-midi") return "var(--colour-signal-midi)";
    if (signal === "clock-word") return "var(--colour-signal-clock)";
    if (signal === "data-usb" || signal === "ethernet")
      return "var(--colour-signal-data)";
    return "var(--colour-signal-other)";
  }

  // Colour precedence: explicit user colour -> signal-family token -> default.
  const stroke = $derived(
    connection.color ??
      (signalType ? signalColour(signalType) : "var(--colour-port-default)"),
  );

  const d = $derived(buildConnectionPath(aAnchor, bAnchor, { channelX, lane }));

  // Direction of signal flow along the path, expressed as +1 (a -> b),
  // -1 (b -> a), or 0 (no determinable direction: draw a plain line).
  const flow = $derived.by<1 | -1 | 0>(() => {
    const aOut = aDirection === "output";
    const bOut = bDirection === "output";
    const aIn = aDirection === "input";
    const bIn = bDirection === "input";

    // Exactly one output: signal leaves the output.
    if (aOut && !bOut) return 1;
    if (bOut && !aOut) return -1;
    // No output but exactly one input: signal heads toward the input.
    if (aIn && !bIn) return -1;
    if (bIn && !aIn) return 1;
    // Both outputs, both inputs, or both bidirectional: no arrow.
    return 0;
  });

  const midpoint = $derived(
    connectionMidpoint(aAnchor, bAnchor, { channelX, lane }),
  );

  // Arrow rotation: the midpoint tangent points a -> b, so flip it for b -> a.
  const arrowAngle = $derived(
    flow === -1 ? midpoint.angle + 180 : midpoint.angle,
  );

  const strokeWidth = $derived(highlighted ? 3 : 1.5);

  function handleEnter() {
    connectionStore.setHoveredConnection(connection.id);
  }
  function handleLeave() {
    connectionStore.setHoveredConnection(null);
  }
</script>

<g
  class="connection-path"
  role="presentation"
  onmouseenter={handleEnter}
  onmouseleave={handleLeave}
>
  <path
    {d}
    fill="none"
    {stroke}
    stroke-width={strokeWidth}
    stroke-linecap="round"
    >{#if connection.label}<title>{connection.label}</title>{/if}</path
  >

  {#if flow !== 0}
    <!-- 8px direction arrow at the path midpoint, rotated along the tangent and
         inheriting the connection's stroke colour. -->
    <path
      class="connection-arrow"
      d="M -4 -3 L 4 0 L -4 3 Z"
      fill={stroke}
      transform="translate({midpoint.point.x}, {midpoint.point
        .y}) rotate({arrowAngle})"
    />
  {/if}
</g>

<style>
  .connection-path {
    pointer-events: stroke;
  }

  .connection-arrow {
    pointer-events: none;
  }
</style>
