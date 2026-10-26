import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const packageDir = path.resolve(path.dirname(require.resolve("fantasticon")), "..");
const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8"));

if (manifest.version !== "4.1.0") {
  throw new Error(`Expected Fantasticon 4.1.0, found ${manifest.version}`);
}

const bundlePath = path.join(packageDir, "dist", "chunk-I73JJ2KG.js");
const bundle = await readFile(bundlePath, "utf8");
const original = "const files = await glob(globPath, {});";
// Fantasticon 4.1.0 passes Windows separators to glob, where backslashes escape pattern characters.
const replacement = "const files = await glob(globPath.replace(/\\\\/g, \"/\"), {});";

if (bundle.includes(replacement)) {
  process.exit(0);
}

if (!bundle.includes(original)) {
  throw new Error("Could not locate Fantasticon's SVG glob for the Windows path fix");
}

await writeFile(bundlePath, bundle.replace(original, replacement), "utf8");
