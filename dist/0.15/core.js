// pocket-player core — a PocketJS app on a canvas, without a shell.
//
//   import { mount, BTN } from "./pocket-player/0.15/core.js";
//   const app = await mount({ pocket: "app.pocket", canvas, layout: (screen) => size(screen) });
//   app.input(BTN.CROSS, []);          // the keys held, the touch contacts — kept until the next call
//
// For a host that draws the handheld itself (a native app's shell around a web view, a test): the
// core boots a `.pocket` variant in PocketJS's guest realm, turns it 60 times a second with the input
// it was last given and draws its screen on `canvas`. `play()` (player.js) is the web shell over it.
//
// Options: `pocket` (an address, the bytes, or `decodePocket`'s result), `canvas` (the screen),
// `lower` (a function giving the 2D context of a 3DS's lower screen, or null), `device` (id or
// target, default the first), `layout(screen)` (called before each device opens, to size the shell),
// `read()` / `next(turned)` (an input source to poll instead of `input`), `ready()` and `fail(message)`.
// Serve this directory from the page's own origin: the realm is a frame of it.

import { frames } from "./pocket3d-shell.js";
import { openInterface, screens } from "./pocket3d-interface.js";
import { BTN } from "./pocketjs-host.js";

export { BTN };

const beside = (name) => new URL(name, import.meta.url).href;

/** The handhelds a package can be played as, by the `.pocket` variant target their build is for. */
export const DEVICES = [
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

/** A package from an address, its bytes, or an already decoded one. */
export async function loadPocket(pocket) {
  if (pocket?.variants instanceof Map) return pocket;
  if (pocket instanceof ArrayBuffer) return decodePocket(new Uint8Array(pocket));
  if (pocket instanceof Uint8Array) return decodePocket(pocket);
  if (!pocket) throw new Error("no .pocket package given");
  const response = await fetch(new URL(pocket, location.href));
  if (!response.ok) throw new Error(`${pocket}: HTTP ${response.status}`);
  return decodePocket(new Uint8Array(await response.arrayBuffer()));
}

/** The devices a package has a variant for, in DEVICES order. */
export function devicesOf(pkg) {
  return DEVICES.filter((d) => pkg.variants.has(d.target));
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
// The core
// ---------------------------------------------------------------------------

export async function mount({ pocket, canvas, lower = () => null, device, layout = () => {}, read, next = () => {}, ready = () => {}, fail = () => {} } = {}) {
  if (!canvas) throw new Error("mount({ canvas }) needs the canvas to draw the screen on");
  const pkg = await loadPocket(pocket);
  const devices = devicesOf(pkg);
  if (devices.length === 0) throw new Error(`the package has no variant for ${DEVICES.map((d) => d.target).join(", ")}`);
  const context = canvas.getContext("2d");

  let held = { buttons: 0, contacts: [] };
  const poll = read ?? (() => held);
  let current = devices.find((d) => d.id === device || d.target === device) ?? devices[0];
  let ui = null;
  let picture = null;
  let lowerPicture = null;
  let guest = null;
  let loop = null;

  const app = {
    manifest: pkg.manifest,
    devices,
    device: "",
    /** The open device's screen: `{ id, label, target, sticks, width, height, lower, glyphs, touch, viewport }`. */
    screen: null,
    ready: false,
    frames: 0,
    failure: "",
    /** The keys held (BTN bits) and the touch contacts (`[{ id, x, y }]`, logical pixels), from now on. */
    input(buttons = 0, contacts = []) {
      held = { buttons, contacts };
    },
    present: (id) => present(devices.find((d) => d.id === id || d.target === id) ?? current),
    capture: () => canvas.toDataURL("image/png"),
    close() {
      loop?.stop();
      ui?.close();
      ui = null;
      if (guest) for (const url of [guest.bundle, guest.pak]) URL.revokeObjectURL(url);
      guest = null;
    },
  };

  const failed = (error) => {
    app.failure = String(error?.message ?? error);
    fail(app.failure);
  };

  const present = async (wanted) => {
    current = wanted;
    app.device = wanted.id;
    ui?.close();
    ui = null;
    if (guest) for (const url of [guest.bundle, guest.pak]) URL.revokeObjectURL(url);
    guest = guestOf(pkg.variants.get(wanted.target));
    const of = screens(guest.plan);
    const [width, height] = of.physical;
    app.screen = { ...wanted, width, height, lower: of.auxiliary ?? null, glyphs: of.glyphs, touch: of.touch === "none" ? null : of.touch, viewport: of.viewport };
    layout(app.screen);
    canvas.width = width;
    canvas.height = height;
    picture = context.createImageData(width, height);
    lowerPicture = of.auxiliary ? new ImageData(of.auxiliary[0], of.auxiliary[1]) : null;
    try {
      const opened = await openInterface({ realm: beside("app-instance.html"), wasm: beside("pocketjs.wasm"), bundle: guest.bundle, pak: guest.pak, plan: guest.plan });
      if (current !== wanted) return opened.close();
      ui = opened;
      app.failure = "";
    } catch (error) {
      failed(error);
    }
  };

  const frame = () => {
    const input = poll();
    if (ui) {
      ui.turn(input.buttons, input.contacts, 1);
      if (ui.changed()) {
        const drawn = ui.picture();
        // Premultiplied RGBA over the black of the screen: the colour channels already are the result.
        const out = picture.data;
        out.set(drawn.pixels.subarray(0, out.length));
        for (let i = 3; i < out.length; i += 4) out[i] = 255;
        context.putImageData(picture, 0, 0);
      }
      const below = lowerPicture ? lower() : null;
      if (below && ui.lowerChanged()) {
        lowerPicture.data.set(ui.lower());
        below.putImageData(lowerPicture, 0, 0);
      }
      app.frames++;
      if (!app.ready) {
        app.ready = true;
        ready();
      }
    }
    next(ui !== null);
  };

  await present(current);
  loop = frames(() => 60, () => {
    try {
      frame();
    } catch (error) {
      failed(error);
    }
  });
  return app;
}
