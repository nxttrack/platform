export type SavedViewState = {
  filters: Array<{ id: string; value: unknown }>;
  sorting: Array<{ id: string; desc: boolean }>;
  visibility: Record<string, boolean>;
};

export type SavedView = {
  id: string;
  isDefault: boolean;
  name: string;
  state: SavedViewState;
};

export type SavedViewResult =
  | { ok: true; views: SavedView[] }
  | { ok: false; error: string };
