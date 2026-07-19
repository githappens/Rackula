/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type { DeviceType, InterfaceType, PlacedPort, PortDirection } from "$lib/types";
import { generateId } from "$lib/utils/device";

export type PortCategory = "network" | "power" | "console" | "av";

export const AV_INTERFACE_TYPES: ReadonlySet<string> = new Set([
  "xlr-3",
  "trs-1-4",
  "ts-1-4",
  "rca",
  "adat-optical",
  "midi-din",
  "bnc",
  "db25-audio",
]);

/**
 * Categorize an interface type string into network, power, console, or av.
 * Uses string matching so it handles future types (e.g. power-inlet-*) even
 * before they are added to the InterfaceType enum. AV types are the exception:
 * they use an explicit set lookup against AV_INTERFACE_TYPES, so that set must
 * be extended whenever new AV slugs are added to the schema.
 */
export function getPortCategory(type: string): PortCategory {
  if (AV_INTERFACE_TYPES.has(type)) {
    return "av";
  }
  if (
    type === "console" ||
    type.includes("usb") ||
    type.includes("serial") ||
    type.includes("de-9")
  ) {
    return "console";
  }
  if (type.includes("power") || type.includes("iec") || type.includes("nema")) {
    return "power";
  }
  return "network";
}

/**
 * Infer the signal flow direction for a port.
 * Returns undefined for AV types because direction must be explicitly set on those.
 * Returns "input" for management-only ports and console ports.
 * Returns "bidirectional" for all other types (network, USB, etc.).
 */
export function inferDirection(
  type: InterfaceType,
  mgmtOnly?: boolean,
): PortDirection | undefined {
  if (mgmtOnly) return "input";
  if (type === "console") return "input";
  if (AV_INTERFACE_TYPES.has(type)) return undefined; // AV needs explicit direction
  return "bidirectional";
}

/**
 * Instantiate ports from a DeviceType's interface templates
 * Creates PlacedPort instances with stable UUIDs for each interface
 *
 * @param deviceType - The device type containing interface templates
 * @returns Array of PlacedPort instances with unique IDs, indexes, and cached types
 */
export function instantiatePorts(deviceType: DeviceType): PlacedPort[] {
  if (!deviceType.interfaces || deviceType.interfaces.length === 0) {
    return [];
  }

  return deviceType.interfaces.map((iface, index) => ({
    id: generateId(),
    template_name: iface.name,
    template_index: index,
    type: iface.type,
    direction: iface.direction ?? inferDirection(iface.type, iface.mgmt_only),
  }));
}
