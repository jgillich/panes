# Flatpak Notes

Build from the repository root with:

```sh
flatpak-builder --user --install --force-clean build-flatpak com.panes.app.yml
```

This manifest is aimed at local builds from the checked-out source tree.

- It allows network access during the build so `pnpm`, `cargo`, and the Flatpak-packaged tool runtimes can fetch dependencies.
- It bundles sandbox-local `git`, `node`, and `mise`.
- It installs a Flatpak-local `mise` profile at `/app/etc/profile.d/mise-env.sh` so shell sessions start with sandbox-local `mise` defaults.
- Agent CLIs installed from inside the app stay inside the Flatpak sandbox via `mise` under `~/.local/share/mise`.
