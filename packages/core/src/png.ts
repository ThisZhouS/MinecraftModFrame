import { deflateSync } from "node:zlib";

/**
 * Minimal PNG encoder (8-bit RGBA, non-interlaced).
 *
 * Deliberately dependency-free: the framework ships zero runtime deps, and a texture is a
 * 16x16 RGBA buffer — small enough that hand-writing IHDR/IDAT/IEND is cheaper than pulling
 * in an image library. PNG is also the only format Minecraft accepts for item/block textures.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC over (type + payload). */
function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encode a straight (non-premultiplied) RGBA buffer as PNG bytes.
 * Every scanline uses filter type 0 (None): these images are tiny and highly compressible
 * already, so a smarter filter would cost code without meaningfully shrinking the output.
 */
export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`encodePng: expected ${expected} bytes for ${width}x${height} RGBA, got ${rgba.length}`);
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** True when the buffer starts with the 8-byte PNG signature (used by tests and verification). */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Parse width/height back out of an IHDR chunk; throws when the buffer is not a well-formed PNG. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (!isPng(bytes)) throw new Error("readPngSize: not a PNG (bad signature)");
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.toString("ascii", 12, 16) !== "IHDR") throw new Error("readPngSize: first chunk is not IHDR");
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}
