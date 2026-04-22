const userStreams = new Map();

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function registerNotificationStream(userId, res) {
  const key = String(userId);
  const streams = userStreams.get(key) || new Set();
  streams.add(res);
  userStreams.set(key, streams);
  writeEvent(res, "stream:ready", { ok: true });
}

export function unregisterNotificationStream(userId, res) {
  const key = String(userId);
  const streams = userStreams.get(key);
  if (!streams) return;
  streams.delete(res);
  if (!streams.size) userStreams.delete(key);
}

export function publishNotificationEvent(userId, event, payload) {
  const key = String(userId);
  const streams = userStreams.get(key);
  if (!streams || !streams.size) return;
  for (const stream of streams) {
    writeEvent(stream, event, payload);
  }
}

const heartbeat = setInterval(() => {
  for (const [, streams] of userStreams.entries()) {
    for (const stream of streams) {
      stream.write(": keepalive\n\n");
    }
  }
}, 25000);

heartbeat.unref?.();
