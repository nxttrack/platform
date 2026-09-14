// PostgreSQL accepts both $$ and named dollar quotes in function bodies.
// Match the corresponding closing delimiter so adjacent functions stay separate.
export function sqlFunctionBlocks(sql) {
  const pattern = /create\s+(?:or\s+replace\s+)?function\s+[\s\S]*?(\$(?:[a-z_][a-z0-9_]*)?\$)[\s\S]*?\1\s*;/gi;
  return Array.from(sql.matchAll(pattern), (match) => {
    const block = match[0];
    const header = block.slice(0, block.indexOf(match[1]));
    const name = header.match(/create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/i)?.[1];
    return {
      name: name?.toLowerCase() ?? "unknown function",
      securityDefiner: /\bsecurity\s+definer\b/i.test(header),
      explicitSearchPath: /\bset\s+search_path\s*(?:=|\bto\b)/i.test(header)
    };
  });
}
