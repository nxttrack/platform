import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBadgeShareSvg,
  renderBadgeSharePngDataUrl
} from "../../apps/web/lib/domain/badge-share-renderer";
import { validateBadgeLayers } from "../../apps/web/lib/domain/badge-system-contract";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4uWQAAAABJRU5ErkJggg==";

test("share-renderer volgt laagvolgorde, shortcodes, artwork en veilige SVG-output", () => {
  const layers = validateBadgeLayers([
    { id: "background", type: "shape", x: 0, y: 0, width: 1080, height: 1080, fill: "url(javascript:bad)" },
    { id: "decoration", type: "image", assetId: "5a9403a7-44d5-4d7a-a593-b341f2046b49", x: 40, y: 40, width: 200, height: 200 },
    { id: "badge", type: "badge", x: 340, y: 260, width: 400, height: 400, rotation: 15 },
    { id: "title", type: "text", x: 80, y: 740, width: 920, height: 180, text: "{child_first_name} · {badge_name_gendered}", fill: "#10243e" },
    { id: "hidden", type: "text", x: 0, y: 0, width: 200, height: 80, text: "NIET TONEN", hidden: true }
  ], { height: 1080, width: 1080 });
  const svg = buildBadgeShareSvg({
    assetDataUrls: new Map([["5a9403a7-44d5-4d7a-a593-b341f2046b49", pixel]]),
    badgeArtworkDataUrl: pixel,
    context: {
      badgeDescription: "Mooi gezwommen",
      badgeName: "Plons & Pret",
      childFirstName: "Sam de Vries",
      gender: "unknown_legacy",
      organizationName: "De Waterlijn"
    },
    height: 1080,
    layers,
    width: 1080
  });

  assert.match(svg, /fill="#12B8A6"/);
  assert.match(svg, /Sam · Plons &amp; Pret/);
  assert.match(svg, /rotate\(15 /);
  assert.match(svg, /data:image\/png;base64/);
  assert.doesNotMatch(svg, /javascript|NIET TONEN/);
  assert.ok(svg.indexOf("<rect") < svg.indexOf("<image"));
  assert.ok(svg.lastIndexOf("<text") > svg.lastIndexOf("<image"));
});

test("share-renderer levert een echte PNG-data-URL", async () => {
  const result = await renderBadgeSharePngDataUrl({
    assetDataUrls: new Map(),
    context: {
      badgeDescription: "Mooi gezwommen",
      badgeName: "Eerste Plons",
      childFirstName: "Sam de Vries",
      gender: "unknown_legacy",
      organizationName: "De Waterlijn"
    },
    height: 320,
    layers: validateBadgeLayers([
      { id: "background", type: "shape", x: 0, y: 0, width: 320, height: 320, fill: "#ffffff" },
      { id: "title", type: "text", x: 20, y: 100, width: 280, height: 120, text: "{badge_name_gendered}" }
    ], { height: 320, width: 320 }),
    width: 320
  });

  assert.match(result, /^data:image\/png;base64,/);
  const bytes = Buffer.from(result.split(",")[1] ?? "", "base64");
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(bytes.length > 500);
});
