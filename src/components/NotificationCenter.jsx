import { memo } from "react";

function NotificationCenter({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClickNotification,
}) {
  const sortedNotifications = [
    ...notifications.filter((item) => !item.readAt),
    ...notifications.filter((item) => item.readAt),
  ];

  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[360px] rounded-[12px] border border-[#dfe1e6] bg-white p-2 shadow-lg">
      <div className="mb-2 flex items-center justify-between px-1">
        <strong className="text-sm">Notifications</strong>
        <button type="button" onClick={onMarkAllRead}>
          Mark all read
        </button>
      </div>
      <div className="grid max-h-[420px] gap-1 overflow-auto">
        {sortedNotifications.length ? (
          sortedNotifications.map((item) => {
            const unread = !item.readAt;
            return (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-[10px] border px-2 py-2 text-left ${unread ? "border-[#bfd3f8] bg-[#eef4ff]" : "border-[#e5e9f0] bg-white"}`}
                onClick={() => onClickNotification(item)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{item.title}</div>
                    <div className="line-clamp-2 text-xs text-[#5e6c84]">{item.body}</div>
                  </div>
                  {unread ? (
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-[#2d64d9]" />
                  ) : null}
                </div>
                {unread ? (
                  <div className="mt-1">
                    <span
                      className="text-[11px] text-[#2d64d9]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMarkRead(item.id);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      Mark read
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="rounded-[10px] border border-dashed border-[#dfe1e6] p-3 text-sm text-[#5e6c84]">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(NotificationCenter);
