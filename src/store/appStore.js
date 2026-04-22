import { create } from "zustand";
import { createAdminSlice } from "./slices/adminSlice";
import { createAppCoreSlice } from "./slices/appCoreSlice";
import { createAuthSlice } from "./slices/authSlice";
import { createPlanningSlice } from "./slices/planningSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import { createTaskDrawerSlice } from "./slices/taskDrawerSlice";
import { createNotificationsSlice } from "./slices/notificationsSlice";

export const useAppStore = create((set) => ({
  ...createAppCoreSlice(set),
  ...createAuthSlice(set),
  ...createPlanningSlice(set),
  ...createAdminSlice(set),
  ...createSettingsSlice(set),
  ...createTaskDrawerSlice(set),
  ...createNotificationsSlice(set),
}));
