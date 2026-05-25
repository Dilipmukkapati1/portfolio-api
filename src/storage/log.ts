export function logStorageAccess(
  operation: "read" | "write",
  entity: string,
  source: string,
  meta?: Record<string, unknown>
): void {
  const metaPart =
    meta && Object.keys(meta).length > 0
      ? ` ${Object.entries(meta)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(" ")}`
      : "";
  console.log(
    `[portfolio-api] storage ${operation} ${entity} ← ${source}${metaPart}`
  );
}
