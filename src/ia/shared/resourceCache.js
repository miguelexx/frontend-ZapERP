const resources = new Map();

export function loadResource(key, loader, { force = false } = {}) {
  const current = resources.get(key) || { data: undefined, promise: null };
  if (!force && current.data !== undefined) return Promise.resolve(current.data);
  if (!force && current.promise) return current.promise;
  const promise = Promise.resolve()
    .then(loader)
    .then((data) => {
      resources.set(key, { data, promise: null });
      return data;
    })
    .catch((error) => {
      resources.set(key, { data: current.data, promise: null });
      throw error;
    });
  resources.set(key, { ...current, promise });
  return promise;
}

export function updateResource(key, data) {
  resources.set(key, { data, promise: null });
}

export function clearResource(key) {
  resources.delete(key);
}
