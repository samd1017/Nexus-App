import { r as __toESM } from "../_runtime.mjs";
import { r as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { O as redirect, c as HeadContent, d as Outlet, f as lazyRouteComponent, m as createRootRoute, p as createFileRoute, s as Scripts, u as createRouter } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { n as TriangleAlert } from "../_libs/lucide-react.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-Bhyr-EaX.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: error.message || "An unexpected error occurred. Try reloading the page."
			})
		]
	});
}
/**
* Top branding bar for deployed apps. Visibility is deploy-controlled via
* VITE_* env (inlined by Vite at build time). Defaults off.
*/
var BANNER_HEIGHT = "2.25rem";
var BANNER_HEIGHT_VAR = "--grok-banner-h";
function readEnv(key) {
	const fromVite = {
		"BASE_URL": "/",
		"DEV": false,
		"MODE": "production",
		"PROD": true,
		"SSR": true,
		"TSS_DEV_SERVER": "false",
		"TSS_DEV_SSR_STYLES_BASEPATH": "/",
		"TSS_DEV_SSR_STYLES_ENABLED": "true",
		"TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false",
		"TSS_INLINE_CSS_ENABLED": "false",
		"TSS_ROUTER_BASEPATH": "",
		"TSS_SERVER_FN_BASE": "/_serverFn/",
		"VITE_DEV_SERVER_HOST": "0.0.0.0"
	}[key];
	if (fromVite !== void 0 && fromVite !== "") return fromVite;
}
function envFlag(key, defaultValue) {
	const raw = readEnv(key);
	if (raw === void 0) return defaultValue;
	const v = raw.trim().toLowerCase();
	if (v === "true" || v === "1" || v === "yes") return true;
	if (v === "false" || v === "0" || v === "no") return false;
	return defaultValue;
}
function RemixIcon() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 14 14",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		className: "block size-3.5 shrink-0",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M2.85059 3.5C3.42171 3.49757 3.9879 3.74949 4.36816 4.17562C5.82851 5.79822 7.28852 7.42134 8.74886 9.04394C8.91014 9.22468 9.14982 9.3323 9.39201 9.33333C9.39445 9.33335 9.39697 9.33333 9.39941 9.33333C9.69335 9.33354 9.98729 9.34136 10.2812 9.35612L9.50423 8.5791L10.3291 7.75423L12.4915 9.91667L10.3291 12.0791L9.50423 11.2542L10.2812 10.4766C9.98728 10.4914 9.69336 10.4998 9.39941 10.5C9.39371 10.5 9.38802 10.5 9.38232 10.5C8.81697 10.4976 8.25832 10.2462 7.88184 9.82438C6.42149 8.20178 4.96148 6.57866 3.50114 4.95605C3.33823 4.77345 3.09529 4.66561 2.85059 4.66667H1.75V3.5H2.85059Z",
				fill: "#417CFF"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M5.53597 8.52612C5.14663 8.95882 4.75754 9.39174 4.36816 9.82438C3.9879 10.2505 3.42171 10.5024 2.85059 10.5H1.75V9.33333H2.85059C3.09529 9.33439 3.33823 9.22655 3.50114 9.04394C3.91804 8.58073 4.33469 8.11725 4.75155 7.65397L5.53597 8.52612Z",
				fill: "#417CFF"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M12.4915 4.08333L10.3291 6.24577L9.50423 5.4209L10.2801 4.64445C9.99185 4.65884 9.70361 4.66667 9.41536 4.66667H9.39941C9.15471 4.66561 8.91177 4.77346 8.74886 4.95605C8.33197 5.41926 7.91473 5.88219 7.49788 6.34546L6.71346 5.47331C7.10279 5.04063 7.49247 4.60825 7.88184 4.17562C8.2621 3.74949 8.8283 3.49757 9.39941 3.5H9.41536C9.7036 3.5 9.99186 3.50726 10.2801 3.52165L9.50423 2.74577L10.3291 1.9209L12.4915 4.08333Z",
				fill: "#417CFF"
			})
		]
	});
}
function CreatedWithGrokBanner() {
	const showBanner = envFlag("VITE_SHOW_BUILT_WITH_GROK", false);
	(0, import_react.useLayoutEffect)(() => {
		if (!showBanner || typeof document === "undefined") return;
		const root = document.documentElement;
		root.style.setProperty(BANNER_HEIGHT_VAR, BANNER_HEIGHT);
		return () => {
			root.style.removeProperty(BANNER_HEIGHT_VAR);
		};
	}, [showBanner]);
	if (!showBanner) return null;
	const projectId = (readEnv("VITE_PROJECT_ID") ?? "").trim();
	const showRemix = envFlag("VITE_ALLOW_FORKING", false) && projectId.length > 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "h-9 w-full shrink-0",
		"aria-hidden": true
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed top-0 left-0 right-0 z-[100] flex h-9 w-full items-center justify-center gap-4 bg-black px-3 text-[13px] leading-none text-white/90",
		"data-created-with-grok-banner": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: "https://grok.com?m=build",
				target: "_blank",
				rel: "noopener noreferrer",
				className: "absolute inset-0",
				"aria-label": "Created with Grok"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "relative z-10 pointer-events-none select-none font-medium tracking-tight text-white/80",
				children: "Created with Grok"
			}),
			showRemix ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
				href: `https://grok.com/remix?projectId=${encodeURIComponent(projectId)}`,
				target: "_blank",
				rel: "noopener noreferrer",
				className: "relative z-10 inline-flex h-6 items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-white/15",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RemixIcon, {}), "Remix"]
			}) : null
		]
	})] });
}
var styles_default = "/assets/styles-BqjDUlWw.css";
var APP_NAME = "Note App";
var Route$2 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Local-first personal knowledge vault — plain Markdown, visual editor, live graph, Hermes-compatible. Zero accounts by default."
			},
			...[]
		],
		links: [{
			rel: "stylesheet",
			href: styles_default
		}]
	}),
	component: RootDocument
});
function RootDocument() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "en",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "bg-[var(--bg-deepest,#050507)] text-[var(--text-primary,#f2f2f7)]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreatedWithGrokBanner, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
			]
		})]
	});
}
var $$splitComponentImporter$1 = () => import("./routes-BPoqy4AV.mjs");
var Route$1 = createFileRoute("/")({
	component: lazyRouteComponent($$splitComponentImporter$1, "component"),
	ssr: false
});
var $$splitComponentImporter = () => import("./oauth.callback-CJRHEZmK.mjs");
/**
* Legacy OAuth callback — cloud uses synced folders only.
* Redirect home so old bookmarks never blank-screen.
*/
var Route = createFileRoute("/oauth/callback")({
	ssr: false,
	beforeLoad: () => {
		throw redirect({ to: "/" });
	},
	component: lazyRouteComponent($$splitComponentImporter, "component")
});
var rootRouteChildren = {
	IndexRoute: Route$1.update({
		id: "/",
		path: "/",
		getParentRoute: () => Route$2
	}),
	OauthCallbackRoute: Route.update({
		id: "/oauth/callback",
		path: "/oauth/callback",
		getParentRoute: () => Route$2
	})
};
var routeTree = Route$2._addFileChildren(rootRouteChildren)._addFileTypes();
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent,
		defaultPreload: "intent"
	});
}
//#endregion
export { getRouter };
