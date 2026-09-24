import sharp from "sharp";

import {
  resolveBadgeShortcodes,
  type BadgeGender,
  type BadgeLayer
} from "./badge-system-contract";

type BadgeShareRenderContext = {
  badgeDescription: string;
  badgeName: string;
  childFirstName: string;
  gender: BadgeGender;
  organizationName: string;
};

type BadgeShareRenderInput = {
  assetDataUrls: Map<string, string>;
  badgeArtworkDataUrl?: string | null;
  context: BadgeShareRenderContext;
  height: number;
  layers: BadgeLayer[];
  width: number;
};

export function buildBadgeShareSvg(input: BadgeShareRenderInput) {
  const width = clamp(Math.round(input.width), 320, 2400);
  const height = clamp(Math.round(input.height), 320, 2400);
  const body = input.layers
    .filter((layer) => !layer.hidden)
    .map((layer) => renderLayer(layer, input, width, height))
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "<defs>",
    '<linearGradient id="badge-fallback" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0877D1"/><stop offset="1" stop-color="#12B8A6"/></linearGradient>',
    '<filter id="badge-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#10243E" flood-opacity=".18"/></filter>',
    "</defs>",
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    body,
    "</svg>"
  ].join("");
}

export async function renderBadgeSharePngDataUrl(input: BadgeShareRenderInput) {
  const svg = buildBadgeShareSvg(input);
  const png = await sharp(Buffer.from(svg), {
    failOn: "warning",
    limitInputPixels: 2400 * 2400
  }).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function renderLayer(
  layer: BadgeLayer,
  input: BadgeShareRenderInput,
  canvasWidth: number,
  canvasHeight: number
) {
  const x = clamp(layer.x, 0, canvasWidth - 1);
  const y = clamp(layer.y, 0, canvasHeight - 1);
  const width = clamp(layer.width, 1, canvasWidth - x);
  const height = clamp(layer.height, 1, canvasHeight - y);
  const opacity = clamp(layer.opacity ?? 1, 0, 1);
  const transform = rotationTransform(layer.rotation ?? 0, x, y, width, height);
  const common = `opacity="${opacity}"${transform}`;

  if (layer.type === "shape") {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${safeColor(layer.fill, "#12B8A6")}" ${common}/>`;
  }

  if (layer.type === "image") {
    const image = layer.assetId ? input.assetDataUrls.get(layer.assetId) : null;
    if (!image) return "";
    return renderImage(image, x, y, width, height, layer.objectFit ?? "contain", common);
  }

  if (layer.type === "badge") {
    if (input.badgeArtworkDataUrl) {
      return renderImage(input.badgeArtworkDataUrl, x, y, width, height, "contain", `${common} filter="url(#badge-shadow)"`);
    }
    const radius = Math.max(1, Math.min(width, height) / 2);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    return `<g ${common} filter="url(#badge-shadow)"><circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="url(#badge-fallback)"/><text x="${centerX}" y="${centerY + radius * 0.36}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${radius * 1.1}" fill="#ffffff">★</text></g>`;
  }

  if (layer.type === "decoration") {
    return `<text x="${x + width / 2}" y="${y + height * 0.76}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.min(width, height) * 0.82}" fill="${safeColor(layer.fill, "#F4B740")}" ${common}>✦</text>`;
  }

  const rawText = layer.type === "logo"
    ? layer.text?.trim() || input.context.organizationName
    : layer.text ?? "";
  const text = resolveBadgeShortcodes(rawText, input.context);
  return renderText(text, layer, x, y, width, height, common);
}

function renderImage(
  dataUrl: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: "contain" | "cover",
  common: string
) {
  const preserveAspectRatio = fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
  return `<image href="${escapeAttribute(dataUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${preserveAspectRatio}" ${common}/>`;
}

function renderText(
  value: string,
  layer: BadgeLayer,
  x: number,
  y: number,
  width: number,
  height: number,
  common: string
) {
  const fontSize = clamp(layer.fontSize ?? 32, 10, 240);
  const fontWeight = clamp(layer.fontWeight ?? 600, 100, 900);
  const align = layer.align ?? "center";
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const textX = align === "left" ? x + 12 : align === "right" ? x + width - 12 : x + width / 2;
  const lines = wrapText(value, Math.max(1, Math.floor((width - 24) / (fontSize * 0.56))));
  const lineHeight = fontSize * 1.18;
  const blockHeight = lines.length * lineHeight;
  const firstY = y + Math.max(fontSize, (height - blockHeight) / 2 + fontSize);
  const tspans = lines
    .map((line, index) => `<tspan x="${textX}" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<text text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${safeColor(layer.fill, "#10243E")}" ${common}>${tspans}</text>`;
}

function wrapText(value: string, maxCharacters: number) {
  const explicitLines = value.replace(/\r/g, "").split("\n");
  return explicitLines.flatMap((line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
      } else if (`${current} ${word}`.length <= maxCharacters) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }).slice(0, 12);
}

function rotationTransform(rotation: number, x: number, y: number, width: number, height: number) {
  const normalized = clamp(rotation, -180, 180);
  if (!normalized) return "";
  return ` transform="rotate(${normalized} ${x + width / 2} ${y + height / 2})"`;
}

function safeColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function escapeAttribute(value: string) {
  return value.replace(/[&"<>]/g, (character) => ({
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;"
  })[character] ?? character);
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[character] ?? character);
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}
