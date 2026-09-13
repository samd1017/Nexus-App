import { Group, Panel, Separator } from "react-resizable-panels";
import { EditorPane } from "@/components/editor/EditorPane";
import { useVaultStore } from "@/lib/vault/store";

/** One or two note editors. Split is two notes — not source+preview. */
export function Workspace() {
  const workspaceSplit = useVaultStore((s) => s.settings.workspaceSplit);
  const secondaryNoteId = useVaultStore((s) => s.secondaryNoteId);
  const split = workspaceSplit && Boolean(secondaryNoteId);

  if (!split) {
    return <EditorPane pane="primary" />;
  }

  return (
    <Group
      orientation="horizontal"
      className="nexus-workspace min-w-0 flex-1"
    >
      <Panel defaultSize="50%" minSize="28%" className="min-w-0">
        <EditorPane pane="primary" />
      </Panel>
      <Separator className="nexus-workspace-handle" />
      <Panel defaultSize="50%" minSize="28%" className="min-w-0">
        <EditorPane pane="secondary" noteId={secondaryNoteId} />
      </Panel>
    </Group>
  );
}
