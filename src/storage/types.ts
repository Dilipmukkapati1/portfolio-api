import type {
  Account,
  CreateHouseholdRequest,
  CreateMemberRequest,
  Holding,
  Household,
  IntegrationToken,
  Member,
  SaveMembersRequest,
  SyncState,
  TaxProfile,
  Transaction,
  TransactionFilter,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
  UpsertTaxProfileRequest,
} from "@portfolio/contracts";

export interface PortfolioDataStore {
  readonly mode: "cosmos" | "memory";

  household: {
    list(): Promise<Household[]>;
    get(householdId: string): Promise<Household | null>;
    create(householdId: string, data: CreateHouseholdRequest): Promise<Household>;
    update(householdId: string, data: UpdateHouseholdRequest): Promise<Household>;
    delete(householdId: string): Promise<boolean>;
    updateNetWorthSummary(
      householdId: string,
      summary: Household["netWorthSummary"]
    ): Promise<void>;
  };

  members: {
    listByHousehold(householdId: string): Promise<Member[]>;
    get(householdId: string, memberId: string): Promise<Member | null>;
    create(householdId: string, data: CreateMemberRequest): Promise<Member>;
    update(
      householdId: string,
      memberId: string,
      data: UpdateMemberRequest
    ): Promise<Member>;
    delete(householdId: string, memberId: string): Promise<boolean>;
    replaceAll(householdId: string, payload: SaveMembersRequest): Promise<Member[]>;
    deleteAllForHousehold(householdId: string): Promise<void>;
  };

  taxProfiles: {
    get(householdId: string, taxYear: number): Promise<TaxProfile | null>;
    upsert(profile: TaxProfile): Promise<TaxProfile>;
    delete(householdId: string, taxYear: number): Promise<boolean>;
    deleteAllForHousehold(householdId: string): Promise<void>;
  };

  accounts: {
    listByHousehold(householdId: string): Promise<Account[]>;
    upsert(account: Account): Promise<Account>;
    findByExternalId(
      householdId: string,
      source: string,
      externalId: string
    ): Promise<Account | null>;
  };

  transactions: {
    list(householdId: string, filter?: TransactionFilter): Promise<Transaction[]>;
    upsert(txn: Transaction): Promise<Transaction>;
    get(householdId: string, txnId: string): Promise<Transaction | null>;
    replace(txn: Transaction): Promise<Transaction>;
  };

  holdings: {
    listByHousehold(householdId: string): Promise<Holding[]>;
    upsert(holding: Holding): Promise<Holding>;
  };

  integrations: {
    getToken(
      householdId: string,
      provider: string
    ): Promise<IntegrationToken | null>;
    upsertToken(token: IntegrationToken): Promise<void>;
    getSyncState(
      householdId: string,
      provider: string
    ): Promise<SyncState | null>;
    upsertSyncState(state: SyncState): Promise<void>;
    recordWebhookEvent(
      householdId: string,
      eventId: string,
      payload: Record<string, unknown>
    ): Promise<boolean>;
  };
}
