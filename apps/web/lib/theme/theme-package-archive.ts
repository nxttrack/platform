import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

import { safeThemeSourcePath } from "./portal-journey-presentation";

export const themeImportLimits = Object.freeze({ archive: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, file: 20 * 1024 * 1024, json: 4 * 1024 * 1024, entries: 400, ratio: 200 });
export type ThemePackageFiles = ReadonlyMap<string, Buffer>;
const decoder = new TextDecoder("utf-8", { fatal: true });
const crcTable = new Uint32Array(256).map((_, i) => {
  let n = i;
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function themeContentHash(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** No filesystem extraction and no executable content. Bound both declared and actual bytes. */
export function readThemeArchive(bytes: Buffer, signal?: AbortSignal): ThemePackageFiles {
  if (bytes.length < 22 || bytes.length > themeImportLimits.archive) throw new Error("Invalid ZIP size (maximum 64 MiB)");
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0) throw new Error("Incomplete ZIP archive");
  const count = bytes.readUInt16LE(end + 10), centralSize = bytes.readUInt32LE(end + 12), centralStart = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count === 65535 || centralSize === 0xffffffff || centralStart === 0xffffffff) throw new Error("Multidisk and ZIP64 are unsupported");
  if (!count || count > themeImportLimits.entries || centralStart + centralSize !== end) throw new Error("Invalid ZIP directory size or entry count");
  const entries: { name: string; method: number; crc: number; size: number; compressed: number; start: number }[] = [];
  const ranges: [number, number][] = [], names = new Set<string>();
  let offset = centralStart, total = 0;
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted();
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("Corrupt ZIP directory");
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20), size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42), fileType = (bytes.readUInt32LE(offset + 38) >>> 16) & 0xf000;
    if (offset + 46 + nameLength + extraLength + commentLength > end) throw new Error("ZIP name outside directory");
    const rawName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const directory = rawName.endsWith("/"), name = safeThemeSourcePath(directory ? rawName.slice(0, -1) : rawName);
    if (names.has(name.toLowerCase())) throw new Error("Duplicate or ambiguous ZIP path");
    names.add(name.toLowerCase());
    if (flags & ~0x080e || ![0, 8].includes(method) || ![0, 0x8000, 0x4000].includes(fileType) || (fileType === 0x4000 && !directory) || bytes.readUInt16LE(offset + 34)) throw new Error("Encrypted, linked or unsupported ZIP entry");
    if (size > themeImportLimits.file || compressed > themeImportLimits.file || localOffset === 0xffffffff) throw new Error("ZIP file exceeds 20 MiB limit");
    total += size;
    if (total > themeImportLimits.expanded || (size > 1024 * 1024 && size > Math.max(compressed, 1) * themeImportLimits.ratio)) throw new Error("ZIP expansion budget exceeded");
    if (localOffset + 30 > centralStart || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid ZIP local header");
    const localNameLength = bytes.readUInt16LE(localOffset + 26), localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    if (start + compressed > centralStart || decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)) !== rawName || bytes.readUInt16LE(localOffset + 6) !== flags || bytes.readUInt16LE(localOffset + 8) !== method) throw new Error("ZIP headers disagree");
    if (!(flags & 8) && (bytes.readUInt32LE(localOffset + 14) !== crc || bytes.readUInt32LE(localOffset + 18) !== compressed || bytes.readUInt32LE(localOffset + 22) !== size)) throw new Error("ZIP checksum or sizes disagree");
    ranges.push([localOffset, start + compressed]);
    if (directory) {
      if (size || compressed) throw new Error("Nonempty ZIP directory");
    } else {
      // Source documentation stays inert and is never part of the runtime asset catalog.
      if (!/\.(json|png|jpe?g|webp|avif|md|txt|pdf)$/i.test(name) && !/(^|\/)index\.html$/i.test(name)) throw new Error("Unsupported theme file type");
      entries.push({ name, method, crc, size, compressed, start });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== end) throw new Error("Invalid ZIP directory length");
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index && range[0] < ranges[index - 1][1])) throw new Error("Overlapping ZIP entries");
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    signal?.throwIfAborted();
    const source = bytes.subarray(entry.start, entry.start + entry.compressed);
    const output = entry.method === 0 ? source : inflateRawSync(source, { maxOutputLength: Math.max(1, entry.size) });
    if (output.length !== entry.size || crc32(output) !== entry.crc) throw new Error("ZIP content checksum or size mismatch");
    files.set(entry.name, output);
  }
  // Preserve config/manifest.json as a dialect marker, never strip its config directory.
  const recognized = ["manifest.json", "config/manifest.json", "presentation.json"];
  if (recognized.some((name) => files.has(name))) return files;
  const paths = [...files.keys()], roots = new Set(paths.map((name) => name.split("/")[0]));
  if (roots.size === 1 && paths.every((name) => name.includes("/"))) {
    const root = `${paths[0].split("/")[0]}/`;
    if (recognized.some((name) => files.has(`${root}${name}`))) return new Map([...files].map(([name, bytes]) => [name.slice(root.length), bytes]));
  }
  return files;
}

export function readThemeJson(bytes: Buffer, label: string): unknown {
  if (bytes.length > themeImportLimits.json) throw new Error(`${label}: JSON exceeds 4 MiB`);
  let value: unknown;
  try { value = JSON.parse(decoder.decode(bytes)); } catch { throw new Error(`${label}: invalid UTF-8 JSON`); }
  function visit(value: unknown, depth: number) {
    if (depth > 24) throw new Error("Theme JSON nesting limit exceeded");
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > 1000) throw new Error("Theme JSON collection limit exceeded");
      for (const [key, child] of entries) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Reserved JSON key");
        visit(child, depth + 1);
      }
    }
  }
  visit(value, 0);
  return value;
}

/** Stable digest binds review to complete content, independent of object key order. */
export function themeReviewDigest(value: unknown): string {
  function stable(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, stable(value)]));
    return input;
  }
  return themeContentHash(JSON.stringify(stable(value)));
}

/** Export only explicitly supplied public presentation files, never a database row dump. */
export function writeThemeArchive(files: ThemePackageFiles): Buffer {
  if (!files.size || files.size > themeImportLimits.entries) throw new Error("Invalid export file count");
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0, total = 0;
  for (const [path, bytes] of files) {
    const name = Buffer.from(safeThemeSourcePath(path));
    total += bytes.length;
    if (bytes.length > themeImportLimits.file || total > themeImportLimits.expanded) throw new Error("Export budget exceeded");
    const crc = crc32(bytes), local = Buffer.alloc(30 + name.length), entry = Buffer.alloc(46 + name.length);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(bytes.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42); name.copy(entry, 46);
    parts.push(local, bytes); central.push(entry); offset += local.length + bytes.length;
  }
  const end = Buffer.alloc(22), centralSize = central.reduce((size, entry) => size + entry.length, 0);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.size, 8); end.writeUInt16LE(files.size, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  if (offset + centralSize + 22 > themeImportLimits.archive) throw new Error("Export exceeds archive budget");
  return Buffer.concat([...parts, ...central, end]);
}
