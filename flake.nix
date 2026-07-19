{
  description = "Rackula fork — dev shell for Santa-lockdown machines (fork-only file)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" ];
      eachSystem = f:
        nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = eachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.nodejs_22 ]; # CI runs Node 22 (CONTRIBUTING.md) — match it
          shellHook = ''
            # Santa allows exec only from /nix/store and <project>/build*/.
            # node_modules is relocated under build-deps/ with a symlink pointing
            # there (scripts/relocate-node-modules.sh), so every native binary --
            # esbuild included -- resolves to an allowed realpath. Santa matches
            # the resolved realpath, not the symlink path, so no per-binary
            # staging or ESBUILD_BINARY_PATH is needed. See docs/fork/dev-environment.md.
            # Playwright browsers live OUTSIDE node_modules, so they still need an
            # explicit allowed path.
            export PLAYWRIGHT_BROWSERS_PATH="$PWD/build-deps/pw-browsers"
          '';
        };
      });
    };
}
