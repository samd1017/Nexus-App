import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Let Node and tsx import the shared schema file as a default string. */
export async function load(url, context, nextLoad) {
  const path = sqlPath(url);
  if (!path) return nextLoad(url, context);
  const text = readFileSync(path, "utf8");
  return {
    format: "module",
    source: `export default ${JSON.stringify(text)};\n`,
    shortCircuit: true,
  };
}

function sqlPath(url) {
  const bare = url.split("?")[0];
  if (!bare.endsWith(".sql")) return null;
  try {
    return fileURLToPath(bare);
  } catch {
    return bare.startsWith("/") ? bare : null;
  }
}
