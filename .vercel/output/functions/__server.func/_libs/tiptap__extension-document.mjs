import { o as Node3 } from "./@tiptap/core+[...].mjs";
//#region node_modules/@tiptap/extension-document/dist/index.js
var Document = Node3.create({
	name: "doc",
	topNode: true,
	content: "block+",
	renderMarkdown: (node, h) => {
		if (!node.content) return "";
		return h.renderChildren(node.content, "\n\n");
	}
});
//#endregion
export { Document as t };
