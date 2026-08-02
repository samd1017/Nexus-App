//#region node_modules/accessor-fn/dist/accessor-fn.mjs
var index = (function(p) {
	return typeof p === "function" ? p : typeof p === "string" ? function(obj) {
		return obj[p];
	} : function(obj) {
		return p;
	};
});
//#endregion
export { index as t };
