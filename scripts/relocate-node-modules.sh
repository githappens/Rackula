#!/usr/bin/env bash
# Re-run after every `npm ci` / `npm install`.
#
# Santa (lockdown) allows binary execution only from /nix/store and
# <project>/build*/. Native binaries in node_modules (esbuild, and any others)
# would be blocked at their default ./node_modules path. npm has no supported
# way to install elsewhere (prefix is global-only; see npm issue #13933), so we
# relocate the whole tree under build-deps/ and leave a symlink behind:
#
#     node_modules -> build-deps/node_modules
#
# Santa evaluates the resolved realpath of the executed file, not the symlink
# used to launch it (verified empirically), so `node_modules/.bin/esbuild` and
# the absolute path Vite spawns both resolve under build-deps/ and are allowed.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -L node_modules ]; then
  echo "relocate: node_modules already a symlink -> $(readlink node_modules)"
  exit 0
fi

[ -d node_modules ] || { echo "relocate: node_modules missing -- run npm ci first" >&2; exit 1; }

mkdir -p build-deps
rm -rf build-deps/node_modules
mv node_modules build-deps/node_modules
ln -s build-deps/node_modules node_modules
echo "relocate: node_modules -> build-deps/node_modules ($(du -sh build-deps/node_modules | cut -f1))"
