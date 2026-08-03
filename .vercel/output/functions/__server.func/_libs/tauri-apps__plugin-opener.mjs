import { n as __exportAll } from "../_runtime.mjs";
import { a as invoke } from "./tauri-apps__api.mjs";
//#region node_modules/@tauri-apps/plugin-opener/dist-js/index.js
var dist_js_exports = /* @__PURE__ */ __exportAll({ revealItemInDir: () => revealItemInDir });
/**
* Reveal a path with the system's default explorer.
*
* #### Platform-specific:
*
* - **Android / iOS:** Unsupported.
*
* @example
* ```typescript
* import { revealItemInDir } from '@tauri-apps/plugin-opener';
* await revealItemInDir('/path/to/file');
* await revealItemInDir([ '/path/to/file', '/path/to/another/file' ]);
* ```
*
* @param path The path to reveal.
*
* @since 2.0.0
*/
async function revealItemInDir(path) {
	return invoke("plugin:opener|reveal_item_in_dir", { paths: typeof path === "string" ? [path] : path });
}
//#endregion
export { dist_js_exports as t };
