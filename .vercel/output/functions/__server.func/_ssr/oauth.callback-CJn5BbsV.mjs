import { f as lazyRouteComponent, p as createFileRoute } from "../_libs/@tanstack/react-router+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/oauth.callback-CJn5BbsV.js
var $$splitComponentImporter = () => import("./oauth.callback-CZOk2Pqs.mjs");
var Route = createFileRoute("/oauth/callback")({
	component: lazyRouteComponent($$splitComponentImporter, "component"),
	ssr: false,
	validateSearch: (search) => ({
		code: typeof search.code === "string" ? search.code : void 0,
		state: typeof search.state === "string" ? search.state : void 0,
		error: typeof search.error === "string" ? search.error : void 0
	})
});
//#endregion
export { Route as t };
