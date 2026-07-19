# Fork dev environment (Santa-lockdown machines)

This fork is developed on a machine where **Santa runs in lockdown**: binaries
execute only from `/nix/store/...` and `<project>/build*/...`. The user's
environment is never mutated -- no PATH edits, no sourced env scripts, no global
installs. Everything is scoped to an ephemeral Nix dev shell.

## The `nix develop -c` convention

Run every toolchain command through the flake's dev shell:

```bash
nix develop -c npm run test:run
busybee -- nix develop -c npm run build     # heavy commands go through busybee
```

The plain shell deliberately has **no `node` on PATH** -- that is the invariant
we keep. `flake.nix` provides `nodejs_22` (matching CI) inside the shell only.

## Install flow (two steps, not one)

```bash
nix develop -c npm ci --ignore-scripts
nix develop -c ./scripts/relocate-node-modules.sh
```

Both steps are required, every time you install:

1. **`--ignore-scripts`** is mandatory. esbuild's postinstall runs
   `node_modules/esbuild/bin/esbuild --version` *during* the install, from the
   default `./node_modules` path -- which Santa blocks, SIGKILLing it and
   aborting `npm ci`. Skipping lifecycle scripts avoids any mid-install exec.
   esbuild's actual binary ships inside the `@esbuild/darwin-arm64` package
   tarball, so it is fully present and working without the postinstall (which
   only *validates* it). Rollup is a `.node` module loaded in-process, so it is
   unaffected either way.

2. **The relocate** moves `node_modules` under `build-deps/` and leaves a
   symlink behind:

   ```
   node_modules -> build-deps/node_modules
   ```

   npm has no supported way to install anywhere other than `./node_modules`
   (`prefix` is global-only; see npm issue #13933), so we relocate after the
   fact. **Santa evaluates the resolved realpath of the executed file, not the
   symlink used to launch it** (verified empirically on this machine). So
   `node_modules/.bin/esbuild`, the `.bin` double-symlink hop, and the absolute
   `.../node_modules/esbuild/bin/esbuild` path Vite spawns all resolve under
   `build-deps/` and are allowed. One symlink covers every native binary in the
   tree, present and future -- no per-binary staging.

`npm ci` deletes `node_modules` (including the symlink) before installing, so
re-run the relocate after every install. The 367M tree lives under
`build-deps/`, which is git-ignored locally.

## Playwright browsers

Browsers live *outside* `node_modules`, so the relocate does not cover them.
The flake exports `PLAYWRIGHT_BROWSERS_PATH="$PWD/build-deps/pw-browsers"` so
downloaded browsers execute from an allowed path.

The pure-nix option (`nixpkgs#playwright-driver.browsers`, executing straight
from `/nix/store`) is only valid when the nixpkgs driver version matches npm's
`@playwright/test`. It currently does **not** (nixpkgs 1.60.0 vs npm 1.61.1), so
we download instead:

```bash
nix develop -c npx playwright install chromium
```

Re-run this after any Playwright version bump (or re-check the nixpkgs driver
version and switch to the pure-nix path if they line up).

## No husky hooks

`npm run prepare` (husky) is intentionally not run: it needs `git` inside the
shell, and any installed pre-commit hook would need `node` on PATH -- which the
plain shell lacks, so hooks would break commits made outside `nix develop`.
Run the checks explicitly instead: `nix develop -c npm run lint` and
`nix develop -c npm run check`.

## gitignore footgun

`.gitignore` ignores `node_modules/` **with a trailing slash**, which matches a
directory but *not* a symlink. Since our `node_modules` is a symlink, the
slash-less `node_modules` is added to `.git/info/exclude` so it stays untracked.
`build-deps/` and `build/` are excluded there too.

## Debugging a new Santa block

If a new tool triggers a Santa popup or a SIGKILL'd exec:

1. Find the realpath of the binary it tried to execute.
2. Get that realpath under `build*` -- either it is already in the relocated
   `node_modules` (nothing to do), or point the tool's cache/output knob
   (`*_BROWSERS_PATH`, `*_CACHE_DIR`, `--out-dir`, ...) at `build-deps/`.
3. If a lifecycle script execs a binary mid-install, add `--ignore-scripts` and
   run the needed step after the relocate.
