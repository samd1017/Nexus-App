/**
 * Slash insert used to throw when the placeholder decoration set was mapped.
 * Stock @tiptap placeholder still throws on undo; SafePlaceholder must not,
 * and undo must restore the slash paragraph.
 */
import assert from "node:assert/strict";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorState } from "@tiptap/pm/state";
import { SafePlaceholder } from "../safe-placeholder.ts";

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note" } };
  },
  addCommands() {
    return {
      setCallout:
        (kind) =>
        ({ commands, editor }) => {
          if (editor.isActive("callout")) {
            return commands.updateAttributes("callout", { kind });
          }
          if (commands.wrapIn(this.name, { kind })) return true;
          return commands.insertContent({
            type: this.name,
            attrs: { kind },
            content: [{ type: "paragraph" }],
          });
        },
    };
  },
});

function boot(placeholder) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: { depth: 20 } }),
      Callout,
      placeholder.configure({
        showOnlyCurrent: true,
        includeChildren: true,
        showOnlyWhenEditable: false,
        placeholder: "Start writing…",
      }),
    ],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "/" }] }],
    },
  });
  editor.view.updateState(
    EditorState.create({
      doc: editor.state.doc,
      schema: editor.schema,
      plugins: editor.extensionManager.plugins,
    }),
  );
  return editor;
}

function slashCallout(editor) {
  editor.commands.setTextSelection(2);
  return editor.chain().deleteRange({ from: 1, to: 2 }).setCallout("note").run();
}

{
  const stock = boot(Placeholder);
  assert.equal(slashCallout(stock), true);
  assert.match(stock.state.doc.toString(), /callout/);
  assert.throws(() => stock.commands.undo(), /Position -1 outside of fragment/);
  assert.match(stock.state.doc.toString(), /callout/);
}

{
  const safe = boot(SafePlaceholder);
  assert.equal(slashCallout(safe), true);
  assert.match(safe.state.doc.toString(), /callout/);
  assert.equal(safe.commands.undo(), true);
  assert.equal(safe.state.doc.toString(), 'doc(paragraph("/"))');
  assert.equal(safe.commands.redo(), true);
  assert.match(safe.state.doc.toString(), /callout/);
  assert.equal(safe.commands.undo(), true);
  assert.equal(safe.state.doc.toString(), 'doc(paragraph("/"))');
}

console.log("safe-placeholder: PASS");
