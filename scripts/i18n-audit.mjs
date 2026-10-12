import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const messagesPath = join(root, "src/i18n/messages.ts");
const source = readFileSync(messagesPath, "utf8");

const dictionaries = new Map();

for (const locale of ["es", "fr", "de", "pt", "ja"]) {
  const start = source.indexOf(`const ${locale} = {`);
  if (start < 0) continue;
  const end = source.indexOf("} satisfies Record<string, string>;", start);
  if (end < 0) continue;
  const block = source.slice(start, end);
  dictionaries.set(locale, new Set([...block.matchAll(/^\s*"((?:\\.|[^"])*)":/gm)].map((match) => match[1])));
}
const extraPath = join(root, "src/i18n/extra-messages.ts");
const extra = readFileSync(extraPath, "utf8");
for (const locale of ["hi", "mr", "it", "ko", "zh", "ar"]) {
  const start = extra.indexOf('const common = {');
  const end = extra.indexOf("} as const;", start);
  const common = extra.slice(start, end);
  dictionaries.set(locale, new Set([...common.matchAll(/^\s*"((?:\\.|[^"])*)":/gm)].map((match) => match[1])));
}

const appRoot = join(root, "app");
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name)) files.push(path);
  }
}
walk(appRoot);

const used = new Set();
for (const path of files) {
  const content = readFileSync(path, "utf8");
  for (const match of content.matchAll(/\bt\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) used.add(match[1]);
}
const keys = [...used].sort();
let missingTotal = 0;
console.log(`Found ${keys.length} literal translation keys across ${files.length} app files.\n`);
for (const [locale, translated] of dictionaries) {
  const missing = keys.filter((key) => !translated.has(key));
  missingTotal += missing.length;
  console.log(`${locale}: ${keys.length - missing.length}/${keys.length} keys covered; ${missing.length} missing`);
  if (missing.length) console.log(missing.map((key) => `  - ${key}`).join("\n"));
}
console.log(`\nTotal missing locale-key entries: ${missingTotal}`);
if (missingTotal > 0) process.exitCode = 1;
