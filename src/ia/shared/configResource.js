import * as iaApi from "../../api/iaService";
import { mergeIaConfigFromApi } from "./configNormalization";

const entries = new Map();

function getEntry(companyKey) {
  const key = String(companyKey || "default");
  if (!entries.has(key)) entries.set(key, { data: null, promise: null });
  return entries.get(key);
}

export function loadIaConfig(companyKey) {
  const entry = getEntry(companyKey);
  if (entry.data) return Promise.resolve(entry.data);
  if (entry.promise) return entry.promise;
  entry.promise = iaApi.getConfig()
    .then((raw) => {
      entry.data = mergeIaConfigFromApi(raw);
      return entry.data;
    })
    .finally(() => {
      entry.promise = null;
    });
  return entry.promise;
}

export function updateIaConfigResource(companyKey, raw) {
  const merged = mergeIaConfigFromApi(raw);
  getEntry(companyKey).data = merged;
  return merged;
}

export function clearIaConfigResource(companyKey) {
  entries.delete(String(companyKey || "default"));
}
