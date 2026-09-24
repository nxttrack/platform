import manifestSchema from "./source-schemas/package-v1-manifest.json";
import themeSchema from "./source-schemas/package-v1-theme.json";
import assetsSchema from "./source-schemas/package-v1-assets.json";

type Schema = boolean | {
  type?: string | string[]; const?: unknown; enum?: unknown[];
  minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number;
  minItems?: number; maxItems?: number; prefixItems?: Schema[]; items?: Schema;
  minProperties?: number; maxProperties?: number; required?: string[]; properties?: Record<string, Schema>;
  propertyNames?: Schema; additionalProperties?: Schema;
};

/** Only repository-owned schemas; no uploaded schemas, $ref resolution or remote access. */
export function assertThemeSourceSchema(input: unknown, kind: "manifest" | "theme" | "assets"): void {
  const schema: Schema = { manifest: manifestSchema, theme: themeSchema, assets: assetsSchema }[kind];
  const issues: string[] = [];
  function check(value: unknown, rule: Schema, path: string, depth: number) {
    if (issues.length >= 12) return;
    if (depth > 24) { issues.push(`${path}: nesting limit`); return; }
    if (typeof rule === "boolean") { if (!rule) issues.push(`${path}: unsupported field`); return; }
    const types = typeof rule.type === "string" ? [rule.type] : rule.type ?? [];
    const is = (type: string) => type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
      : type === "array" ? Array.isArray(value) : type === "null" ? value === null
      : type === "number" ? typeof value === "number" && Number.isFinite(value) : type === "integer" ? Number.isInteger(value) : typeof value === type;
    if (types.length && !types.some(is)) { issues.push(`${path}: expected ${types.join("/")}`); return; }
    if (rule.const !== undefined && value !== rule.const) issues.push(`${path}: unsupported contract value`);
    if (rule.enum && !rule.enum.includes(value)) issues.push(`${path}: unsupported value`);
    if (typeof value === "string" && ((rule.minLength !== undefined && value.length < rule.minLength) || (rule.maxLength !== undefined && value.length > rule.maxLength) || (rule.pattern && !new RegExp(rule.pattern).test(value)))) issues.push(`${path}: invalid text`);
    if (typeof value === "number" && (!Number.isFinite(value) || (rule.minimum !== undefined && value < rule.minimum) || (rule.maximum !== undefined && value > rule.maximum))) issues.push(`${path}: out of range`);
    if (Array.isArray(value)) {
      if ((rule.minItems !== undefined && value.length < rule.minItems) || (rule.maxItems !== undefined && value.length > rule.maxItems)) issues.push(`${path}: invalid item count`);
      value.forEach((child, index) => check(child, rule.prefixItems?.[index] ?? rule.items ?? true, `${path}/${index}`, depth + 1));
    } else if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if ((rule.minProperties !== undefined && entries.length < rule.minProperties) || (rule.maxProperties !== undefined && entries.length > rule.maxProperties)) issues.push(`${path}: invalid field count`);
      for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) issues.push(`${path}/${key}: missing field`);
      for (const [key, child] of entries) {
        if (["__proto__", "prototype", "constructor"].includes(key)) { issues.push(`${path}: reserved key`); continue; }
        if (rule.propertyNames) check(key, rule.propertyNames, `${path}/${key}`, depth + 1);
        check(child, rule.properties && Object.hasOwn(rule.properties, key) ? rule.properties[key] : rule.additionalProperties ?? true, `${path}/${key}`, depth + 1);
      }
    }
  }
  check(input, schema, kind, 0);
  if (issues.length) throw new Error(`Invalid ${kind}: ${issues.join("; ")}`);
}
