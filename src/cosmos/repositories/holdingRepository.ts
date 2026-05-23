import type { Holding } from "@portfolio/contracts";
import { getContainer } from "../client.js";

const CONTAINER = "holdings";

export class HoldingRepository {
  async listByHousehold(householdId: string): Promise<Holding[]> {
    const container = getContainer(CONTAINER);
    const { resources } = await container.items
      .query<Holding>({
        query: "SELECT * FROM c WHERE c.householdId = @hid",
        parameters: [{ name: "@hid", value: householdId }],
      })
      .fetchAll();
    return resources;
  }

  async upsert(holding: Holding): Promise<Holding> {
    const container = getContainer(CONTAINER);
    const { resource } = await container.items.upsert(holding);
    return resource as unknown as Holding;
  }
}

export const holdingRepository = new HoldingRepository();
