export type TransactionCursor = {
  date: string;
  id: string;
};

export function encodeTransactionCursor(cursor: TransactionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTransactionCursor(
  encoded: string
): TransactionCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as TransactionCursor;
    if (
      typeof parsed?.date === "string" &&
      parsed.date.length > 0 &&
      typeof parsed?.id === "string" &&
      parsed.id.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
