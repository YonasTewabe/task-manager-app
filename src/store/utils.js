const isPlainObject = (value) =>
  value != null &&
  typeof value === "object" &&
  Object.getPrototypeOf(value) === Object.prototype;

const isShallowEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
};

export const withUpdater = (set, key) => (valueOrUpdater) =>
  set((state) => {
    const prevValue = state[key];
    const nextValue =
      typeof valueOrUpdater === "function"
        ? valueOrUpdater(prevValue)
        : valueOrUpdater;

    if (Object.is(prevValue, nextValue) || isShallowEqual(prevValue, nextValue)) {
      return state;
    }

    return { [key]: nextValue };
  });
