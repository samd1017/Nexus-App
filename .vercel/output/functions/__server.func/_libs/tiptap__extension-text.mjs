import { o as Node3 } from "./@tiptap/core+[...].mjs";
//#region node_modules/@tiptap/extension-text/dist/index.js
var Text = Node3.create({
	name: "text",
	group: "inline",
	parseMarkdown: (token) => {
		return {
			type: "text",
			text: token.text || ""
		};
	},
	renderMarkdown: (node) => node.text || ""
});
//#endregion
export { Text as t };
