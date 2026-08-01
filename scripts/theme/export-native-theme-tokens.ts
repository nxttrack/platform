import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { portalThemeCatalog } from "../../apps/web/lib/theme/portal-theme-registry";
import { toNativeThemeTokenExport } from "../../apps/web/lib/theme/portal-theme-web";

const outputDirectory = path.resolve(import.meta.dirname, "../../contracts/parent-portal/generated");

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  for (const manifest of portalThemeCatalog) {
    const output = toNativeThemeTokenExport(manifest);
    const file = path.join(outputDirectory, `${manifest.theme.key}-${manifest.theme.release}.json`);
    await writeFile(file, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
}

void main();
