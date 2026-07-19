/**
 * Port Layout Math
 *
 * Pure geometry for where each low-density port circle sits in device-local
 * SVG coordinates. Extracted from PortIndicators.svelte so the port indicators
 * and the cable endpoints (connection-geometry.ts) can never disagree: both
 * derive their positions from this single function.
 *
 * Constants are the real values PortIndicators renders with. Keep them in sync:
 * changing a value here changes both the drawn circles and the cable anchors.
 */

/** Radius of a rendered port circle. */
export const PORT_RADIUS = 3;

/** Horizontal spacing between adjacent port circles. */
export const PORT_SPACING = 8;

/** Distance of the port row from the bottom edge of the device. */
export const PORT_Y_OFFSET = 8;

/**
 * Above this many visible ports, PortIndicators switches to grouped badges
 * instead of individual circles. Cable anchoring is only meaningful in the
 * per-circle (low-density) mode.
 */
export const HIGH_DENSITY_THRESHOLD = 24;

export interface PortPoint {
  x: number;
  y: number;
  index: number;
}

/**
 * Where each port circle sits in device-local SVG coords, centered horizontally
 * along the device's bottom edge. Must produce exactly what PortIndicators
 * renders today for the low-density (per-circle) case.
 *
 * @param portCount - Number of visible ports on this face
 * @param deviceWidth - Device interior width in px
 * @param deviceHeight - Device height in px
 */
export function computePortLayout(
  portCount: number,
  deviceWidth: number,
  deviceHeight: number,
): PortPoint[] {
  if (portCount <= 0) return [];

  const totalWidth = (portCount - 1) * PORT_SPACING;
  const startX = (deviceWidth - totalWidth) / 2;
  const y = deviceHeight - PORT_Y_OFFSET;

  return Array.from({ length: portCount }, (_, index) => ({
    x: startX + index * PORT_SPACING,
    y,
    index,
  }));
}
