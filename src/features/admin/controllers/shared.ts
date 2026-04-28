export type RefetchAfterCrud = (opts: AnyRecord) => Promise<void>;
export type Notify = (message: string, kind?: string) => void;

export function refetchAll(
  refetchAfterCrud: RefetchAfterCrud,
  notify: Notify,
  action: string,
) {
  void refetchAfterCrud({
    includeBootstrap: true,
    includeProject: true,
    includeDashboard: true,
  }).catch((error: any) => {
    notify(error?.message || `Failed to refresh data after ${action}.`, "error");
  });
}
