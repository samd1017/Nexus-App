import BulletList from "@tiptap/extension-bullet-list";
import type { BulletStyle } from "@/lib/markdown/bullet-styles";
import { isBulletStyle } from "@/lib/markdown/bullet-styles";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    styledBulletList: {
      setBulletStyle: (style: BulletStyle) => ReturnType;
    };
  }
}

/** Bullet list with selectable marker style (disc / circle / square / dash). */
export const StyledBulletList = BulletList.extend({
  name: "bulletList",

  addAttributes() {
    return {
      ...this.parent?.(),
      bulletStyle: {
        default: "disc" as BulletStyle,
        parseHTML: (element) => {
          const v = element.getAttribute("data-bullet");
          return isBulletStyle(v) ? v : "disc";
        },
        renderHTML: (attributes) => {
          const style = isBulletStyle(attributes.bulletStyle)
            ? attributes.bulletStyle
            : "disc";
          return { "data-bullet": style };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBulletStyle:
        (style: BulletStyle) =>
        ({ commands, editor }) => {
          if (!editor.isActive("bulletList")) {
            return commands.toggleBulletList()
              ? commands.updateAttributes("bulletList", { bulletStyle: style })
              : false;
          }
          return commands.updateAttributes("bulletList", { bulletStyle: style });
        },
    };
  },
});
