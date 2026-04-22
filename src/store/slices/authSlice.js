import { withUpdater } from "../utils";

export const createAuthSlice = (set) => ({
  authMode: "login",
  authForm: { name: "", email: "", password: "" },
  setAuthMode: withUpdater(set, "authMode"),
  setAuthForm: withUpdater(set, "authForm"),
});
