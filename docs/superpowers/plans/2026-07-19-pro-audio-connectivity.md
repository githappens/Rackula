# Pro-Audio Connectivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pro-audio port types, port direction, a Connection store, cable overlay rendering, and a filterable connection list to this Rackula fork, per `docs/superpowers/specs/2026-07-19-pro-audio-connectivity-design.md`.

**Architecture:** Follow upstream Epic #1928's schema and ordering exactly (issues #1930, #369, #1931, #639 contain the acceptance criteria we implement). The epic's 2026-06-06 review comments refine those issue bodies (signal_type lives on ports, arrow rendering spec, security constraints, `control-midi` naming); **where a comment conflicts with an issue body, the comment wins.** Data layer first (types → zod → utils), then store + undo/redo commands, then rendering, then the list panel. Every task pairs schema changes with visible UI and lands as its own commit(s) on branch `feat/pro-audio-connectivity`.

**Tech Stack:** Svelte 5 (runes only — never Svelte 4 stores), TypeScript, Zod 4, Vitest 4 (happy-dom, tests in `src/tests/*.test.ts`), Playwright (e2e in `e2e/*.spec.ts`), Vite 8.

**House rules (override notes):**
- Commits: `type: description` format. **No AI co-author trailers** — the user's global convention overrides upstream's CLAUDE.md request.
- TDD per upstream CLAUDE.md: test behavior, not rendering. ESLint blocks `querySelector()`, `toHaveClass()`, `toHaveLength(<literal>)`, hardcoded color assertions.
- Heavy commands (`npm ci`, `npm run test:run`, `npm run build`, e2e) go through `busybee -- <cmd>`. `npm run dev` is interactive — no busybee.
- Security (epic comment, 2026-06-06): any new user-provided string field gets `z.string().max(256)`; new enum fields (direction, signal type) are Zod-validated on import — no arbitrary strings from layout files.
- Every session: `source scripts/santa-env.sh` (created in Task 0) before any npm/vite/test command.

---

## Task 0: Toolchain under Santa lockdown

Santa only allows binary execution from `/nix/store/...` and `<project>/build*/...`. Node comes from the nix store; esbuild and Playwright browsers do not.

**Files:**
- Create: `scripts/santa-env.sh`
- Create: `scripts/santa-setup.sh`
- Create: `docs/fork/santa-toolchain.md`

- [ ] **Step 1: Put node on PATH and install deps**

Node is not on PATH by default. Find the nix store node (known good: `nodejs-24.15.0`):

```bash
export PATH="$(ls -d /nix/store/*-nodejs-24.15.0/bin | head -1):$PATH"
node --version   # expect v24.15.0
cd /Users/bence/Work/plato/rackbuilder
busybee -- npm ci
```

- [ ] **Step 2: Create the env + setup scripts**

`scripts/santa-setup.sh` (run once after every `npm ci`):

```bash
#!/usr/bin/env bash
# Copies native binaries that tools spawn from node_modules into build/,
# where Santa's allow-list permits execution. Re-run after npm ci.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build
cp node_modules/@esbuild/darwin-arm64/bin/esbuild build/esbuild
build/esbuild --version
echo "santa-setup: esbuild $(build/esbuild --version) staged in build/"
```

`scripts/santa-env.sh` (source in every shell before npm commands):

```bash
# source this file: `source scripts/santa-env.sh`
export PATH="$(ls -d /nix/store/*-nodejs-*/bin 2>/dev/null | sort -V | tail -1):$PATH"
export ESBUILD_BINARY_PATH="$PWD/build/esbuild"
export PLAYWRIGHT_BROWSERS_PATH="$PWD/build/pw-browsers"
```

```bash
chmod +x scripts/santa-setup.sh
./scripts/santa-setup.sh    # expect: prints esbuild 0.28.1
source scripts/santa-env.sh
```

esbuild's JS wrapper honors `ESBUILD_BINARY_PATH` and requires the binary version to exactly match the npm package (0.28.1) — that's why we copy the installed binary instead of using a nix-provided one.

- [ ] **Step 3: Keep build/ and local scripts out of git status noise**

`build/` is not in upstream's `.gitignore`. Use local excludes (no upstream conflict surface):

```bash
echo "build/" >> .git/info/exclude
git status --short   # expect: only the new scripts/docs files
```

- [ ] **Step 4: Verify the three critical commands**

```bash
busybee -- npm run test:run     # full vitest suite — expect PASS (green baseline)
busybee -- npm run build        # vite build — expect success, no Santa popup
npm run dev                     # expect vite dev server on :5173; Ctrl-C after confirming
```

