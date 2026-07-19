/**
 * Port Utilities
 * Functions for port instantiation when devices are placed
 */

import type {
  Connection,
  DeviceType,
  InterfaceType,
  PlacedPort,
  PortDirection,
  SignalType,
} from "$lib/types";
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
 * Human-readable signal names, one per SignalType value. Shared source for the
 * port tooltip and the Connections panel so a label change lands in both.
 */
export const SIGNAL_LABELS: Record<SignalType, string> = {
  ethernet: "Ethernet",
  "power-ac": "AC power",
  "analog-audio-mic": "Mic level",
  "analog-audio-line": "Line level",
  "analog-audio-speaker": "Speaker level",
  "digital-audio-aes3": "AES3",
  "digital-video-hdmi": "HDMI",
  "digital-video-sdi": "SDI",
  "control-midi": "MIDI",
  "data-usb": "USB data",
  "digital-audio-adat": "ADAT",
  "digital-audio-spdif": "S/PDIF",
  "clock-word": "Word clock",
};

/**
 * Label for a signal type, falling back to the raw slug for forward
 * compatibility if a new value is not yet in SIGNAL_LABELS.
 */
export function getSignalLabel(signal: SignalType): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

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
 * Infer the signal a connector carries from its type (and, for XLR, direction).
 * Returns undefined for connectors whose signal is not stored (network types:
 * ethernet is implied by the connector, not a distinct signal to label).
 */
export function inferSignalType(
  type: InterfaceType,
  direction?: PortDirection,
): SignalType | undefined {
  switch (type) {
    case "xlr-3":
      return direction === "input" ? "analog-audio-mic" : "analog-audio-line";
    case "trs-1-4":
    case "ts-1-4":
    case "rca":
    case "db25-audio":
      return "analog-audio-line";
    case "adat-optical":
      return "digital-audio-adat";
    case "midi-din":
      return "control-midi";
    case "bnc":
      return "clock-word";
    case "usb-a":
    case "usb-b":
    case "usb-c":
    case "usb-mini-b":
    case "usb-micro-b":
      return "data-usb";
    default:
      return undefined;
  }
}

/**
 * Effective signal of a cable: connection override -> explicit port value ->
 * inference. The connection override wins so a specific cable can be labelled
 * without editing either port; explicit port values beat inference so an
 * overridden port is authoritative; inference is the last-resort fallback,
 * a-side first.
 */
export function getConnectionSignalType(
  connection: Connection,
  a: PlacedPort | undefined,
  b: PlacedPort | undefined,
): SignalType | undefined {
  if (connection.signal_type) return connection.signal_type;
  if (a?.signal_type) return a.signal_type;
  if (b?.signal_type) return b.signal_type;
  const inferredA = a ? inferSignalType(a.type, a.direction) : undefined;
  if (inferredA) return inferredA;
  return b ? inferSignalType(b.type, b.direction) : undefined;
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
    // Copy explicit template values only; inferred signals are computed at read
    // time so a later direction edit stays consistent.
    ...(iface.signal_type !== undefined
      ? { signal_type: iface.signal_type }
      : {}),
  }));
}
