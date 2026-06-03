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
  TransactionListResponse,
  UpdateHouseholdRequest,
  UpdateMemberRequest,
  UpsertTaxProfileRequest,
  InvestmentPlan,
  ExpensePlan,
} from "@portfolio/contracts";
import type { StorageSourceMap } from "./layout.js";

export interface PortfolioStoreCore {
  readonly mode: "cosmos" | "memory" | "disk";

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

  investmentPlans: {
    get(householdId: string): Promise<InvestmentPlan | null>;
    upsert(plan: InvestmentPlan): Promise<InvestmentPlan>;
    delete(householdId: string): Promise<boolean>;
  };

  expensePlans: {
    get(householdId: string): Promise<ExpensePlan | null>;
    upsert(plan: ExpensePlan): Promise<ExpensePlan>;
    delete(householdId: string): Promise<boolean>;
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
    list(
      householdId: string,
      filter?: TransactionFilter
    ): Promise<TransactionListResponse>;
    upsert(txn: Transaction): Promise<Transaction>;
    get(householdId: string, txnId: string): Promise<Transaction | null>;
    replace(txn: Transaction): Promise<Transaction>;
    deleteAllForHousehold(householdId: string): Promise<void>;
  };

  holdings: {
    listByHousehold(householdId: string): Promise<Holding[]>;
    upsert(holding: Holding): Promise<Holding>;
    delete(householdId: string, id: string): Promise<void>;
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

export interface PortfolioDataStore extends PortfolioStoreCore {
  readonly sources: StorageSourceMap;
}