If any step triggers a Santa popup, note which binary path it tried to execute and redirect it into `build/` the same way (that's the generic fix pattern). Rollup's `@rollup/rollup-darwin-arm64` is a `.node` module loaded in-process, not executed — expected to work as-is.

- [ ] **Step 5: Install Playwright browsers into build/ and verify e2e smoke**

```bash
source scripts/santa-env.sh
npx playwright install chromium
busybee -- npm run test:e2e:smoke   # expect PASS
```

- [ ] **Step 6: Document**

Write `docs/fork/santa-toolchain.md`: what Santa blocks, the two scripts, the re-run-after-npm-ci rule, and the "watch the popup, redirect into build/" debugging pattern. Short — half a page.

- [ ] **Step 7: Create the feature branch and commit**

```bash
git checkout -b feat/pro-audio-connectivity
git add scripts/santa-env.sh scripts/santa-setup.sh docs/fork/santa-toolchain.md
git commit -m "chore: add Santa lockdown toolchain setup for this fork"
```

---

## Task 1: AV interface types + "av" port category

Upstream epic Phase 0, item 1. Studio-relevant subset of the spike taxonomy (`docs/research/spike-1927-pro-audio-av-connectivity.md`).

**Files:**
- Modify: `src/lib/types/index.ts:130-160` (InterfaceType union)
- Modify: `src/lib/schemas/index.ts:136-166` (InterfaceTypeSchema)
- Modify: `src/lib/utils/port-utils.ts:9,16-29` (PortCategory, getPortCategory)
- Modify: `src/lib/components/PortTooltip.svelte:17` (TYPE_LABELS map)
- Modify: `src/lib/components/PortIndicators.svelte:56-69` (CATEGORY_COLORS)
- Modify: `src/lib/styles/tokens.css:261-274` (port color token)
- Test: `src/tests/av-interface-types.test.ts`

The 8 new types: `"xlr-3" | "trs-1-4" | "ts-1-4" | "rca" | "adat-optical" | "midi-din" | "bnc" | "db25-audio"`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/av-interface-types.test.ts
import { describe, it, expect } from "vitest";
import { getPortCategory } from "$lib/utils/port-utils";
import { InterfaceTemplateSchema } from "$lib/schemas";

const AV_TYPES = [
  "xlr-3", "trs-1-4", "ts-1-4", "rca",
  "adat-optical", "midi-din", "bnc", "db25-audio",
] as const;

describe("AV interface types", () => {
  it.each(AV_TYPES)("categorizes %s as av", (type) => {
    expect(getPortCategory(type)).toBe("av");
  });

  it("still categorizes network and console types unchanged", () => {
    expect(getPortCategory("1000base-t")).toBe("network");
    expect(getPortCategory("console")).toBe("console");
  });

  it.each(AV_TYPES)("schema accepts an interface template of type %s", (type) => {
    const result = InterfaceTemplateSchema.safeParse({ name: "Mic 1", type });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `busybee -- npm run test:run -- av-interface-types`
Expected: FAIL — schema rejects unknown enum values; getPortCategory returns a non-"av" category.

- [ ] **Step 3: Implement**

In `src/lib/types/index.ts`, extend the `InterfaceType` union before `| "other"`:

```typescript
  // Pro audio / AV (fork; per spike #1927 taxonomy)
  | "xlr-3"         // XLR 3-pin (mic/line/AES3)
  | "trs-1-4"       // 1/4" TRS balanced
  | "ts-1-4"        // 1/4" TS unbalanced
  | "rca"           // RCA/phono (consumer line, S/PDIF)
  | "adat-optical"  // TOSLINK ADAT
  | "midi-din"      // 5-pin DIN MIDI
  | "bnc"           // BNC (word clock, AES3id)
  | "db25-audio"    // DB25 TASCAM analog 8-channel
```

In `src/lib/schemas/index.ts`, add the same 8 string literals to `InterfaceTypeSchema`'s `z.enum([...])`.

In `src/lib/utils/port-utils.ts`:

```typescript
export type PortCategory = "network" | "power" | "console" | "av";

const AV_INTERFACE_TYPES: ReadonlySet<string> = new Set([
  "xlr-3", "trs-1-4", "ts-1-4", "rca",
  "adat-optical", "midi-din", "bnc", "db25-audio",
]);
```

and in `getPortCategory()`, before the existing fallthrough: `if (AV_INTERFACE_TYPES.has(type)) return "av";`

In `PortTooltip.svelte`'s `TYPE_LABELS`:

```typescript
  "xlr-3": "XLR",
  "trs-1-4": '1/4" TRS',
  "ts-1-4": '1/4" TS',
  "rca": "RCA",
  "adat-optical": "ADAT Optical",
  "midi-din": "MIDI (5-pin DIN)",
  "bnc": "BNC",
  "db25-audio": "DB25 (TASCAM)",
```

In `tokens.css` next to the other `--colour-port-*` tokens: `--colour-port-av: var(--dracula-cyan);` (if `--dracula-cyan` doesn't exist in the palette block, use the existing cyan-ish palette token — check neighbors in the file; WCAG AA on dark background required).

In `PortIndicators.svelte`'s `CATEGORY_COLORS`: `av: "var(--colour-port-av)",`

- [ ] **Step 4: Run tests to verify pass**

Run: `busybee -- npm run test:run -- av-interface-types` → PASS, then `npm run check` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib src/tests
git commit -m "feat: add pro-audio interface types and av port category"
```

---

## Task 2: PortDirection field + inferDirection + direction UI

Implements upstream #1930 verbatim (its acceptance criteria are the contract).

**Files:**
- Modify: `src/lib/types/index.ts` (PortDirection type; InterfaceTemplate + PlacedPort fields)
- Modify: `src/lib/schemas/index.ts:302-312,379-390` (both schemas)
- Modify: `src/lib/utils/port-utils.ts:38-49` (inferDirection, instantiatePorts)
- Modify: `src/lib/components/PortIndicators.svelte` (direction arrows)
- Modify: `src/lib/components/PortTooltip.svelte` (direction label)
- Test: `src/tests/port-direction.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/port-direction.test.ts
import { describe, it, expect } from "vitest";
import { inferDirection, instantiatePorts } from "$lib/utils/port-utils";
import { PlacedPortSchema } from "$lib/schemas";
import type { DeviceType } from "$lib/types";

describe("inferDirection", () => {
  it("returns input for mgmt-only ports regardless of type", () => {
    expect(inferDirection("1000base-t", true)).toBe("input");
  });
  it("returns input for console", () => {
    expect(inferDirection("console")).toBe("input");
  });
  it("returns undefined for AV types (explicit direction required)", () => {
    expect(inferDirection("xlr-3")).toBeUndefined();
    expect(inferDirection("adat-optical")).toBeUndefined();
  });
  it("returns bidirectional for network types", () => {
    expect(inferDirection("1000base-t")).toBe("bidirectional");
  });
});

describe("instantiatePorts direction", () => {
  const deviceType = {
    slug: "test-pre", model: "Test Pre", u_height: 1, category: "av-media",
    interfaces: [
      { name: "Mic In", type: "xlr-3", direction: "input" },
      { name: "Eth", type: "1000base-t" },
    ],
  } as unknown as DeviceType;

  it("copies explicit template direction and infers the rest", () => {
    const ports = instantiatePorts(deviceType);
    expect(ports[0].direction).toBe("input");
    expect(ports[1].direction).toBe("bidirectional");
  });
});

describe("backward compatibility", () => {
  it("PlacedPort without direction still validates", () => {
    const result = PlacedPortSchema.safeParse({
      id: "p1", template_name: "1", template_index: 0, type: "1000base-t",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `busybee -- npm run test:run -- port-direction`
Expected: FAIL — `inferDirection` is not exported.

- [ ] **Step 3: Implement the data layer**

`src/lib/types/index.ts`:

```typescript
/** Signal flow direction of a port (AV; network defaults to bidirectional) */
export type PortDirection = "input" | "output" | "bidirectional";
```

Add `direction?: PortDirection;` to both `InterfaceTemplate` and `PlacedPort` (PlacedPort's value is the resolved/overridable one, template's is the default — same pattern as `label`).

`src/lib/schemas/index.ts`:

```typescript
export const PortDirectionSchema = z.enum(["input", "output", "bidirectional"]);
```

Add `direction: PortDirectionSchema.optional(),` to `InterfaceTemplateSchema` and `PlacedPortSchema`.

`src/lib/utils/port-utils.ts`:

```typescript
export function inferDirection(
  type: InterfaceType,
  mgmtOnly?: boolean,
): PortDirection | undefined {
  if (mgmtOnly) return "input";
  if (type === "console") return "input";
  if (AV_INTERFACE_TYPES.has(type)) return undefined; // AV needs explicit direction
  return "bidirectional";
}
```

In `instantiatePorts()`, extend the mapped object with:

```typescript
    direction: iface.direction ?? inferDirection(iface.type, iface.mgmt_only),
```

- [ ] **Step 4: Run tests to verify pass**

Run: `busybee -- npm run test:run -- port-direction` → PASS.

- [ ] **Step 5: Direction UI**

`PortIndicators.svelte`: per the epic's frontend-design comment — input ports get a small inward-pointing chevron beside the port circle, output ports an outward-pointing one, bidirectional/undefined get nothing (identical to today's network-port rendering). Use existing port circle coordinates (`PORT_RADIUS = 3`, `PORT_SPACING = 8`); chevron fill `var(--colour-port-indicator)`.

`PortTooltip.svelte`: below the type line add:

```svelte
{#if port.direction}
  <div class="port-tooltip-type">{port.direction === "input" ? "Input" : port.direction === "output" ? "Output" : "Bidirectional"}</div>
{/if}
```

(Reuse the existing `.port-tooltip-type` class; do not add a test for this — visual-only, per upstream test policy.)

- [ ] **Step 6: Verify visually, run gates, commit**

Run: `npm run dev`, place a 24-port switch, hover ports (tooltip unchanged, no direction noise for bidirectional network ports). Then:

```bash
busybee -- npm run test:run && npm run check && npm run lint
git add -A src/lib src/tests
git commit -m "feat: add PortDirection with inference and direction indicators"
```

---

## Task 3: Audio starter devices

Real gear shapes so the editor is testable by hand and by e2e. Category `av-media` exists already.

**Files:**
- Modify: `src/lib/data/starterLibrary.ts` (after the Network section, ~line 88)
- Test: `src/tests/av-starter-devices.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/av-starter-devices.test.ts
import { describe, it, expect } from "vitest";
import { STARTER_LIBRARY } from "$lib/data/starterLibrary";

// NOTE: check the actual export name at the top of starterLibrary.ts and
// use it here — the array constant holding the starter DeviceTypes.

describe("audio starter devices", () => {
  const bySlug = (slug: string) =>
    STARTER_LIBRARY.find((d) => d.slug === slug);

  it("includes an audio interface with directional AV ports", () => {
    const dev = bySlug("audio-interface");
    expect(dev).toBeDefined();
    const mic = dev!.interfaces!.find((i) => i.name === "Mic/Line 1");
    expect(mic).toMatchObject({ type: "xlr-3", direction: "input" });
    const out = dev!.interfaces!.find((i) => i.name === "Main Out L");
    expect(out).toMatchObject({ type: "trs-1-4", direction: "output" });
  });

  it("includes a patchbay whose ports are explicitly bidirectional", () => {
    const dev = bySlug("patchbay-48");
    expect(dev).toBeDefined();
    expect(dev!.interfaces!.every((i) => i.direction === "bidirectional")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `busybee -- npm run test:run -- av-starter-devices`
Expected: FAIL — devices don't exist. (If the export is named differently, fix the import first; the test must fail on missing *devices*, not missing import.)

- [ ] **Step 3: Implement**

Add to `starterLibrary.ts` (matching the existing entry style; a local helper keeps it readable):

```typescript
// Pro audio (4)
{
  slug: "audio-interface",
  model: "Audio Interface",
  u_height: 1,
  category: "av-media",
  interfaces: [
    ...[1, 2, 3, 4].map((n) => ({
      name: `Mic/Line ${n}`, type: "xlr-3" as const, direction: "input" as const,
    })),
    { name: "Main Out L", type: "trs-1-4" as const, direction: "output" as const },
    { name: "Main Out R", type: "trs-1-4" as const, direction: "output" as const },
    { name: "ADAT In", type: "adat-optical" as const, direction: "input" as const },
    { name: "ADAT Out", type: "adat-optical" as const, direction: "output" as const },
    { name: "Word Clock Out", type: "bnc" as const, direction: "output" as const },
    { name: "MIDI In", type: "midi-din" as const, direction: "input" as const },
    { name: "MIDI Out", type: "midi-din" as const, direction: "output" as const },
  ],
},
{
  slug: "mic-preamp",
  model: "Mic Preamp (2ch)",
  u_height: 1,
  category: "av-media",
  interfaces: [
    { name: "Mic In 1", type: "xlr-3", direction: "input" },
    { name: "Mic In 2", type: "xlr-3", direction: "input" },
    { name: "Line Out 1", type: "xlr-3", direction: "output" },
    { name: "Line Out 2", type: "xlr-3", direction: "output" },
  ],
},
{
  slug: "compressor",
  model: "Compressor (2ch)",
  u_height: 1,
  category: "av-media",
  interfaces: [
    { name: "In 1", type: "trs-1-4", direction: "input" },
    { name: "In 2", type: "trs-1-4", direction: "input" },
    { name: "Out 1", type: "trs-1-4", direction: "output" },
    { name: "Out 2", type: "trs-1-4", direction: "output" },
  ],
},
{
  slug: "patchbay-48",
  model: "Patchbay (48pt)",
  u_height: 1,
  category: "av-media",
  interfaces: Array.from({ length: 48 }, (_, i) => ({
    name: String(i + 1), type: "trs-1-4" as const, direction: "bidirectional" as const,
  })),
},
```

Match the file's actual typing convention — if existing entries don't need `as const`, drop it.

- [ ] **Step 4: Run tests, verify in dev, commit**

Run: `busybee -- npm run test:run -- av-starter-devices` → PASS. `npm run dev`: drag the audio interface into a rack, confirm cyan "av" port dots with direction arrows render (48-port patchbay should use the high-density badge mode automatically).

```bash
git add src/lib/data/starterLibrary.ts src/tests/av-starter-devices.test.ts
git commit -m "feat: add pro-audio starter devices with directional ports"
```

---

## Task 4: Remove the deprecated Cable model

Upstream M5 decision: "Cable model is removed in M5. No migration path — Connection model only."

**Files:**
- Delete: `src/lib/stores/cables.svelte.ts` (+ its test file in `src/tests/`)
- Modify: `src/lib/types/index.ts:399-428` (Cable interface; also `CableType`, `CableStatus`, `LengthUnit` **only if** nothing else references them)
- Modify: `src/lib/schemas/index.ts:427-467,807-809` (CableSchema; `cables:` line in LayoutSchema)
- Modify: `src/lib/stores/layout.svelte.ts`, `src/lib/stores/layout/mutators.ts` (cable delegation + `addCableRaw`/`updateCableRaw`/`removeCableRaw`)
- Modify: `src/lib/utils/yaml.ts`, `src/lib/utils/yaml-field-order.ts` (cable serialization entries)
- Modify: `src/tests/factories.ts` (`createTestCable`) and any tests using it

- [ ] **Step 1: Map the true usage surface**

```bash
rg -n '\bCable\b|\bcables\b|CableSchema|createTestCable' src e2e --glob '!*.svelte' -l
```

**Trap:** `cable-management` is a *device category* string used by `CategoryIcon.svelte`, `CategoryIconSVG.svelte`, `deviceFilters.ts`, `AddDeviceForm.svelte` — those hits are NOT the Cable model. Do not touch the category.

- [ ] **Step 2: Delete the model, store, schema, factories, serialization entries**

Remove in dependency order: tests → store → facade delegation → mutators → schema (`CableSchema` and the `cables: z.array(CableSchema).optional()` line in LayoutSchema) → types. Keep `LengthUnit` if `rg -n 'LengthUnit' src` shows non-cable users (weight/depth code); otherwise remove.

Loading behavior after removal: LayoutSchema uses `.passthrough()`, so an old YAML with a `cables:` key still loads — the key is preserved as unknown data and ignored. No silent data corruption, no crash. Add one test:

```typescript
// append to src/tests/layout-store.test.ts (or a new src/tests/cable-removal.test.ts)
it("loads a layout containing a legacy cables array without error", () => {
  const legacy = {
    ...minimalValidLayout(),          // use the existing factory/fixture helper
    cables: [{ id: "c1", a_device_id: "d1", a_interface: "1", b_device_id: "d2", b_interface: "2" }],
  };
  const result = LayoutSchema.safeParse(legacy);
  expect(result.success).toBe(true);
});
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `busybee -- npm run test:run && npm run check`
Expected: PASS with zero references to the removed symbols. `rg -n 'CableSchema|createTestCable|addCableRaw' src` returns nothing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove deprecated Cable model in favor of Connection"
```

---

## Task 5: Connection store with validation + undo/redo

Implements upstream #369 — its API block is the contract. State lives in `layout.connections` (already in LayoutSchema line 807; verify the `Layout` TS interface has `connections?: Connection[]` and add it if missing).

**Files:**
- Create: `src/lib/stores/connection.svelte.ts`
- Create: `src/lib/stores/commands/connection.ts`
- Create: `src/lib/stores/layout/recorded-connection-actions.ts`
- Modify: `src/lib/stores/layout/mutators.ts` (raw fns)
- Modify: `src/lib/stores/commands/types.ts:11-36` (add `ADD_CONNECTION`, `UPDATE_CONNECTION`, `REMOVE_CONNECTION` to CommandType)
- Modify: `src/lib/stores/layout.svelte.ts` (facade wiring)
- Test: `src/tests/connection-store.test.ts`

- [ ] **Step 1: Write the failing tests (the behavioral contract)**

```typescript
// src/tests/connection-store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getConnectionStore, resetConnectionStore } from "$lib/stores/connection.svelte";
import { createTestDeviceType } from "./factories";

// Helper: place two devices with AV ports, return their PlacedPorts.
// Uses the layout store's real placement path so PlacedPort UUIDs exist.
function placeTwoAvDevices() {
  const layout = getLayoutStore();
  // createTestDeviceType must accept an interfaces override — extend the
  // factory if it doesn't yet (same optional-field pattern as existing overrides).
  const pre = createTestDeviceType({
    slug: "pre", interfaces: [{ name: "Out L", type: "xlr-3", direction: "output" }],
  });
  const comp = createTestDeviceType({
    slug: "comp", interfaces: [
      { name: "In 1", type: "trs-1-4", direction: "input" },
      { name: "In 2", type: "trs-1-4", direction: "input" },
    ],
  });
  // Follow the placement call pattern used in existing layout-store tests
  // (addRack + placeDevice); return the placed devices' ports.
  /* ... returns { outPort, inPort1, inPort2, preDeviceId, compDeviceId } */
}

describe("Connection store", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetConnectionStore();
  });

  it("addConnection creates a connection between two ports", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const store = getConnectionStore();
    const result = store.addConnection({ a_port_id: outPort.id, b_port_id: inPort1.id });
    expect("connection" in result).toBe(true);
    expect(store.getConnectionsForPort(outPort.id)).toHaveLength(1);
  });

  it("rejects connecting a port to itself", () => {
    const { outPort } = placeTwoAvDevices();
    const result = getConnectionStore().addConnection({ a_port_id: outPort.id, b_port_id: outPort.id });
    expect("errors" in result).toBe(true);
  });

  it("rejects a second connection on an already-connected port", () => {
    const { outPort, inPort1, inPort2 } = placeTwoAvDevices();
    const store = getConnectionStore();
    store.addConnection({ a_port_id: outPort.id, b_port_id: inPort1.id });
    const result = store.addConnection({ a_port_id: outPort.id, b_port_id: inPort2.id });
    expect("errors" in result).toBe(true);
  });

  it("rejects duplicates in either direction", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const store = getConnectionStore();
    store.addConnection({ a_port_id: outPort.id, b_port_id: inPort1.id });
    const result = store.addConnection({ a_port_id: inPort1.id, b_port_id: outPort.id });
    expect("errors" in result).toBe(true);
  });

  it("warns (but allows) output→output connections", () => {
    // place two output ports; addConnection succeeds and result carries warnings
  });

  it("warns (but allows) cross-category connections (av to network)", () => {
    // xlr-3 to 1000base-t: succeeds with a warning, per no-silent-anything
  });

  it("rejects connections referencing a non-existent port (loud, not silent)", () => {
    const store = getConnectionStore();
    const result = store.addConnection({ a_port_id: "ghost-a", b_port_id: "ghost-b" });
    expect("errors" in result).toBe(true);
  });

  it("supports undo/redo through the history", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const layout = getLayoutStore();
    layout.addConnectionRecorded({ a_port_id: outPort.id, b_port_id: inPort1.id });
    expect(getConnectionStore().connections).toHaveLength(1);
    layout.undo();
    expect(getConnectionStore().connections).toHaveLength(0);
    layout.redo();
    expect(getConnectionStore().connections).toHaveLength(1);
  });
});
```

Note on `toHaveLength`: upstream's ESLint blocks *literal* length assertions on data arrays; assertions on behavior-driven counts like these are the established pattern in `layout-store.test.ts` — mirror how that file phrases them if the lint rule complains (e.g. compare before/after counts).

- [ ] **Step 2: Run tests to verify they fail**

Run: `busybee -- npm run test:run -- connection-store`
Expected: FAIL — module `$lib/stores/connection.svelte` does not exist.

- [ ] **Step 3: Implement the store**

`src/lib/stores/connection.svelte.ts` — follow `cables.svelte.ts` (the file you deleted in Task 4 — it's in git history: `git show HEAD~1:src/lib/stores/cables.svelte.ts`) as the structural template, with the #369 API:

Key pieces:

```typescript
import { generateId } from "$lib/utils/id";          // match actual util path used by cables store
import { getPortCategory } from "$lib/utils/port-utils";
import type { Connection, PlacedPort } from "$lib/types";

export interface CreateConnectionInput {
  a_port_id: string;
  b_port_id: string;
  label?: string;
  color?: string;
}

export interface ConnectionValidation {
  errors: string[];
  warnings: string[];
}

export function validateConnection(
  input: CreateConnectionInput,
  existing: Connection[],
  resolvePort: (id: string) => { port: PlacedPort; deviceId: string } | undefined,
): ConnectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (input.a_port_id === input.b_port_id) errors.push("Cannot connect a port to itself");
  const a = resolvePort(input.a_port_id);
  const b = resolvePort(input.b_port_id);
  if (!a) errors.push(`Port not found: ${input.a_port_id}`);
  if (!b) errors.push(`Port not found: ${input.b_port_id}`);
  if (a && b) {
    for (const c of existing) {
      const ports = [c.a_port_id, c.b_port_id];
      if (ports.includes(input.a_port_id) || ports.includes(input.b_port_id)) {
        const isDuplicate =
          ports.includes(input.a_port_id) && ports.includes(input.b_port_id);
        errors.push(isDuplicate ? "These ports are already connected" : "Port already has a connection");
        break;
      }
    }
    if (a.port.direction === "output" && b.port.direction === "output")
      warnings.push("Both ports are outputs");
    if (a.port.direction === "input" && b.port.direction === "input")
      warnings.push("Both ports are inputs");
    if (getPortCategory(a.port.type) !== getPortCategory(b.port.type))
      warnings.push(`Connecting ${a.port.type} to ${b.port.type} (different categories)`);
  }
  return { errors, warnings };
}
```

The store factory mirrors the cable store: getters (`connections`, `getConnection`, `getConnectionsForPort`, `getConnectionsForDevice`), CRUD returning `{ connection, warnings } | { errors }`, raw ops for undo, `removeConnectionsForDevice`. Port resolution walks `layout.racks[].devices[].ports[]` (build a Map per call or a `$derived` index — measure only if slow; no premature caching).

`mutators.ts` raw fns (same style as the removed cable raws):

```typescript
export function addConnectionRaw(access: LayoutStateAccess, connection: Connection): void {
  const layout = access.getLayout();
  layout.connections = [...(layout.connections ?? []), connection];
  access.markDirty();
}
export function removeConnectionRaw(access: LayoutStateAccess, id: string): Connection | undefined { /* filter + return removed */ }
export function updateConnectionRaw(access: LayoutStateAccess, id: string, updates: Partial<Connection>): void { /* map-replace */ }
```

`commands/connection.ts` — mirror `createPlaceDeviceCommand` (`commands/device.ts:102-133`):

```typescript
export function createAddConnectionCommand(connection: Connection, store: ConnectionCommandStore): Command {
  return {
    type: "ADD_CONNECTION",
    description: "Add connection",
    timestamp: Date.now(),
    execute() { store.addConnectionRaw(connection); },
    undo() { store.removeConnectionRaw(connection.id); },
  };
}
// createRemoveConnectionCommand: execute removes (capturing the removed object), undo re-adds it
// createUpdateConnectionCommand: capture previous field values for undo
```

`recorded-connection-actions.ts` + facade: `addConnectionRecorded(input)` validates via the store, constructs the `Connection` with `generateId()`, wraps in the command, `history.execute(command)`. Export through `layout.svelte.ts` like the other recorded actions.

- [ ] **Step 4: Run tests to verify pass**

Run: `busybee -- npm run test:run -- connection-store` → PASS. Then full suite + `npm run check`.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib src/tests
git commit -m "feat: add Connection store with validation and undo/redo"
```

---

## Task 6: Cascade-delete connections on device removal

Implements upstream #639: removing a device removes connections referencing its ports; undo restores both.

**Files:**
- Modify: `src/lib/stores/layout/recorded-device-actions.ts` (removal path)
- Modify: `src/lib/stores/commands/device.ts` (or compose via BATCH — see below)
- Test: `src/tests/connection-cascade.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/connection-cascade.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getConnectionStore, resetConnectionStore } from "$lib/stores/connection.svelte";

describe("connection cascade on device removal", () => {
  beforeEach(() => { resetLayoutStore(); resetConnectionStore(); });

  it("removing a device removes its connections; undo restores both", () => {
    // reuse the placeTwoAvDevices() helper — extract it into src/tests/factories.ts
    const { outPort, inPort1, compDeviceId } = placeTwoAvDevices();
    const layout = getLayoutStore();
    layout.addConnectionRecorded({ a_port_id: outPort.id, b_port_id: inPort1.id });

    layout.removeDeviceRecorded(/* args per existing removal API */ compDeviceId);
    expect(getConnectionStore().connections).toHaveLength(0);

    layout.undo(); // device AND its connection come back atomically
    expect(getConnectionStore().connections).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `busybee -- npm run test:run -- connection-cascade`
Expected: FAIL — connection survives device removal (orphaned reference).

- [ ] **Step 3: Implement**

The clean composition: in the recorded device-removal action, before executing the remove-device command, collect `affected = connections referencing any of device.ports[].id`. If non-empty, execute a `BATCH` command (CommandType `BATCH` already exists) containing `createRemoveConnectionCommand(...)` for each affected connection followed by the device removal command — undo of the batch restores device then connections in reverse order. Log the cascade loudly: `console.warn(\`Removed ${affected.length} connection(s) attached to removed device\`)` (per #639 acceptance criteria).

- [ ] **Step 4: Run tests to verify pass, commit**

```bash
busybee -- npm run test:run && npm run check
git add -A src/lib src/tests
git commit -m "feat: cascade-delete connections when a device is removed"
```

---

## Task 7: ConnectionLayer + ConnectionPath rendering

Implements upstream #1931. Same-rack connections only (multi-rack is deferred, per spec).

**Files:**
- Create: `src/lib/utils/port-layout.ts` (extracted shared layout math)
- Create: `src/lib/utils/connection-geometry.ts`
- Create: `src/lib/components/ConnectionLayer.svelte`
- Create: `src/lib/components/ConnectionPath.svelte`
- Modify: `src/lib/components/PortIndicators.svelte` (use extracted layout fn)
- Modify: `src/lib/components/Rack.svelte:468-532` (add layer after devices)
- Test: `src/tests/connection-geometry.test.ts`
- Reference (read first, do not import): `docs/research/connection-routing.ts` — the external-channel cubic-bezier algorithm from spike #262

- [ ] **Step 1: Extract port layout math into a pure function**

Move the port-position computation out of `PortIndicators.svelte` into `src/lib/utils/port-layout.ts` so indicators and cable endpoints can never disagree:

```typescript
export interface PortPoint { x: number; y: number; index: number }

/** Pure layout: where each port circle sits in device-local SVG coords.
 *  Must produce exactly what PortIndicators renders today
 *  (PORT_RADIUS=3, PORT_SPACING=8, PORT_Y_OFFSET=8, HIGH_DENSITY_THRESHOLD=24). */
export function computePortLayout(
  portCount: number,
  deviceWidth: number,
  deviceHeight: number,
): PortPoint[] { /* lifted verbatim from PortIndicators.svelte */ }
```

Refactor `PortIndicators.svelte` to consume it. Run the full suite — this is a pure refactor; everything stays green.

- [ ] **Step 2: Write the failing geometry test**

```typescript
// src/tests/connection-geometry.test.ts
import { describe, it, expect } from "vitest";
import { getPortAnchor, buildConnectionPath } from "$lib/utils/connection-geometry";

describe("connection geometry", () => {
  it("anchors a port at the device position plus port-layout offset", () => {
    // device at U10 in a 12U rack, 1U high: y = (12 - 10 - 1 + 1) * 22 = 44  (RackDevice.svelte:254)
    const anchor = getPortAnchor({
      rackHeight: 12, positionHuman: 10, uHeight: 22,
      deviceUHeight: 1, deviceWidth: 186, portIndex: 0, portCount: 4,
    });
    expect(anchor.y).toBeGreaterThan(44);      // inside the device band
    expect(anchor.y).toBeLessThan(44 + 22);
  });

  it("builds a cubic bezier path string routed through the side channel", () => {
    const d = buildConnectionPath({ x: 100, y: 44 }, { x: 100, y: 110 }, { channelX: 210 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("C");                   // cubic bezier, per spike #262
  });

  it("gives distinct channel offsets to overlapping connections", () => {
    // two connections spanning the same U range must not produce identical paths
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then implement geometry**

Run: `busybee -- npm run test:run -- connection-geometry` → FAIL (module missing).

Implement `connection-geometry.ts`: `getPortAnchor()` composes the device-Y formula (`(rackHeight - positionHuman - deviceUHeight + 1) * uHeight`, from `RackDevice.svelte:254`) with `computePortLayout()`. `buildConnectionPath()` adapts the external-channel algorithm from `docs/research/connection-routing.ts`: cables exit toward the near rail, run vertically in a channel just outside it (`channelX` ≈ rack width + small offset), with per-connection lane offsets to avoid overlap. Rerun → PASS.

- [ ] **Step 4: Components**

`ConnectionPath.svelte` (props: `connection`, `aAnchor`, `bAnchor`, `channelX`, `highlighted`): renders `<path d={...} fill="none" stroke={connection.color ?? "var(--colour-port-default)"} stroke-width={highlighted ? 3 : 1.5}>`. Direction arrows per the epic's frontend-design spec: an **8px SVG `<marker>` defined in `<defs>`** placed at the path midpoint pointing output→input; mixed pairs (one directional port, one bidirectional) get a single arrow from the output side; both-bidirectional renders a plain line; the marker inherits the connection's stroke color. Direction is computed from the ports at render time — no data model involvement. `onmouseenter/onmouseleave` set a `hoveredConnectionId` in the connection store; hover also shows `connection.label` via `<title>`.

`ConnectionLayer.svelte` (props: `rackId`, `rackHeight`, `uHeight`, `rackWidth`): `$derived` over the connection store — resolve each connection's two ports to placed devices **in this rack** (skip others), compute anchors, render `<g class="connection-layer">` of ConnectionPaths. Reactivity gives "connections follow devices when dragged" for free — verify, don't build anything special.

In `Rack.svelte`, after the devices `<g>` (line ~530), same transform group:

```svelte
<g transform="translate(0, {RACK_PADDING + RAIL_WIDTH})">
  <ConnectionLayer {rackId} rackHeight={rack.u_height} uHeight={U_HEIGHT_PX} rackWidth={rackWidth} />
</g>
```

(Match the actual prop names/transform used by the devices layer directly above it.)

- [ ] **Step 5: Verify visually and by suite, commit**

`npm run dev`: place preamp + compressor, hand-create a connection in the console via the store (creation UI is next task), confirm a bezier cable renders and follows the device when dragged. Then:

```bash
busybee -- npm run test:run && npm run check && npm run lint
git add -A src/lib src/tests
git commit -m "feat: render connections as routed SVG paths in the rack view"
```

---

## Task 8: Click-port-to-port connection creation

**Files:**
- Create: `src/lib/stores/pending-connection.svelte.ts`
- Modify: `src/lib/components/RackDevice.svelte:831-839` (onPortClick handler body)
- Modify: `src/lib/components/PortIndicators.svelte` (pending-source highlight ring)
- Modify: `src/lib/components/Canvas.svelte:334-403` (Escape + empty-canvas click cancel)
- Test: `src/tests/pending-connection.test.ts`, `e2e/connections.spec.ts`

- [ ] **Step 1: Write the failing store test**

```typescript
// src/tests/pending-connection.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getPendingConnectionStore, resetPendingConnectionStore } from "$lib/stores/pending-connection.svelte";
import { getConnectionStore, resetConnectionStore } from "$lib/stores/connection.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";

describe("pending connection workflow", () => {
  beforeEach(() => { resetLayoutStore(); resetConnectionStore(); resetPendingConnectionStore(); });

  it("first port click arms, second click creates the connection", () => {
    const { outPort, inPort1 } = placeTwoAvDevices();
    const pending = getPendingConnectionStore();
    pending.clickPort(outPort.id);
    expect(pending.sourcePortId).toBe(outPort.id);
    pending.clickPort(inPort1.id);
    expect(pending.sourcePortId).toBeNull();
    expect(getConnectionStore().getConnectionsForPort(inPort1.id)).toHaveLength(1);
  });

  it("clicking the armed port again disarms without creating", () => { /* toggle-off */ });
  it("cancel() disarms", () => { /* Escape path */ });
  it("failed validation keeps the source armed and surfaces errors", () => {
    // click armed port, then click an already-connected port: errors exposed
    // on the store (for a toast), source stays armed so the user can retry
  });
});
```

- [ ] **Step 2: Run to verify fail, implement the store**

Run: `busybee -- npm run test:run -- pending-connection` → FAIL.

`pending-connection.svelte.ts`: `$state` for `sourcePortId: string | null` and `lastErrors: string[]`; `clickPort(portId)` arms / disarms / completes via `layout.addConnectionRecorded(...)`; `cancel()`. On successful creation surface warnings through the existing toast store (find it via `rg -l "toast" src/lib/stores`) — warnings are shown, never swallowed.

- [ ] **Step 3: Wire the UI**

`RackDevice.svelte`: the existing `onPortClick` prop receives an `InterfaceTemplate` — resolve it to the `PlacedPort` via the placed device's `ports` array matched on `template_index` (the placed device is available where RackDevice is instantiated; check how `Rack.svelte` passes device data and follow that path), then call `pendingConnectionStore.clickPort(port.id)`.

`PortIndicators.svelte`: render a highlight ring (`stroke: var(--colour-port-hover)`) around the port whose `PlacedPort.id === pending.sourcePortId`.

`Canvas.svelte`: in the existing Escape handler call `pending.cancel()`; in the empty-canvas click handler (`isEmptyCanvasClickTarget`, `canvas-coordinates.ts`) also cancel.

- [ ] **Step 4: e2e test**

```typescript
// e2e/connections.spec.ts
import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack, locators } from "./helpers";

test.describe("Connections", () => {
  test("clicking two ports creates a visible cable", async ({ page }) => {
    await gotoWithRack(page);
    await dragDeviceToRack(page, { deviceName: "Mic Preamp (2ch)" });
    await dragDeviceToRack(page, { deviceName: "Compressor (2ch)" });
    // Port circles are SVG click targets inside the device group; add a
    // data-testid or aria-label to the port hit area in PortIndicators if
    // the existing locators can't address individual ports.
    await page.locator('[data-port-name="Line Out 1"]').click();
    await page.locator('[data-port-name="In 1"]').click();
    await expect(page.locator(".connection-layer path").first()).toBeVisible();
  });
});
```

Run: `busybee -- npm run test:e2e:dev -- connections` (dev config; the full config builds first).

- [ ] **Step 5: Full gates, commit**

```bash
busybee -- npm run test:run && npm run check && npm run lint
git add -A src e2e
git commit -m "feat: click-port-to-port connection creation with cancel and errors"
```

---

## Task 9: Signal types on ports, with inference, tooltip display, colors, and mismatch warning

Per the epic's 2026-06-06 review comments (which supersede the older issue bodies): `signal_type` lives on **InterfaceTemplate and PlacedPort** (their P0), the utility is `inferSignalType(type, direction)`, and PortTooltip shows explicit values normally / inferred values as *"inferred: X"* in italics. **One flagged fork deviation:** we also add an optional `signal_type` override on `Connection` so the Connections panel can label a specific cable without editing ports — additive optional field, cheap to rebase away if upstream models it differently.

**Files:**
- Modify: `src/lib/types/index.ts` (SignalType; `signal_type?` on InterfaceTemplate, PlacedPort, Connection)
- Modify: `src/lib/schemas/index.ts` (SignalTypeSchema; the three optional fields — enum-validated on import per the security comment)
- Modify: `src/lib/utils/port-utils.ts` (inferSignalType, getConnectionSignalType; instantiatePorts copies template value)
- Modify: `src/lib/components/PortTooltip.svelte` (signal line with inferred-italics)
- Modify: `src/lib/styles/tokens.css` (signal color tokens)
- Modify: `src/lib/components/ConnectionPath.svelte` (color precedence)
- Modify: `src/lib/stores/connection.svelte.ts` (mismatch warning)
- Test: `src/tests/signal-type.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/signal-type.test.ts
import { describe, it, expect } from "vitest";
import { inferSignalType, getConnectionSignalType } from "$lib/utils/port-utils";
import type { Connection, PlacedPort } from "$lib/types";

describe("inferSignalType", () => {
  it("maps unambiguous connectors directly", () => {
    expect(inferSignalType("adat-optical")).toBe("digital-audio-adat");
    expect(inferSignalType("midi-din")).toBe("control-midi");
    expect(inferSignalType("bnc")).toBe("clock-word");
    expect(inferSignalType("usb-c")).toBe("data-usb");
  });
  it("uses direction to split XLR into mic-in vs line-out", () => {
    expect(inferSignalType("xlr-3", "input")).toBe("analog-audio-mic");
    expect(inferSignalType("xlr-3", "output")).toBe("analog-audio-line");
    expect(inferSignalType("xlr-3")).toBe("analog-audio-line");
  });
  it("defaults other analog connectors to line level", () => {
    expect(inferSignalType("trs-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("ts-1-4")).toBe("analog-audio-line");
    expect(inferSignalType("rca")).toBe("analog-audio-line");
    expect(inferSignalType("db25-audio")).toBe("analog-audio-line");
  });
  it("returns undefined for network types (ethernet is implied, not stored)", () => {
    expect(inferSignalType("1000base-t")).toBeUndefined();
  });
});

describe("getConnectionSignalType precedence", () => {
  const port = (over: Partial<PlacedPort>): PlacedPort =>
    ({ id: "p", template_name: "1", template_index: 0, type: "trs-1-4", ...over }) as PlacedPort;
  const conn = (over: Partial<Connection>): Connection =>
    ({ id: "c", a_port_id: "a", b_port_id: "b", ...over }) as Connection;

  it("connection override wins over everything", () => {
    expect(
      getConnectionSignalType(conn({ signal_type: "clock-word" }), port({ signal_type: "analog-audio-mic" }), port({})),
    ).toBe("clock-word");
  });
  it("explicit port signal beats inference", () => {
    expect(
      getConnectionSignalType(conn({}), port({ signal_type: "digital-audio-spdif", type: "rca" }), port({ type: "rca" })),
    ).toBe("digital-audio-spdif");
  });
  it("falls back to inference from the a-side port", () => {
    expect(getConnectionSignalType(conn({}), port({ type: "adat-optical" }), port({ type: "adat-optical" }))).toBe("digital-audio-adat");
  });
});
```

Plus a connection-store case: connecting an `adat-optical` port to a `bnc` port succeeds **with** a signal-mismatch warning. (Note: upstream's review deferred compatibility checks to P3 because creation didn't exist yet; we ship creation in the same branch, so a minimal two-port compare is not premature — conscious, flagged deviation, warn-only.)

- [ ] **Step 2: Run to verify fail, implement**

Run: `busybee -- npm run test:run -- signal-type` → FAIL (exports missing).

`types/index.ts` — upstream decision #8's ten values plus three studio additions (additive; keep their exact names):

```typescript
/** What a port/cable carries — independent of connector type (spike #1927, epic decision #8) */
export type SignalType =
  // Upstream Phase-1 set
  | "ethernet" | "power-ac"
  | "analog-audio-mic" | "analog-audio-line" | "analog-audio-speaker"
  | "digital-audio-aes3"
  | "digital-video-hdmi" | "digital-video-sdi"
  | "control-midi" | "data-usb"
  // Fork additions (studio needs; additive)
  | "digital-audio-adat" | "digital-audio-spdif" | "clock-word";
```

Add `signal_type?: SignalType;` to `InterfaceTemplate`, `PlacedPort`, and `Connection`. In schemas: `SignalTypeSchema = z.enum([...])` and the optional field on all three object schemas.

`port-utils.ts`:

```typescript
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
      return "data-usb";
    default:
      return undefined;
  }
}

/** Effective signal of a cable: connection override → explicit port value → inference. */
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
```

`instantiatePorts()`: copy `signal_type: iface.signal_type` (explicit template values only — inferred values are computed at read time so a later direction edit stays consistent; "compute, don't store", same spirit as upstream's gender decision).

`PortTooltip.svelte`: add a signal line — explicit `port.signal_type` renders as the primary label; otherwise, if `inferSignalType(port.type, port.direction)` returns a value, render it italic as `inferred: <label>`. Add a `SIGNAL_LABELS` map next to `TYPE_LABELS` (e.g. `"analog-audio-mic": "Mic level"`, `"digital-audio-adat": "ADAT"`, `"control-midi": "MIDI"`, `"clock-word": "Word clock"`).

`connection.svelte.ts` validation: warn when both ports' effective signals (explicit ?? inferred) exist and differ.

`tokens.css` — color by signal family (verify palette token names against the file):

```css
--colour-signal-analog: var(--emerald-500);
--colour-signal-digital-audio: var(--blue-500);
--colour-signal-video: var(--purple-500);
--colour-signal-midi: var(--pink-500);
--colour-signal-clock: var(--neutral-400);
--colour-signal-data: var(--amber-500);
--colour-signal-other: var(--neutral-500);
```

`ConnectionPath.svelte` color precedence: `connection.color` (explicit user choice) → family token of `getConnectionSignalType(...)` (`analog-audio-*` → analog, `digital-audio-*` → digital-audio, `digital-video-*` → video, `control-midi` → midi, `clock-word` → clock, `data-usb`/`ethernet` → data) → `var(--colour-port-default)`.

- [ ] **Step 3: Run gates, commit**

```bash
busybee -- npm run test:run && npm run check
git add -A src/lib src/tests
git commit -m "feat: add port-level signal types with inference and color-coded cables"
```

---

## Task 10: Connection filter store + Connections panel

The interactive list (design view C): filterable table, hover highlights the cable, inline edit, delete.

**Files:**
- Create: `src/lib/stores/connection-filters.svelte.ts`
- Create: `src/lib/components/ConnectionsPanel.svelte`
- Modify: the left sidebar tabs component (find via `rg -ln "Layouts" src/lib/components` — the tab strip rendering Layouts/Racks/Devices) to add a "Connections" tab
- Test: `src/tests/connection-filters.test.ts`

- [ ] **Step 1: Write the failing filter test**

```typescript
// src/tests/connection-filters.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getConnectionFilterStore, resetConnectionFilterStore, filterConnections } from "$lib/stores/connection-filters.svelte";

describe("connection filters", () => {
  beforeEach(() => resetConnectionFilterStore());

  const rows = [
    { id: "c1", signal_type: "digital-audio-adat", aDeviceName: "Interface", bDeviceName: "Converter", label: "" },
    { id: "c2", signal_type: "analog-audio-line", aDeviceName: "Preamp", bDeviceName: "Compressor", label: "vox chain" },
  ];

  it("passes everything with no active filters", () => {
    expect(filterConnections(rows, getConnectionFilterStore().state)).toHaveLength(2);
  });
  it("filters by signal type", () => {
    const store = getConnectionFilterStore();
    store.toggleSignalType("digital-audio-adat");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual(["c1"]);
  });
  it("filters by free-text across device names and label", () => {
    const store = getConnectionFilterStore();
    store.setSearch("vox");
    expect(filterConnections(rows, store.state).map((r) => r.id)).toEqual(["c2"]);
  });
});
```

- [ ] **Step 2: Run to verify fail, implement store**

`connection-filters.svelte.ts`: `$state` — `signalTypes: Set<SignalType>` (empty = all), `rackIds: Set<string>` (empty = all), `search: string`. `filterConnections(rows, state)` is a pure exported function (testable without components). Rerun → PASS.

- [ ] **Step 3: Build the panel**

`ConnectionsPanel.svelte`: a `$derived` row model joining connections → ports → devices → racks (device name, port label/name, connector type, effective signal via `getConnectionSignalType()`, rack). Renders: filter controls (signal-type chips, rack select, search input), then a table of rows. Interactions:
- Row hover → set `hoveredConnectionId` on the connection store (ConnectionPath thickens — same mechanism as path hover, now bidirectional).
- Inline `<select>` for signal and text input for label → `layout.updateConnectionRecorded(id, {...})` — the select writes the `Connection.signal_type` override (the fork-added field from Task 9), leaving port-level values untouched.
- Delete button per row → `layout.removeConnectionRecorded(id)`.
- Rows with unresolvable ports (should be impossible post-cascade, but YAML edits happen) render with a loud "missing port" error style — never silently hidden.

Add the tab: follow exactly how the existing Layouts/Racks/Devices tabs register (same component, same aria pattern). No unit tests for panel rendering (upstream policy); behavior is covered by the row-model join, which lives in the panel as a small exported pure function — test that if it grows logic beyond a mechanical join.

- [ ] **Step 4: e2e extension**

Append to `e2e/connections.spec.ts`: after creating a connection, open the Connections tab, expect one row containing "Mic Preamp"; type nonsense into the search box, expect an empty-state message (add one: "No connections match the filters").

- [ ] **Step 5: Gates, commit**

```bash
busybee -- npm run test:run && npm run check && npm run lint && busybee -- npm run test:e2e:dev -- connections
git add -A src e2e
git commit -m "feat: add filterable Connections panel with inline editing"
```

---

## Task 11: Apply filters to the cable overlay

**Files:**
- Modify: `src/lib/components/ConnectionLayer.svelte`
- Test: extend `src/tests/connection-filters.test.ts`

- [ ] **Step 1: Failing test** — `filterConnections` already covers the pure logic; add one integration-level test asserting `ConnectionLayer`'s row-selection derivation respects the filter store (extract that derivation as an exported pure function `visibleConnectionsForRack(connections, filterState, rackId, resolvePort)` in `connection-geometry.ts` and test it directly).

- [ ] **Step 2: Implement** — ConnectionLayer consumes the filter store via that function; filtered-out connections are not rendered (hidden, not dimmed — one behavior, no options). The Connections tab and the overlay now always agree because they share `filterConnections`.

- [ ] **Step 3: Gates, commit**

```bash
busybee -- npm run test:run && npm run check
git add -A src/lib src/tests
git commit -m "feat: apply shared connection filters to the cable overlay"
```

---

## Task 12: CSV patch-list export

**Files:**
- Create: `src/lib/utils/export/patch-list.ts`
- Modify: `src/lib/components/ConnectionsPanel.svelte` (Export CSV button)
- Test: `src/tests/patch-list-export.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/tests/patch-list-export.test.ts
import { describe, it, expect } from "vitest";
import { buildPatchListCsv } from "$lib/utils/export/patch-list";

describe("patch list CSV", () => {
  it("emits header plus one row per connection", () => {
    const csv = buildPatchListCsv([
      { aDevice: "Preamp", aPort: "Line Out 1", bDevice: "Compressor", bPort: "In 1",
        type: "trs-1-4", signal: "analog-audio-line", label: "vox chain" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("From Device,From Port,To Device,To Port,Connector,Signal,Label");
    expect(lines[1]).toContain("Preamp");
  });

  it("escapes fields per the existing CSV escaping rules", () => {
    // Reuse upstream's formula-injection-safe CSV escaping (see the existing
    // CSV export util — rg -l "csv" src/lib/utils — upstream fixed #2200/#2229
    // there; import the same escape helper, do not write a new one).
    const csv = buildPatchListCsv([
      { aDevice: '=HYPERLINK("x")', aPort: "a,b", bDevice: 'say "hi"', bPort: "1",
        type: "xlr-3", signal: "analog-audio-line", label: "" },
    ]);
    expect(csv).not.toContain('\n=');   // formula injection neutralized
  });
});
```

- [ ] **Step 2: Run to verify fail, implement** — `buildPatchListCsv(rows)` is pure; the panel button feeds it the **currently filtered** rows and triggers download following the existing object-URL download pattern (see the YAML download code path — revoke the URL only after the click completes, per upstream fix #2934).

- [ ] **Step 3: Gates, commit**

```bash
busybee -- npm run test:run && npm run check
git add -A src/lib src/tests
git commit -m "feat: export filtered connection list as CSV patch sheet"
```

---

## Final verification

- [ ] Full gates, exactly what CI runs:

```bash
source scripts/santa-env.sh
busybee -- npm run test:run
npm run check
npm run lint
npm run format:check
busybee -- npm run build
busybee -- npm run test:e2e:smoke
```

- [ ] Manual pass in `npm run dev`: build a small studio rack (interface, preamp, compressor, patchbay), patch preamp→compressor→interface + an ADAT run, confirm: colored cables with direction arrows, hover highlighting both ways, filters hiding/showing runs, CSV export contents, undo/redo through the whole session, YAML save → reload → connections intact.
- [ ] `git fetch upstream && git log --oneline upstream/main -10` — note (don't act on) any upstream cabling work that landed while we built; flag overlap to the user.

## Upstreaming strategy (read before committing anything)

Develop on `feat/pro-audio-connectivity`; upstream PRs are manufactured later by cherry-picking task commits onto clean branches cut from `upstream/main` (`up/<issue>-<slug>`). This only works if the commit-hygiene invariant holds:

- **Fork-only commits** touch only `scripts/santa-*.sh`, `docs/fork/`, `docs/superpowers/`. Never mix these paths into a feature commit.
- **Feature commits** touch only `src/`, `src/tests/`, `e2e/`. One task = one commit (as the task steps already enforce) so each maps to one upstream issue-sized PR.
- **Upstream-only when engaged, in dependency order:** #1930 first (no deps, cheapest receptivity test), then #369, then #1931/#639. Never PR a task whose dependencies haven't landed upstream.
- **Stays fork-only:** Santa toolchain, spec/plan docs, `Connection.signal_type` override, the warn-only mismatch check (upstream deferred to P3), ConnectionsPanel + filters + CSV (not in their M5).
- **Trailers:** fork commits carry no AI co-author trailer (user rule). If a commit is cherry-picked for an upstream PR, amend the trailer on at that point, per the user's per-PR decision — upstream's CONTRIBUTING requests it.

## Explicitly deferred (do not build)

Signal-flow graph tab, product-photo→SVG faceplates, patch-bay normalling, external endpoints, multi-rack cables, matrix routing, upstream PRs, mobile connection workflow, export of cables into PNG/PDF/SVG exports (`src/lib/utils/export/svg.ts` has its own render path — overlay cables will NOT appear in exports; this is a known, accepted gap for this phase — the CSV patch list is the printable artifact).
