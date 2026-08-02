import { r as __toESM } from "../_runtime.mjs";
import { r as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { h as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as Route } from "./oauth.callback-CJn5BbsV.mjs";
import { r as completeCloudOAuth, v as useVaultStore } from "./store-D0ChvofP.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/oauth.callback-CZOk2Pqs.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function OAuthCallback() {
	const { code, state, error } = Route.useSearch();
	const navigate = useNavigate();
	const refreshCloudSession = useVaultStore((s) => s.refreshCloudSession);
	const setToast = useVaultStore((s) => s.setToast);
	const [status, setStatus] = (0, import_react.useState)("Completing cloud connection…");
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		(async () => {
			if (error) {
				setStatus(`OAuth error: ${error}`);
				return;
			}
			if (!code || !state) {
				setStatus("Missing OAuth code. You can close this tab.");
				return;
			}
			const result = await completeCloudOAuth(code, state);
			if (cancelled) return;
			if (result.ok) {
				refreshCloudSession();
				setToast("Cloud connected — tokens stored locally only");
				setStatus("Connected. Redirecting…");
				navigate({ to: "/" });
			} else setStatus(result.reason || "OAuth failed");
		})();
		return () => {
			cancelled = true;
		};
	}, [
		code,
		state,
		error,
		navigate,
		refreshCloudSession,
		setToast
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] items-center justify-center bg-[#050507] px-6 text-center",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "glass-elevated max-w-md rounded-2xl p-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mx-auto mb-4 h-10 w-10 animate-pulse rounded-xl bg-[rgba(0,200,255,0.2)]" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[14px] text-[#a1a1aa]",
				children: status
			})]
		})
	});
}
//#endregion
export { OAuthCallback as component };
