/**
 * Connection Row Model
 *
 * Pure join of connections -> ports -> devices -> racks into the flat row shape
 * the Connections panel renders and filters. Kept out of the component so the
 * join (endpoint resolution, device naming, effective signal, unresolvable
 * detection) is unit-testable without rendering.
 */

import type {
  Connection,
  DeviceType,
  PlacedPort,
  Rack,
  SignalType,
} from "$lib/types";
import { getConnectionSignalType } from "$lib/utils/port-utils";

/**
 * One resolved endpoint of a connection.
 */
export interface ConnectionRowEndpoint {
  deviceId: string;
  deviceName: string;
  portLabel: string;
  portType: string;
}

/**
 * A flat, renderable/filterable view of one connection. `resolved` is false
 * when either endpoint port could not be found (hand-edited YAML); such rows
 * are rendered with a loud error style, never hidden.
 */
export interface ConnectionRow {
  id: string;
  resolved: boolean;
  a: ConnectionRowEndpoint | undefined;
  b: ConnectionRowEndpoint | undefined;
  aDeviceName: string;
  bDeviceName: string;
  label: string;
  /** Effective signal of the cable, or undefined if unresolved. */
  signal_type: SignalType | undefined;
  /** The connection's own signal override, if any (for the inline select). */
  signalOverride: SignalType | undefined;
  /** Rack that holds the a-side device, or "" when unresolved. */
  rackId: string;
}

/**
 * Display name for a placed device: its custom name, else the device type's
 * model, else the type slug.
 */
function deviceDisplayName(
  placedName: string | undefined,
  deviceType: DeviceType | undefined,
  slug: string,
): string {
  return placedName ?? deviceType?.model ?? deviceType?.slug ?? slug;
}

/**
 * Build the panel's row model. Pure: reads only its arguments.
 */
export function buildConnectionRows(
  connections: readonly Connection[],
  racks: readonly Rack[],
  deviceTypes: readonly DeviceType[],
): ConnectionRow[] {
  // Index every placed port by id -> its endpoint context, once per build.
  const portIndex = new Map<
    string,
    { port: PlacedPort; endpoint: ConnectionRowEndpoint; rackId: string }
  >();
  const typeBySlug = new Map(deviceTypes.map((t) => [t.slug, t]));

  for (const rack of racks) {
    for (const device of rack.devices) {
      const deviceType = typeBySlug.get(device.device_type);
      const deviceName = deviceDisplayName(
        device.name,
        deviceType,
        device.device_type,
      );
      for (const port of device.ports ?? []) {
        portIndex.set(port.id, {
          port,
          endpoint: {
            deviceId: device.id,
            deviceName,
            portLabel: port.label ?? port.template_name,
            portType: port.type,
          },
          rackId: rack.id,
        });
      }
    }
  }

  return connections.map((connection) => {
    const a = portIndex.get(connection.a_port_id);
    const b = portIndex.get(connection.b_port_id);
    const resolved = a !== undefined && b !== undefined;
    const signal_type = resolved
      ? getConnectionSignalType(connection, a.port, b.port)
      : undefined;

    return {
      id: connection.id,
      resolved,
      a: a?.endpoint,
      b: b?.endpoint,
      aDeviceName: a?.endpoint.deviceName ?? "",
      bDeviceName: b?.endpoint.deviceName ?? "",
      label: connection.label ?? "",
      signal_type,
      signalOverride: connection.signal_type,
      rackId: a?.rackId ?? "",
    };
  });
}
