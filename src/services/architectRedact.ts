import type { ArchitectDashboard } from "@portfolio/contracts";

export function redactArchitectDashboard(
  dashboard: ArchitectDashboard
): ArchitectDashboard {
  return {
    ...dashboard,
    totalCapital: undefined,
  };
}
