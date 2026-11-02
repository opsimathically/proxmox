import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_pool_detail_response_t,
  proxmox_pool_list_response_t,
  proxmox_pool_reference_query_i,
  proxmox_pool_resource_list_response_t,
  proxmox_pool_record_t,
  proxmox_pool_detail_t,
  proxmox_pool_resource_record_t,
} from "../types/proxmox_service_types";

export interface pool_service_input_i {
  request_client: proxmox_request_client_i;
}

export class PoolService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: pool_service_input_i) {
    this.request_client = params.request_client;
  }

  public async listPools(): Promise<proxmox_pool_list_response_t> {
    const response = await this.request_client.request<unknown[]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/pools",
      retry_allowed: true,
    });
    return {
      ...response,
      data: NormalizePoolList({
        raw_pools: response.data,
      }),
    };
  }

  public async getPool(params: proxmox_pool_reference_query_i): Promise<proxmox_pool_detail_response_t> {
    const pool_id = ValidatePoolId(params.pool_id);
    const response = await this.request_client.request<unknown>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/pools/${encodeURIComponent(pool_id)}`,
      retry_allowed: true,
    });
    return {
      ...response,
      data: NormalizePoolDetail({
        raw_pool: response.data,
        fallback_pool_id: pool_id,
      }),
    };
  }

  public async listPoolResources(
    params: proxmox_pool_reference_query_i,
  ): Promise<proxmox_pool_resource_list_response_t> {
    const detail_response = await this.getPool({
      pool_id: params.pool_id,
    });
    return {
      ...detail_response,
      data: detail_response.data.members,
    };
  }
}

function ValidatePoolId(pool_id_raw: string): string {
  const pool_id = pool_id_raw.trim();
  if (!pool_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "pool_id is required and cannot be empty.",
      details: {
        field: "pool_id",
      },
    });
  }
  return pool_id;
}

function NormalizePoolList(params: {
  raw_pools: unknown;
}): proxmox_pool_record_t[] {
  if (!Array.isArray(params.raw_pools)) {
    return [];
  }
  const output: proxmox_pool_record_t[] = [];
  for (const raw_pool of params.raw_pools) {
    if (!IsRecord(raw_pool)) {
      continue;
    }
    output.push({
      pool_id: ResolvePoolId({
        raw_pool,
        fallback_pool_id: "unknown",
      }),
      comment: ToOptionalString(raw_pool.comment),
      raw: raw_pool,
    });
  }
  return output;
}

function NormalizePoolDetail(params: {
  raw_pool: unknown;
  fallback_pool_id: string;
}): proxmox_pool_detail_t {
  if (!IsRecord(params.raw_pool)) {
    return {
      pool_id: params.fallback_pool_id,
      members: [],
      raw: {},
    };
  }
  return {
    pool_id: ResolvePoolId({
      raw_pool: params.raw_pool,
      fallback_pool_id: params.fallback_pool_id,
    }),
    comment: ToOptionalString(params.raw_pool.comment),
    members: NormalizePoolMembers(params.raw_pool.members),
    raw: params.raw_pool,
  };
}

function NormalizePoolMembers(raw_members: unknown): proxmox_pool_resource_record_t[] {
  if (!Array.isArray(raw_members)) {
    return [];
  }
  const output: proxmox_pool_resource_record_t[] = [];
  for (const raw_member of raw_members) {
    if (!IsRecord(raw_member)) {
      continue;
    }
    output.push({
      id: ToOptionalString(raw_member.id),
      type: ToOptionalString(raw_member.type),
      vmid: typeof raw_member.vmid === "string" || typeof raw_member.vmid === "number"
        ? raw_member.vmid
        : undefined,
      name: ToOptionalString(raw_member.name),
      node: ToOptionalString(raw_member.node),
      pool: ToOptionalString(raw_member.pool),
      status: ToOptionalString(raw_member.status),
      raw: raw_member,
    });
  }
  return output;
}

function ResolvePoolId(params: {
  raw_pool: Record<string, unknown>;
  fallback_pool_id: string;
}): string {
  const candidates = [
    params.raw_pool.poolid,
    params.raw_pool.pool,
    params.raw_pool.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return params.fallback_pool_id;
}

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
