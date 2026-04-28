import { withUpdater } from "../utils";
import type { AppState, SliceSetter } from "../types";

export const createTaskDrawerSlice = (set: SliceSetter): Partial<AppState> => ({
  drawerDraft: null,
  drawerCommentBody: "",
  drawerActivityTab: "comments",
  drawerCommentComposerOpen: false,
  drawerDevPanel: null,
  drawerIsUploadingDescription: false,
  drawerIsUploadingComment: false,
  drawerIsEditingTitle: false,
  drawerDescriptionDirty: false,
  drawerIsAutoSaving: false,
  drawerEditingCommentId: null,
  drawerEditingCommentBody: "",
  setDrawerDraft: withUpdater(set, "drawerDraft"),
  setDrawerCommentBody: withUpdater(set, "drawerCommentBody"),
  setDrawerActivityTab: withUpdater(set, "drawerActivityTab"),
  setDrawerCommentComposerOpen: withUpdater(set, "drawerCommentComposerOpen"),
  setDrawerDevPanel: withUpdater(set, "drawerDevPanel"),
  setDrawerIsUploadingDescription: withUpdater(set, "drawerIsUploadingDescription"),
  setDrawerIsUploadingComment: withUpdater(set, "drawerIsUploadingComment"),
  setDrawerIsEditingTitle: withUpdater(set, "drawerIsEditingTitle"),
  setDrawerDescriptionDirty: withUpdater(set, "drawerDescriptionDirty"),
  setDrawerIsAutoSaving: withUpdater(set, "drawerIsAutoSaving"),
  setDrawerEditingCommentId: withUpdater(set, "drawerEditingCommentId"),
  setDrawerEditingCommentBody: withUpdater(set, "drawerEditingCommentBody"),
});
