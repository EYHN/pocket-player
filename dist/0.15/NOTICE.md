# Third-party files

`player.js` is pocket-player's own (MIT, `LICENSE-pocket-player.txt`). Everything else in this
directory is PocketJS **v0.15.0** (<https://github.com/pocket-nexus/pocketjs>, commit `96e5f4084c2da45d72997c443fd478bcffb92dc7`),
copied unmodified, laid out as PocketJS's `bun tools/pocket3d-web.ts stage` lays it out:

| Files | From | Licence |
| --- | --- | --- |
| `app-instance.html`, `app-instance.js`, `wasm-ops.js`, `runtime-glyphs.js`, `offload-worker.js` | `hosts/web/` | MIT (`LICENSE-PocketJS.txt`) |
| `pocketjs.wasm` | `hosts/web/pocketjs.wasm` of the `@pocketjs/framework@0.15.0` npm package | MIT |
| `pocketjs-host.js` | `framework/src/touch.ts` and `contracts/spec/spec.ts`, bundled with esbuild | MIT |
| `pocket3d-*.js`, `pocket3d-*.css`, `shells/profiles.js` | `devices/web/pocket-web-wgpu/web/` | Pocket3D License (`LICENSE-Pocket3D.txt`) |
| `pocket3d-title.js`, `art.js` | `engine/pocket3d/crates/pocket3d-title/web/` | Pocket3D License |
| `shells/vita*`, `shells/3ds*`, `shells/ipod*`, `shells/android*` | PocketJS's own renders | Pocket3D License (`shells/ATTRIBUTION.md`) |
| `shells/psp.webp`, `shells/psp-parts.webp` | "PlayStation Portable (PSP) - EG02" by Dibad, its marks removed | CC BY 4.0, credited in the player's About panel (`shells/ATTRIBUTION.md`) |
| `fonts/gabarito-800-latin.woff2` | Gabarito | SIL Open Font License 1.1 (`fonts/OFL.txt`) |

The player draws no Pocket3D scene, so the Pocket3D title card does not play. PSP, PS Vita,
PlayStation and Nintendo 3DS are trademarks of their owners; nothing here grants a right to them,
and pocket-player is not affiliated with them.
