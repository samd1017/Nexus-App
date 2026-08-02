import { n as require_jsx_runtime } from "../_libs/radix-ui__react-context+react.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/NexusLogo-DEtBYVdt.js
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function formatRelativeTime(ts) {
	const diff = Date.now() - ts;
	const sec = Math.floor(diff / 1e3);
	if (sec < 5) return "just now";
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return `${Math.floor(hr / 24)}d ago`;
}
function slugifyTitle(title) {
	return title.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 120);
}
var SIZE_PX = {
	xs: 16,
	sm: 20,
	md: 28,
	lg: 40,
	xl: 56
};
/**
* Nexus mark — 3D extruded N monogram (steel + cyan nexus node).
* SpaceX-adjacent: hard edges, metal faces, controlled cyan accent.
* Reads at 16px (simplified) and large (full bevel).
*/
function NexusMark({ size = "md", className, title = "Nexus" }) {
	const px = typeof size === "number" ? size : SIZE_PX[size];
	const uid = `nx${px}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		width: px,
		height: px,
		viewBox: "0 0 32 32",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		className: cn("nexus-mark shrink-0", className),
		role: "img",
		"aria-label": title,
		style: { filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45)) drop-shadow(0 0 10px rgba(0,200,255,0.18))" },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: title }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `${uid}-face`,
					x1: "6",
					y1: "4",
					x2: "26",
					y2: "28",
					gradientUnits: "userSpaceOnUse",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: "#f4f6fa"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "38%",
							stopColor: "#c8ced8"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "72%",
							stopColor: "#8a929e"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: "#5a6270"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `${uid}-hi`,
					x1: "8",
					y1: "6",
					x2: "14",
					y2: "22",
					gradientUnits: "userSpaceOnUse",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "0%",
						stopColor: "#ffffff",
						stopOpacity: "0.95"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "100%",
						stopColor: "#ffffff",
						stopOpacity: "0.15"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `${uid}-depth`,
					x1: "10",
					y1: "10",
					x2: "24",
					y2: "26",
					gradientUnits: "userSpaceOnUse",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "0%",
						stopColor: "#3a4250"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "100%",
						stopColor: "#12151c"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `${uid}-plate`,
					x1: "2",
					y1: "2",
					x2: "30",
					y2: "30",
					gradientUnits: "userSpaceOnUse",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: "#1c222c"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "55%",
							stopColor: "#0c0e14"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: "#06070a"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `${uid}-rim`,
					x1: "2",
					y1: "2",
					x2: "28",
					y2: "28",
					gradientUnits: "userSpaceOnUse",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: "#6a7484"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "50%",
							stopColor: "#2a303a"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: "#00c8ff",
							stopOpacity: "0.55"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("radialGradient", {
					id: `${uid}-node`,
					cx: "50%",
					cy: "40%",
					r: "60%",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: "#9aeeff"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "45%",
							stopColor: "#00c8ff"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: "#007a9e"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("filter", {
					id: `${uid}-glow`,
					x: "-40%",
					y: "-40%",
					width: "180%",
					height: "180%",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("feGaussianBlur", {
						stdDeviation: "1.1",
						result: "b"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("feMerge", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("feMergeNode", { in: "b" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("feMergeNode", { in: "SourceGraphic" })] })]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "1",
				y: "1.5",
				width: "29",
				height: "29",
				rx: "7.5",
				fill: `url(#${uid}-depth)`,
				opacity: "0.9"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "1",
				width: "29",
				height: "29",
				rx: "7.5",
				fill: `url(#${uid}-plate)`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
				x: "2",
				y: "2",
				width: "28",
				height: "28",
				rx: "7",
				stroke: `url(#${uid}-rim)`,
				strokeWidth: "1",
				fill: "none"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M5 8.5C6.5 4.5 10 3 16 3c7 0 11 2.2 12.5 6.5",
				stroke: `url(#${uid}-hi)`,
				strokeWidth: "1.2",
				strokeLinecap: "round",
				opacity: "0.45"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M10.2 24.4V9.1h2.5L21.8 20.2V9.1H24.4v15.3h-2.5L12.7 12.1v12.3H10.2Z",
				fill: `url(#${uid}-depth)`,
				opacity: "0.95"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M9 23.2V7.8h2.55L21.2 19.5V7.8H23.8v15.4h-2.55L11.55 11V23.2H9Z",
				fill: `url(#${uid}-face)`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M9.35 8.2v14.4",
				stroke: `url(#${uid}-hi)`,
				strokeWidth: "0.85",
				strokeLinecap: "round",
				opacity: "0.55"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", {
				filter: `url(#${uid}-glow)`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", {
						cx: "16.3",
						cy: "16.7",
						rx: "2.6",
						ry: "1.1",
						fill: "#00c8ff",
						opacity: "0.28"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
						cx: "16",
						cy: "15.7",
						r: "2.35",
						fill: `url(#${uid}-node)`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
						cx: "15.35",
						cy: "15.05",
						r: "0.85",
						fill: "#e8fbff",
						opacity: "0.75"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
						cx: "16",
						cy: "15.7",
						r: "3.55",
						stroke: "#00c8ff",
						strokeOpacity: "0.45",
						strokeWidth: "0.85",
						fill: "none"
					})
				]
			})
		]
	});
}
/** Mark + 3D metallic NEXUS wordmark */
function NexusWordmark({ size = "sm", className, showMark = true, markClassName }) {
	const markSize = size === "xl" ? "lg" : size === "lg" ? "md" : size;
	const textClass = size === "xl" ? "text-[22px] tracking-[-0.03em]" : size === "lg" ? "text-[18px] tracking-[-0.02em]" : size === "md" ? "text-[15px] tracking-[-0.02em]" : "text-[13px] tracking-tight";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: cn("inline-flex items-center gap-2", className),
		children: [showMark ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NexusMark, {
			size: markSize,
			className: cn("text-[var(--text-primary)]", markClassName)
		}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: cn("nexus-wordmark font-semibold select-none", textClass),
			"aria-label": "Nexus",
			children: "Nexus"
		})]
	});
}
var NEXUS_NAME = "Nexus";
var NEXUS_TAGLINE = "Notes for Humans and Agents";
//#endregion
export { cn as a, NexusWordmark as i, NEXUS_TAGLINE as n, formatRelativeTime as o, NexusMark as r, slugifyTitle as s, NEXUS_NAME as t };
