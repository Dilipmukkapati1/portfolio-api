import { isStorageConnectionError } from "./errors.js";
import { getDataStore, resetStorageConnection } from "../storage/index.js";

/** Retry once after resetting storage when Cosmos/SQL connections drop mid-session. */
export async function executeWithStorageRetry<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    await getDataStore();
    return await operation();
  } catch (err) {
    if (!isStorageConnectionError(err)) throw err;
    resetStorageConnection();
    await getDataStore();
    return await operation();
  }
}
