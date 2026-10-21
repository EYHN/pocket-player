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
// `window.pocketPlayer` is the running player, for tools and screenshots.

import { frames } from "./pocket3d-shell.js";
import { openInterface, screens } from "./pocket3d-interface.js";
import { createPlayer } from "./pocket3d-player.js";

const beside = (name) => new URL(name, import.meta.url).href;

/** The handhelds this player shows, by the `.pocket` variant target their build is for. */
const DEVICES = [
  { target: "psp", id: "psp", label: "PSP", sticks: 1 },
  { target: "vita", id: "vita", label: "PS Vita", sticks: 2 },
  { target: "3ds-dev", id: "3ds", label: "Nintendo 3DS", sticks: 1 },
];

// ---------------------------------------------------------------------------
// The .pocket package (PocketJS contracts/spec/pocket-package.ts, version 1)
// ---------------------------------------------------------------------------

const SECTION = { identity: 1, plan: 2, js: 3, pak: 4 };

function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < bytes.length; i++) hash = ((hash ^ BigInt(bytes[i])) * 0x100000001b3n) & 0xffffffffffffffffn;
  return hash;
}

/** `{ manifest, variants: Map<target, { hostAbi, sections: Map<kind, Uint8Array> }> }` of a package's bytes. */
export function decodePocket(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 24 || view.getUint32(0, true) !== 0x544b4350) throw new Error("not a .pocket package");
  if (view.getUint32(4, true) !== 1) throw new Error(`.pocket version ${view.getUint32(4, true)} is not version 1`);
  if (view.getBigUint64(bytes.length - 8, true) !== fnv1a64(bytes.subarray(0, bytes.length - 8))) throw new Error("the .pocket package is damaged (footer hash)");
  const manifestLength = view.getUint32(8, true);
  const variantCount = view.getUint32(12, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + manifestLength)));
  const table = Math.ceil((16 + manifestLength) / 16) * 16;
  const variants = new Map();
  for (let v = 0; v < variantCount; v++) {
    const entry = table + v * 40;
    const name = bytes.subarray(entry, entry + 16);
    const end = name.indexOf(0);
    const target = new TextDecoder().decode(name.subarray(0, end < 0 ? 16 : end));
    const hostAbi = view.getUint32(entry + 16, true);
    const count = view.getUint32(entry + 20, true);
    const offset = view.getUint32(entry + 24, true);
    const sections = new Map();
    for (let s = 0; s < count; s++) {
      const at = offset + s * 16;
      const kind = view.getUint32(at, true);
      const from = view.getUint32(at + 8, true);
      sections.set(kind, bytes.subarray(from, from + view.getUint32(at + 12, true)));
    }
    variants.set(target, { hostAbi, sections });
  }
  return { manifest, variants };
}

/** A variant's guest as the realm reads it: blob URLs of its bundle and pak, and its build plan. */
function guestOf(variant) {
  const js = variant.sections.get(SECTION.js);
  const plan = variant.sections.get(SECTION.plan);
  if (!js || !plan) throw new Error("the variant has no bundle or no build plan");
  // (the js section carries QuickJS's terminating NUL)
  const source = js[js.length - 1] === 0 ? js.subarray(0, js.length - 1) : js;
  const pak = variant.sections.get(SECTION.pak) ?? new Uint8Array(0);
  return {
    plan: JSON.parse(new TextDecoder().decode(plan)),
    bundle: URL.createObjectURL(new Blob([source], { type: "text/javascript" })),
    pak: URL.createObjectURL(new Blob([pak], { type: "application/octet-stream" })),
  };
}

// ---------------------------------------------------------------------------
// The player
// ---------------------------------------------------------------------------

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

  const response = await fetch(new URL(pocket, location.href));
  if (!response.ok) throw new Error(`${pocket}: HTTP ${response.status}`);
  const pkg = decodePocket(new Uint8Array(await response.arrayBuffer()));
  const devices = DEVICES.filter((d) => pkg.variants.has(d.target));
  if (devices.length === 0) throw new Error(`${pocket} has no variant for ${DEVICES.map((d) => d.target).join(", ")}`);

  const wanted = new URLSearchParams(location.search).get("device") ?? device;
  let current = devices.find((d) => d.id === wanted || d.target === wanted) ?? devices[0];
  let present = () => {};
  const player = createPlayer({
    root,
    title: title ?? pkg.manifest.title ?? pkg.manifest.name ?? "PocketJS",
    tagline,
    devices,
    device: current.id,
    runsOn: [],
    about: { en: "A PocketJS app, played in a browser tab by pocket-player." },
    pick: (id) => present(devices.find((d) => d.id === id)),
  });
  // The dock leads to Pocket Studio; an artifact has no listing there.
  for (const dock of document.querySelectorAll("[data-pocket-studio]")) dock.hidden = true;
  const { canvas, stage, controls } = player;
  const context = canvas.getContext("2d");

  let ui = null;
  let picture = null;
  let lower = null;
  let guest = null;
  present = async (next) => {
    current = next;
    report.device = next.id;
    ui?.close();
    ui = null;
    if (guest) for (const url of [guest.bundle, guest.pak]) URL.revokeObjectURL(url);
    guest = guestOf(pkg.variants.get(next.target));
    const of = screens(guest.plan);
    const [width, height] = of.physical;
    player.show(next.id, { width, height, lower: of.auxiliary, sticks: next.sticks, glyphs: of.glyphs, touch: of.touch === "none" ? null : of.touch, viewport: of.viewport });
    canvas.width = width;
    canvas.height = height;
    picture = context.createImageData(width, height);
    lower = of.auxiliary ? new ImageData(of.auxiliary[0], of.auxiliary[1]) : null;
    try {
      const opened = await openInterface({ realm: beside("app-instance.html"), wasm: beside("pocketjs.wasm"), bundle: guest.bundle, pak: guest.pak, plan: guest.plan });
      if (current !== next) return opened.close();
      ui = opened;
      player.say("");
    } catch (error) {
      report.failure = String(error?.message ?? error);
      player.say(report.failure);
    }
  };
  await present(current);

  const frame = () => {
    const held = controls.read();
    if (ui) {
      ui.turn(held.buttons, held.contacts, 1);
      if (ui.changed()) {
        const drawn = ui.picture();
        // Premultiplied RGBA over the black of the screen: the colour channels already are the result.
        const out = picture.data;
        out.set(drawn.pixels.subarray(0, out.length));
        for (let i = 3; i < out.length; i += 4) out[i] = 255;
        context.putImageData(picture, 0, 0);
      }
      if (lower && ui.lowerChanged()) {
        lower.data.set(ui.lower());
        stage.lower.putImageData(lower, 0, 0);
      }
      report.frames++;
      if (!report.ready) {
        report.ready = true;
        player.ready();
      }
    }
    controls.next(ui !== null);
  };

  canvas.hidden = false;
  stage.fit();
  frames(() => 60, () => {
    try {
      frame();
    } catch (error) {
      report.failure = String(error?.message ?? error);
      player.say(report.failure);
    }
  });
  report.present = (id) => present(devices.find((d) => d.id === id));
  report.capture = () => canvas.toDataURL("image/png");
  return report;
}
