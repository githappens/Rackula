# Pro-Audio Connectivity Fork — Design

**Date:** 2026-07-19 **Status:** Approved (pending user spec review) **Fork of:** [RackulaLives/Rackula](https://github.com/RackulaLives/Rackula) at `8ad48170`

## Context and goal

A personal tool for planning a music studio 19" rack: physical layout plus cable connections. Single user, local-first — browser persistence and YAML export, no accounts, no server.

Rather than building from scratch (evaluated against stagerack.com as the reference feature set), this project forks Rackula, which already provides the rack editor (EIA-310 drag-and-drop, front/rear views, multi-rack bays), PNG/PDF/SVG export, URL/QR sharing, YAML persistence with autosave, undo/redo, custom devices, and weight/depth/power tracking. Crucially, upstream has already designed — but not built — pro-audio connectivity: Epic [#1928](https://github.com/RackulaLives/Rackula/issues/1928) and spike `docs/research/spike-1927-pro-audio-av-connectivity.md` specify AV interface types, port directionality, signal types, and connection rendering, broken into S/M/L-sized issues with dependencies.

**Strategy: follow upstream's epic — its schema, its issue ordering, its "every schema change ships with visible UI" rule — rather than inventing a parallel design.** This keeps rebases cheap when upstream's own M5 lands and leaves upstreaming individual pieces open.

## Decisions already made

- **Fork, not from-scratch.** The editor is weeks of solved work; the missing piece (connection visualization) is exactly what we want to build.
- **Local-first.** Do not run the optional API backend. Browser storage + YAML export is the persistence story.
- **Device specs tracked:** power draw, ports, depth, weight — all already in upstream's NetBox-compatible schema.
- **Device visuals:** upstream's existing image-per-device system with labeled color blocks as fallback. No faceplate drawing work now; a product-photo→SVG pipeline is a future phase.
- **Views in scope:** cable overlay on the rack view (primary) and an interactive connection list. A signal-flow graph tab was considered and deferred — it is purely a derived view over the same Connection + PortDirection data, so deferring costs nothing architecturally.
- **Commit convention:** no AI co-author trailers on fork commits (user convention overrides upstream's request; revisit per-PR if upstreaming).

## Task zero: toolchain under Santa lockdown

This machine allows binary execution only from `/nix/store/...` and `<project>/build*/...`. Node itself comes from the nix store, but the Vite toolchain executes native helpers out of `node_modules`:

- **esbuild** spawns `node_modules/@esbuild/darwin-arm64/bin/esbuild` as a subprocess — will be blocked. Fix direction: copy that exact binary to `build/esbuild` post-install and set `ESBUILD_BINARY_PATH="$PWD/build/esbuild"` (esbuild requires an exact version match, so copying the installed binary beats a nix-provided one).
- **Rollup**'s `@rollup/rollup-darwin-arm64` is a `.node` module loaded into the node process, not executed — expected to pass; verify.
- **Playwright** downloads browsers to `~/Library/Caches/ms-playwright` and executes them there — blocked. Fix: `PLAYWRIGHT_BROWSERS_PATH="$PWD/build/pw-browsers"`.
- Route `npm install`, builds, and test runs through `busybee`.

Task zero is proving `npm run dev`, `npm run test:run`, and `npm run build` all work under these constraints, and recording the working env setup in a fork-local note (kept out of upstream-conflicting files). If the copy-binary approach fails, fall back to investigating a nix dev shell pinning esbuild to the package version. Unknowns here are expected; solve before any feature work.

## Workstream A — connectivity core (upstream M5 subset)

Follow the epic's Phase 0 → Phase 1 ordering. Each step is one reviewable change pairing schema with visible UI, TDD throughout.

1. **AV interface types** (studio-relevant subset of the spike's taxonomy): `xlr-3`, `trs-1-4`, `ts-1-4`, `rca`, `adat-optical`, `midi-din`, `bnc` (word clock), `db25-audio`, plus existing USB types. Others from the spike (Speakon, HDMI, SDI, DMX…) can be added trivially later.
2. **`PortDirection`** field on `InterfaceTemplate` and `PlacedPort`, with an `inferDirection()` utility for smart defaults.
3. **"av" `PortCategory`.**
4. **Remove the deprecated `Cable` model** (upstream M5 decision; no migration path needed — nothing user-facing uses it).
5. **PortIndicators integrated into RackDevice** (upstream #250) so placed devices show their ports.
6. **Connection store with validation** (upstream #369): warn on output→output and input→input connections.
7. **`ConnectionLayer`/`ConnectionPath` rendering** (upstream #1931): SVG cable curves over the rack view, color-coded, with hover path highlighting.
8. **Connection creation workflow:** click port → click port.
9. **Direction arrows** on connections, derived from port direction (connections themselves stay symmetric `a_port_id`/`b_port_id`, per upstream's design decision).
10. **Cascade-delete connections on device removal** (upstream #639).

## Workstream B — signal types and connection list

1. **`signal_type` field** on connections: optional, inferred via `inferSignalType()` from port types (the spike's key finding: connector type and signal type are independent — one XLR can carry mic, line, or AES3).
2. **Color-coding by signal type** in the overlay; compatibility warnings on mismatched signal types.
3. **Interactive connection list:** filterable table (from device/port, to device/port, connector, signal type, label); hovering a row highlights both ports and the cable path in the rack view. Upstream only plans CSV export, so the interactive table is a small novel addition.
4. **CSV patch-list export** (upstream-planned; near-free once the table exists).

## Shared filter state

One filter store — signal type, device group, rack — consumed by both the overlay and the list (and any future graph view). Toggleable from a single UI control, so "show me only the ADAT runs" works everywhere at once.

## Error handling

No silent fallbacks. A connection referencing a missing port is a loud validation error surfaced in the UI, never silently dropped (cascade-delete covers the normal path; this guards YAML-import edge cases). Signal-type mismatches warn but do not block — patching an output into an input of a different signal type is sometimes intentional.

## Testing

Upstream house rules, which we follow anyway: TDD with Vitest, Playwright e2e for the port-click connection workflow, `svelte-check` and the Prettier gate before any push.

## Deferred (explicitly out of scope for this phase)

- Signal-flow graph tab (derived view; additive later)
- Product-photo→SVG faceplate pipeline
- Patch-bay normalling, external endpoints (wall plates), matrix routing
- Upstream PR engagement (optionally: comment on #1928 asking whether they'd take M5-item PRs — user's call, one comment answers it)

## Risks

- **Upstream lands M5 mid-build.** Mitigation: schema alignment and small commits make rebasing onto their implementation feasible; regularly `git fetch upstream` and rebase early rather than late.
- **Santa toolchain unknowns** (task zero exists precisely to de-risk this before feature work).
- **Solo-maintainer upstream** with zero external-PR track record — if we upstream, expect an untested review process; keep the fork independent of that outcome.
