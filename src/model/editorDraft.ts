// Local editor state only: never part of a backup or a cloud snapshot.
export interface EditorDraft {
  key: string;
  value: string;
  baseline: string;
  updatedAt: string;
}
