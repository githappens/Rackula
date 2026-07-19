/**
 * Recorded Device Type Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — device type library
 * operations with undo/redo support. Each function creates a Command
 * wrapping raw mutators, then executes it through the history system.
 */

import type { DeviceType } from "$lib/types";
import {
  createDeviceType as createDeviceTypeHelper,
  findDeviceType as findDeviceTypeInArray,
  type CreateDeviceTypeInput,
} from "$lib/stores/layout-helpers";
import { layoutDebug } from "$lib/utils/debug";
import {
  createAddDeviceTypeCommand,
  createUpdateDeviceTypeCommand,
  createDeleteDeviceTypeCommand,
  createBatchCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getPlacedDevicesWithRackForType } from "./mutators";

/**
 * Add a device type with undo/redo support
 * @param ctx - Layout state access
 * @param data - Device type creation input
 * @returns The created device type
 */
export function addDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  data: CreateDeviceTypeInput,
): DeviceType {
  const deviceType = createDeviceTypeHelper(data);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createAddDeviceTypeCommand(deviceType, adapter);
  history.execute(command);
  ctx.markDirty();

  return deviceType;
}

/**
 * Update a device type with undo/redo support
 * @param ctx - Layout state access
 * @param slug - Device type slug
 * @param updates - Properties to update
 */
export function updateDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  slug: string,
  updates: Partial<DeviceType>,
): void {
  const layout = ctx.getLayout();
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  // Capture before state for the fields being updated
  const before: Partial<DeviceType> = {};
  for (const key of Object.keys(updates) as (keyof DeviceType)[]) {
    before[key] = existing[key] as never;
  }

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createUpdateDeviceTypeCommand(slug, before, updates, adapter);
  history.execute(command);
  ctx.markDirty();
}

/**
 * Delete a device type with undo/redo support
 * @param ctx - Layout state access
 * @param slug - Device type slug
 */
export function deleteDeviceTypeRecorded(
  ctx: LayoutStateAccess,
  slug: string,
): void {
  const layout = ctx.getLayout();
  const existing = findDeviceTypeInArray(layout.device_types, slug);
  if (!existing) return;

  const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = createDeleteDeviceTypeCommand(
    existing,
    placedDevices,
    adapter,
    layout.metadata?.id ?? "",
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Delete multiple device types with single undo/redo support
 * Used for bulk cleanup operations
 * @param ctx - Layout state access
 * @param slugs - Array of device type slugs to delete
 * @returns Number of device types actually deleted
 */
export function deleteMultipleDeviceTypesRecorded(
  ctx: LayoutStateAccess,
  slugs: string[],
): number {
  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: received %d slugs",
    slugs.length,
  );

  if (slugs.length === 0) {
    layoutDebug.state(
      "deleteMultipleDeviceTypesRecorded: early return - no slugs",
    );
    return 0;
  }

  const layout = ctx.getLayout();
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const commands: ReturnType<typeof createDeleteDeviceTypeCommand>[] = [];

  for (const slug of slugs) {
    const existing = findDeviceTypeInArray(layout.device_types, slug);
    if (!existing) continue;

    const placedDevices = getPlacedDevicesWithRackForType(ctx, slug);
    const command = createDeleteDeviceTypeCommand(
      existing,
      placedDevices,
      adapter,
      layout.metadata?.id ?? "",
    );
    commands.push(command);
  }

  if (commands.length === 0) {
    layoutDebug.state(
      "deleteMultipleDeviceTypesRecorded: no valid commands created",
    );
    return 0;
  }

  // Create a batch command for single undo
  const count = commands.length;
  const description =
    count === 1 ? "Delete device type" : `Delete ${count} device types`;

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: executing batch command - %s",
    description,
  );

  const batchCommand = createBatchCommand(description, commands);
  history.execute(batchCommand);
  ctx.markDirty();

  layoutDebug.state(
    "deleteMultipleDeviceTypesRecorded: completed - deleted %d device types",
    count,
  );

  return count;
}
