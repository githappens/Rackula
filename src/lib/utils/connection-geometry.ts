/**
 * Connection Geometry
 *
 * Absolute SVG coordinates for a placed port, plus the cable path routed
 * through an external side channel. Coordinates are in the same space as the
 * Rack's devices layer (the `<g transform="translate(0, RACK_PADDING +
 * RAIL_WIDTH)">` group): the y-origin is the top of the U-grid and the x-origin
 * is the left edge of the rack SVG, so anchors line up with the rendered
 * device groups without any extra offset.
 *
 * The path adapts the external-channel cubic-bezier algorithm from spike #262
 * (docs/research/connection-routing.ts): the cable exits horizontally toward a
 * vertical channel just outside the rack, runs down it, then curves back to the
 * far port. A per-connection lane offset nudges the channel so connections that
 * span the same U range do not draw on top of one another.
 */

import { RAIL_WIDTH } from "$lib/constants/layout";
import { computePortLayout } from "$lib/utils/port-layout";

export interface Point {
  x: number;
  y: number;
}

export interface PortAnchorInput {
  /** Rack height in U. */
  rackHeight: number;
  /** Device position in human U units (1-based from the bottom). */
  positionHuman: number;
  /** Pixel height of 1U (U_HEIGHT_PX). */
  uHeight: number;
  /** Device height in U. */
  deviceUHeight: number;
  /** Device interior width in px (between the rails). */
  deviceWidth: number;
  /** Index of the port among the device's visible (same-face) ports. */
  portIndex: number;
  /** Number of visible (same-face) ports on the device. */
  portCount: number;
}

/**
 * Absolute SVG coordinate of a specific port circle, in the Rack devices-layer
 * coordinate space. Composes the device-Y formula used by RackDevice.svelte
 *   deviceY = (rackHeight - positionHuman - deviceUHeight + 1) * uHeight
 * with the shared port layout (computePortLayout). The device group is
 * translated by RAIL_WIDTH in x, so the anchor adds RAIL_WIDTH to the
 * device-local port x; the ports never disagree with the drawn circles because
 * both read computePortLayout.
 */
export function getPortAnchor(input: PortAnchorInput): Point {
  const {
    rackHeight,
    positionHuman,
    uHeight,
    deviceUHeight,
    deviceWidth,
    portIndex,
    portCount,
  } = input;

  const deviceY = (rackHeight - positionHuman - deviceUHeight + 1) * uHeight;
  const deviceHeight = deviceUHeight * uHeight;

  const layout = computePortLayout(portCount, deviceWidth, deviceHeight);
  const point = layout[portIndex];
  if (!point) {
    throw new Error(
      `Port index ${portIndex} out of range for ${portCount} ports`,
    );
  }

  return {
    x: RAIL_WIDTH + point.x,
    y: deviceY + point.y,
  };
}

export interface ConnectionPathOptions {
  /** X of the vertical routing channel (roughly rack width + a small offset). */
  channelX: number;
  /**
   * Per-connection lane index. Distinct lanes shift the channel so connections
   * spanning the same U range route on separate vertical lines instead of
   * overlapping. Default 0.
   */
  lane?: number;
}

/** Horizontal spacing between adjacent routing lanes in the channel. */
const LANE_SPACING = 6;

/**
 * Cubic-bezier cable path routed through the external side channel (spike #262,
 * algorithm 5). Control points ride out to `channelX` (shifted by the lane
 * offset) at each endpoint's y, giving a smooth S that never crosses the device
 * bodies.
 */
export function buildConnectionPath(
  a: Point,
  b: Point,
  options: ConnectionPathOptions,
): string {
  const gutterX = laneGutterX(options);
  return `M ${a.x},${a.y} C ${gutterX},${a.y} ${gutterX},${b.y} ${b.x},${b.y}`;
}

/** X of the routing lane for a connection: the channel shifted by its lane. */
function laneGutterX(options: ConnectionPathOptions): number {
  return options.channelX + (options.lane ?? 0) * LANE_SPACING;
}

export interface PathMidpoint {
  /** Point on the cubic at t = 0.5. */
  point: Point;
  /** Rotation in degrees of the tangent at t = 0.5, pointing a -> b. */
  angle: number;
}

/**
 * Midpoint and tangent angle of the routed cubic, for placing a direction arrow
 * at the middle of the cable pointing from a toward b. Evaluates the same
 * control points buildConnectionPath uses, so the arrow rides on the drawn
 * curve rather than a straight-line approximation.
 */
export function connectionMidpoint(
  a: Point,
  b: Point,
  options: ConnectionPathOptions,
): PathMidpoint {
  const gutterX = laneGutterX(options);
  const c1: Point = { x: gutterX, y: a.y };
  const c2: Point = { x: gutterX, y: b.y };

  const t = 0.5;
  const mt = 1 - t;
  // Cubic Bezier B(t) with control points a, c1, c2, b.
  const point: Point = {
    x:
      mt * mt * mt * a.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * b.x,
    y:
      mt * mt * mt * a.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * b.y,
  };

  // Derivative B'(t) gives the tangent direction.
  const dx =
    3 * mt * mt * (c1.x - a.x) +
    6 * mt * t * (c2.x - c1.x) +
    3 * t * t * (b.x - c2.x);
  const dy =
    3 * mt * mt * (c1.y - a.y) +
    6 * mt * t * (c2.y - c1.y) +
    3 * t * t * (b.y - c2.y);

  return { point, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
