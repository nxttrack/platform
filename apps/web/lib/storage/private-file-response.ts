import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type PrivateFileDisposition = "attachment" | "inline";

const safeMimeTypes = new Set([
  "application/octet-stream",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "video/mp4"
]);

export async function createPrivateFileResponse(input: {
  bucket: string;
  disposition?: PrivateFileDisposition;
  fileName: string;
  mimeType: string | null;
  path: string;
}) {
  const result = await createAdminClient().storage.from(input.bucket).download(input.path);
  if (result.error || !result.data) return null;

  const body = new Uint8Array(await result.data.arrayBuffer());
  const fileName = normalizeDownloadFileName(input.fileName);
  const mimeType = input.mimeType && safeMimeTypes.has(input.mimeType)
    ? input.mimeType
    : "application/octet-stream";

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": contentDisposition(input.disposition ?? "attachment", fileName),
      "Content-Length": String(body.byteLength),
      "Content-Type": mimeType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex"
    }
  });
}

function contentDisposition(disposition: PrivateFileDisposition, fileName: string) {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\;\r\n]/g, "_")
    .slice(0, 160) || "bestand";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function normalizeDownloadFileName(value: string) {
  return value
    .trim()
    .replace(/[/\\\r\n\0]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 180) || "bestand";
}
