// pocket-player — a PocketJS app in its handhelds' shells, on a web page.
//
//   <script type="module">
//     import { play } from "./pocket-player/0.15/player.js";
//     play({ pocket: "app.pocket" });
//   </script>
//
// `pocket` is the app's `.pocket` package. Its manifest names the app; each of its variants is a
// device the bar offers (psp, vita, 3ds-dev). The page is PocketJS's Pocket3D player — the bar, a
// handheld's shell with its keys — with the app's interface as the whole screen. A Pocket3D scene
// is not drawn yet; `play` is where a game's renderer will join.
//
// The player reads a frame of its own directory and fetches its UI core from there: serve this
// directory from the page's own origin.
//
// Options: `pocket` (required), `title` and `tagline` (default: the manifest's title, none), `device`
// (the one to open as; also `?device=` in the address), `root` (default document.body).
// `window.pocketPlayer` is the running player, for tools and screenshots. The app itself runs in
// core.js's `mount`, which a host that draws its own shell can use directly.

import { decodePocket, devicesOf, loadPocket, mount } from "./core.js";
import { createPlayer } from "./pocket3d-player.js";

export { decodePocket };

const beside = (name) => new URL(name, import.meta.url).href;

function addStylesheet(name) {
  const href = beside(name);
  if (document.querySelector(`link[href="${href}"]`)) return;
  document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href }));
}

export async function play({ pocket, title, tagline = "", device, root = document.body } = {}) {
  if (!pocket) throw new Error("play({ pocket }) needs the .pocket file's address");
  addStylesheet("pocket3d-stage.css");
  addStylesheet("pocket3d-player.css");
  document.documentElement.style.background = "#171226";

  const report = { ready: false, device: "", frames: 0, failure: "" };
  window.pocketPlayer = report;

  const pkg = await loadPocket(pocket);
  const devices = devicesOf(pkg);
  if (devices.length === 0) throw new Error(`${pocket} has no variant the player knows`);
  const wanted = new URLSearchParams(location.search).get("device") ?? device;
  const first = devices.find((d) => d.id === wanted || d.target === wanted) ?? devices[0];

  let app = null;
  const player = createPlayer({
    root,
    title: title ?? pkg.manifest.title ?? pkg.manifest.name ?? "PocketJS",
    tagline,
    devices,
    device: first.id,
    runsOn: [],
    about: { en: "A PocketJS app, played in a browser tab by pocket-player." },
    pick: (id) => app?.present(id),
  });
  // The dock leads to Pocket Studio; a page of pocket-player has no listing there.
  for (const dock of document.querySelectorAll("[data-pocket-studio]")) dock.hidden = true;
  const { canvas, stage, controls } = player;

  app = await mount({
    pocket: pkg,
    canvas,
    lower: () => stage.lower,
    device: first.id,
    layout: (screen) => {
      report.device = screen.id;
      player.show(screen.id, { width: screen.width, height: screen.height, lower: screen.lower, sticks: screen.sticks, glyphs: screen.glyphs, touch: screen.touch, viewport: screen.viewport });
    },
    read: () => controls.read(),
    next: (turned) => {
      report.frames = app?.frames ?? 0;
      controls.next(turned);
    },
    ready: () => {
      report.ready = true;
      player.ready();
    },
    fail: (message) => {
      report.failure = message;
      player.say(message);
    },
  });
  if (!app.failure) player.say("");
  canvas.hidden = false;
  stage.fit();
  report.present = (id) => app.present(id);
  report.capture = () => app.capture();
  return report;
}
