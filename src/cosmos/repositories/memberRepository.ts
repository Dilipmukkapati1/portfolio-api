import type {
  CreateMemberRequest,
  Member,
  SaveMembersRequest,
  UpdateMemberRequest,
} from "@portfolio/contracts";
import { randomUUID } from "node:crypto";
import { getDataStore } from "../../storage/index.js";

export class MemberRepository {
  async listByHousehold(householdId: string): Promise<Member[]> {
    const store = await getDataStore();
    return store.members.listByHousehold(householdId);
  }

  async get(householdId: string, memberId: string): Promise<Member | null> {
    const store = await getDataStore();
    return store.members.get(householdId, memberId);
  }

  async create(
    householdId: string,
    data: CreateMemberRequest
  ): Promise<Member> {
    const store = await getDataStore();
    return store.members.create(householdId, data);
  }

  async update(
    householdId: string,
    memberId: string,
    data: UpdateMemberRequest
  ): Promise<Member> {
    const store = await getDataStore();
    return store.members.update(householdId, memberId, data);
  }

  async delete(householdId: string, memberId: string): Promise<boolean> {
    const store = await getDataStore();
    return store.members.delete(householdId, memberId);
  }

  async replaceAll(
    householdId: string,
    payload: SaveMembersRequest
  ): Promise<Member[]> {
    const store = await getDataStore();
    return store.members.replaceAll(householdId, payload);
  }
}

export const memberRepository = new MemberRepository();

export function newMemberId(): string {
  return randomUUID();
}
