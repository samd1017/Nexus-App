import Image from "@tiptap/extension-image";
import type { NodeViewRendererProps } from "@tiptap/core";

export type ImageAlign = "left" | "center" | "right";

const MIN_W = 80;
const MAX_W = 1200;

function clampWidth(n: number): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(n)));
}

/**
 * Vault image with resize handle + alignment.
 * Stores width/align for round-trip (HTML img when sized; clean MD when default).
 */
export const VaultImage = Image.extend({
  name: "image",
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      vaultSrc: {
        default: null,
        parseHTML: (element) => {
          const vault = element.getAttribute("data-vault-src");
          if (vault) return vault;
          const src = element.getAttribute("src") || "";
          if (
            src &&
            !src.startsWith("http") &&
            !src.startsWith("data:") &&
            !src.startsWith("blob:")
          ) {
            return src;
          }
          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.vaultSrc) return {};
          return { "data-vault-src": attributes.vaultSrc as string };
        },
      },
      width: {
        default: null as number | null,
        parseHTML: (element) => {
          const w =
            element.getAttribute("width") ||
            element.getAttribute("data-width") ||
            element.style.width;
          if (!w) return null;
          const n = parseInt(String(w), 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return {
            width: String(attributes.width),
            "data-width": String(attributes.width),
            style: `width: ${attributes.width}px; height: auto;`,
          };
        },
      },
      align: {
        default: "center" as ImageAlign,
        parseHTML: (element) => {
          const a =
            element.getAttribute("data-align") ||
            element.getAttribute("data-image-align");
          if (a === "left" || a === "right" || a === "center") return a;
          const style = element.getAttribute("style") || "";
          if (style.includes("float: left") || style.includes("float:left"))
            return "left";
          if (style.includes("float: right") || style.includes("float:right"))
            return "right";
          return "center";
        },
        renderHTML: (attributes) => {
          const align = (attributes.align as ImageAlign) || "center";
          return { "data-align": align };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }: NodeViewRendererProps) => {
      const wrap = document.createElement("div");
      wrap.className = "nexus-image-wrap";
      wrap.setAttribute("data-align", node.attrs.align || "center");
      wrap.contentEditable = "false";

      const frame = document.createElement("div");
      frame.className = "nexus-image-frame";

      const img = document.createElement("img");
      img.className = "nexus-image-el";
      img.draggable = false;
      img.alt = node.attrs.alt || "";
      if (node.attrs.vaultSrc) {
        img.setAttribute("data-vault-src", node.attrs.vaultSrc);
      }
      img.src = node.attrs.src || node.attrs.vaultSrc || "";
      if (node.attrs.width) {
        img.style.width = `${node.attrs.width}px`;
        img.setAttribute("width", String(node.attrs.width));
      }
      img.style.height = "auto";
      img.style.maxWidth = "100%";
      img.style.display = "block";

      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "nexus-image-handle";
      handle.title = "Drag to resize";
      handle.setAttribute("aria-label", "Resize image");
      handle.tabIndex = -1;

      const toolbar = document.createElement("div");
      toolbar.className = "nexus-image-toolbar";
      toolbar.innerHTML = `
        <button type="button" data-act="smaller" title="Smaller">−</button>
        <button type="button" data-act="larger" title="Larger">+</button>
        <span class="nexus-image-sep"></span>
        <button type="button" data-act="left" title="Align left">⟸</button>
        <button type="button" data-act="center" title="Align center">☰</button>
        <button type="button" data-act="right" title="Align right">⟹</button>
        <span class="nexus-image-sep"></span>
        <button type="button" data-act="reset" title="Reset size">↺</button>
      `;

      frame.appendChild(img);
      frame.appendChild(handle);
      frame.appendChild(toolbar);
      wrap.appendChild(frame);

      const applyAlign = (align: ImageAlign) => {
        wrap.setAttribute("data-align", align);
      };
      applyAlign((node.attrs.align as ImageAlign) || "center");

      let current = node;

      const setAttrs = (attrs: Record<string, unknown>) => {
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            const existing = tr.doc.nodeAt(pos);
            if (!existing || existing.type.name !== "image") return false;
            tr.setNodeMarkup(pos, undefined, {
              ...existing.attrs,
              ...attrs,
            });
            return true;
          })
          .run();
      };

      const currentWidth = () => {
        if (current.attrs.width) return Number(current.attrs.width);
        return img.getBoundingClientRect().width || img.naturalWidth || 320;
      };

      toolbar.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      toolbar.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const btn = (e.target as HTMLElement).closest(
          "button[data-act]",
        ) as HTMLElement | null;
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        if (act === "smaller") {
          const w = clampWidth(currentWidth() * 0.85);
          img.style.width = `${w}px`;
          setAttrs({ width: w });
        } else if (act === "larger") {
          const w = clampWidth(currentWidth() * 1.15);
          img.style.width = `${w}px`;
          setAttrs({ width: w });
        } else if (act === "left" || act === "center" || act === "right") {
          applyAlign(act);
          setAttrs({ align: act });
        } else if (act === "reset") {
          img.style.width = "";
          img.removeAttribute("width");
          setAttrs({ width: null, align: "center" });
          applyAlign("center");
        }
      });

      let dragging = false;
      let startX = 0;
      let startW = 0;

      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const next = clampWidth(startW + dx);
        img.style.width = `${next}px`;
      };

      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        wrap.classList.remove("is-resizing");
        const w = clampWidth(img.getBoundingClientRect().width);
        img.style.width = `${w}px`;
        setAttrs({ width: w });
      };

      handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        startX = e.clientX;
        startW = currentWidth();
        wrap.classList.add("is-resizing");
        handle.setPointerCapture(e.pointerId);
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      return {
        dom: wrap,
        selectNode: () => {
          wrap.classList.add("is-selected");
        },
        deselectNode: () => {
          wrap.classList.remove("is-selected");
        },
        update: (updated) => {
          if (updated.type.name !== "image") return false;
          current = updated;
          const vault = updated.attrs.vaultSrc as string | null;
          if (vault) img.setAttribute("data-vault-src", vault);
          if (updated.attrs.src) {
            const nextSrc = updated.attrs.src as string;
            if (
              !img.src.startsWith("blob:") ||
              nextSrc.startsWith("blob:") ||
              nextSrc.startsWith("data:")
            ) {
              if (img.getAttribute("src") !== nextSrc) img.src = nextSrc;
            }
          } else if (vault && !img.src) {
            img.src = vault;
          }
          img.alt = updated.attrs.alt || "";
          if (updated.attrs.width) {
            img.style.width = `${updated.attrs.width}px`;
            img.setAttribute("width", String(updated.attrs.width));
          } else if (!wrap.classList.contains("is-resizing")) {
            img.style.width = "";
            img.removeAttribute("width");
          }
          applyAlign((updated.attrs.align as ImageAlign) || "center");
          return true;
        },
        destroy: () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        },
        stopEvent: (event) => {
          const t = event.target as HTMLElement;
          return (
            t === handle ||
            handle.contains(t) ||
            t === toolbar ||
            toolbar.contains(t)
          );
        },
        ignoreMutation: () => true,
      };
    };
  },
});
