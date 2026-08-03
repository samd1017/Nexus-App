import Image from "@tiptap/extension-image";

/**
 * Image node that keeps a vault-relative path for clean Markdown
 * while allowing a blob/data preview URL in `src` for display.
 */
export const VaultImage = Image.extend({
  name: "image",
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      vaultSrc: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-vault-src") ||
          // relative path in src is the vault path
          (() => {
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
          })(),
        renderHTML: (attributes) => {
          if (!attributes.vaultSrc) return {};
          return { "data-vault-src": attributes.vaultSrc };
        },
      },
    };
  },
});
