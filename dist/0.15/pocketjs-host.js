// framework/src/touch.ts
var LEGACY_COORD_BITS = 9;
var LEGACY_COORD_MASK = (1 << LEGACY_COORD_BITS) - 1;
var LEGACY_ID_SHIFT = LEGACY_COORD_BITS * 2;
var WIDE_MARKER = 2147483648;
var WIDE_COORD_BITS = 10;
var WIDE_COORD_MASK = (1 << WIDE_COORD_BITS) - 1;
var WIDE_ID_SHIFT = WIDE_COORD_BITS * 2;
var CANCEL_MARKER = 1073741824;
var EMPTY = Object.freeze([]);
function __packTouch(id, x, y) {
  return ((id & 255) << LEGACY_ID_SHIFT | (y & LEGACY_COORD_MASK) << LEGACY_COORD_BITS | x & LEGACY_COORD_MASK) >>> 0;
}
function createTouchHitFacts(query) {
  const table = /* @__PURE__ */ new Map();
  return (packed) => {
    if (!packed || packed.length === 0) {
      table.clear();
      return void 0;
    }
    const seen = /* @__PURE__ */ new Set();
    const hits = packed.slice(0, 16).map((value) => {
      if (value & CANCEL_MARKER) return 0;
      const wide = (value & WIDE_MARKER) !== 0;
      const coordBits = wide ? WIDE_COORD_BITS : LEGACY_COORD_BITS;
      const coordMask = wide ? WIDE_COORD_MASK : LEGACY_COORD_MASK;
      const id = value >>> coordBits * 2 & 255;
      seen.add(id);
      let hit = table.get(id);
      if (hit === void 0) {
        hit = query(value & coordMask, value >>> coordBits & coordMask);
        table.set(id, hit);
      }
      return hit;
    });
    for (const id of [...table.keys()]) if (!seen.has(id)) table.delete(id);
    return hits;
  };
}

// contracts/spec/spec.ts
var VALUE_KIND = {
  /** IEEE-754 f32 bits (dimensions, scalars, degrees). */
  f32: 0,
  /** Packed color, u32 ABGR (0xAABBGGRR). */
  color: 1,
  /** Plain integer / enum ordinal stored as u32. */
  int: 2
};
var PROP_VALUE_KIND = {
  width: VALUE_KIND.f32,
  height: VALUE_KIND.f32,
  minW: VALUE_KIND.f32,
  minH: VALUE_KIND.f32,
  maxW: VALUE_KIND.f32,
  maxH: VALUE_KIND.f32,
  paddingT: VALUE_KIND.f32,
  paddingR: VALUE_KIND.f32,
  paddingB: VALUE_KIND.f32,
  paddingL: VALUE_KIND.f32,
  marginT: VALUE_KIND.f32,
  marginR: VALUE_KIND.f32,
  marginB: VALUE_KIND.f32,
  marginL: VALUE_KIND.f32,
  gap: VALUE_KIND.f32,
  flexDir: VALUE_KIND.int,
  justify: VALUE_KIND.int,
  align: VALUE_KIND.int,
  grow: VALUE_KIND.f32,
  shrink: VALUE_KIND.f32,
  basis: VALUE_KIND.f32,
  flexWrap: VALUE_KIND.int,
  posType: VALUE_KIND.int,
  insetT: VALUE_KIND.f32,
  insetR: VALUE_KIND.f32,
  insetB: VALUE_KIND.f32,
  insetL: VALUE_KIND.f32,
  display: VALUE_KIND.int,
  overflow: VALUE_KIND.int,
  zIndex: VALUE_KIND.int,
  hitPass: VALUE_KIND.int,
  contain: VALUE_KIND.int,
  bgColor: VALUE_KIND.color,
  gradFrom: VALUE_KIND.color,
  gradTo: VALUE_KIND.color,
  gradDir: VALUE_KIND.int,
  radius: VALUE_KIND.f32,
  opacity: VALUE_KIND.f32,
  borderColor: VALUE_KIND.color,
  borderWidth: VALUE_KIND.f32,
  shadow: VALUE_KIND.int,
  bevelOuterLight: VALUE_KIND.color,
  bevelOuterDark: VALUE_KIND.color,
  bevelInnerLight: VALUE_KIND.color,
  bevelInnerDark: VALUE_KIND.color,
  bevelWidth: VALUE_KIND.f32,
  gradVia: VALUE_KIND.color,
  gradViaPos: VALUE_KIND.f32,
  textColor: VALUE_KIND.color,
  fontSlot: VALUE_KIND.int,
  textAlign: VALUE_KIND.int,
  lineHeight: VALUE_KIND.f32,
  tracking: VALUE_KIND.f32,
  translateX: VALUE_KIND.f32,
  translateY: VALUE_KIND.f32,
  scale: VALUE_KIND.f32,
  rotate: VALUE_KIND.f32,
  scaleX: VALUE_KIND.f32,
  scaleY: VALUE_KIND.f32,
  originX: VALUE_KIND.f32,
  originY: VALUE_KIND.f32,
  rotateX: VALUE_KIND.f32,
  rotateY: VALUE_KIND.f32,
  translateZ: VALUE_KIND.f32,
  perspective: VALUE_KIND.f32,
  arcStart: VALUE_KIND.f32,
  arcSweep: VALUE_KIND.f32,
  arcWidth: VALUE_KIND.f32,
  skewX: VALUE_KIND.f32
};
var IMG_FLAG_RLE = 1 << 0;
var IMG_FLAG_LINEAR = 1 << 1;
var TILESET_FLAG_RLE = 1 << 0;
var TILESET_FLAG_LINEAR = 1 << 1;
var SVC_IMG_MAX_BYTES = 128 * 1024;
var STREAM_FLAG_ENDED = 1 << 0;
var WIRE_MAX_PAYLOAD = 256 * 1024;
var WIRE_SLOT_FLAG_RLE = 1 << 0;
var WIRE_MARK_FLAG_ENDED = 1 << 0;
var STYLE_VARIANT_BASE = 1 << 0;
var STYLE_VARIANT_FOCUS = 1 << 1;
var STYLE_VARIANT_ACTIVE = 1 << 2;
var STYLE_HAS_TRANSITION = 1 << 3;
var STYLE_HAS_ANIMATION = 1 << 4;
var ANIM_FILL_BACKWARDS = 1 << 0;
var ANIM_FILL_FORWARDS = 1 << 1;
var FONT_FLAG_BOLD = 1 << 0;
var BTN = {
  SELECT: 1,
  START: 8,
  UP: 16,
  RIGHT: 32,
  DOWN: 64,
  LEFT: 128,
  LTRIGGER: 256,
  RTRIGGER: 512,
  ZL: 1024,
  ZR: 2048,
  TRIANGLE: 4096,
  CIRCLE: 8192,
  CROSS: 16384,
  SQUARE: 32768
};
var FIXED_DT = 1 / 60;
export {
  BTN,
  __packTouch,
  createTouchHitFacts
};
