import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxHttpError, ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_ha_group_list_response_t,
  proxmox_ha_groups_query_i,
  proxmox_ha_resource_add_input_i,
  proxmox_ha_resource_list_response_t,
  proxmox_ha_resource_remove_input_i,
  proxmox_ha_resource_update_input_i,
  proxmox_ha_resources_query_i,
  proxmox_ha_write_response_t,
} from "../types/proxmox_service_types";

export interface ha_service_input_i {
  request_client: proxmox_request_client_i;
}

export class HaService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: ha_service_input_i) {
    this.request_client = params.request_client;
  }

  public async listResources(
    params: proxmox_ha_resources_query_i = {},
  ): Promise<proxmox_ha_resource_list_response_t> {
    const query = BuildListResourcesQuery(params);
    try {
      const response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/cluster/ha/resources",
        query,
        retry_allowed: true,
      });
      return {
        ...response,
        data: NormalizeResourceList(response.data),
      };
    } catch (error) {
      RethrowIfUnsupportedHaContext({
        error,
        operation: "listResources",
      });
      throw error;
    }
  }

  public async addResource(
    params: proxmox_ha_resource_add_input_i,
  ): Promise<proxmox_ha_write_response_t> {
    const sid = ValidateSid(params.sid);
    const request_body = BuildResourceWriteBody({
      state: params.state,
      group: params.group,
      max_relocate: params.max_relocate,
      max_restart: params.max_restart,
      comment: params.comment,
    });
    try {
      const response = await this.request_client.request<unknown>({
        method: "POST" as proxmox_http_method_t,
        path: "/api2/json/cluster/ha/resources",
        body: {
          sid,
          ...request_body,
        },
      });
      return {
        ...response,
        data: {
          operation: "add_resource",
          sid,
          task_id: ResolveTaskId(response.data),
        },
      };
    } catch (error) {
      RethrowIfUnsupportedHaContext({
        error,
        operation: "addResource",
      });
      throw error;
    }
  }

  public async updateResource(
    params: proxmox_ha_resource_update_input_i,
  ): Promise<proxmox_ha_write_response_t> {
    const sid = ValidateSid(params.sid);
    const request_body = BuildResourceWriteBody({
      state: params.state,
      group: params.group,
      max_relocate: params.max_relocate,
      max_restart: params.max_restart,
      comment: params.comment,
      digest: params.digest,
    });
    try {
      const response = await this.request_client.request<unknown>({
        method: "PUT" as proxmox_http_method_t,
        path: `/api2/json/cluster/ha/resources/${encodeURIComponent(sid)}`,
        body: request_body,
      });
      return {
        ...response,
        data: {
          operation: "update_resource",
          sid,
          task_id: ResolveTaskId(response.data),
        },
      };
    } catch (error) {
      RethrowIfUnsupportedHaContext({
        error,
        operation: "updateResource",
      });
      throw error;
    }
  }

  public async removeResource(
    params: proxmox_ha_resource_remove_input_i,
  ): Promise<proxmox_ha_write_response_t> {
    const sid = ValidateSid(params.sid);
    try {
      const response = await this.request_client.request<unknown>({
        method: "DELETE" as proxmox_http_method_t,
        path: `/api2/json/cluster/ha/resources/${encodeURIComponent(sid)}`,
      });
      return {
        ...response,
        data: {
          operation: "remove_resource",
          sid,
          task_id: ResolveTaskId(response.data),
        },
      };
    } catch (error) {
      RethrowIfUnsupportedHaContext({
        error,
        operation: "removeResource",
      });
      throw error;
    }
  }

  public async listGroups(
    _params: proxmox_ha_groups_query_i = {},
  ): Promise<proxmox_ha_group_list_response_t> {
    try {
      const response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/cluster/ha/groups",
        retry_allowed: true,
      });
      return {
        ...response,
        data: NormalizeGroupList(response.data),
      };
    } catch (error) {
      RethrowIfUnsupportedHaContext({
        error,
        operation: "listGroups",
      });
      throw error;
    }
  }
}

function BuildListResourcesQuery(params: proxmox_ha_resources_query_i): Record<string, string> {
  const query: Record<string, string> = {};
  if (params.type !== undefined) {
    query.type = ValidateNonEmptyString({
      value: params.type,
      field_name: "type",
    });
  }
  if (params.status !== undefined) {
    query.status = ValidateNonEmptyString({
      value: params.status,
      field_name: "status",
    });
  }
  return query;
}

function ValidateSid(raw_sid: string): string {
  const sid = ValidateNonEmptyString({
    value: raw_sid,
    field_name: "sid",
  });
  if (!/^[A-Za-z]+:[A-Za-z0-9._-]+$/.test(sid)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "sid format is invalid.",
      details: {
        field: "sid",
      },
    });
  }
  return sid;
}

function ValidateNonEmptyString(params: {
  value: string;
  field_name: string;
}): string {
  const normalized_value = params.value.trim();
  if (!normalized_value) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} is required and cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized_value;
}

function BuildResourceWriteBody(params: {
  state?: string;
  group?: string;
  max_relocate?: number;
  max_restart?: number;
  comment?: string;
  digest?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (params.state !== undefined) {
    body.state = ValidateNonEmptyString({
      value: params.state,
      field_name: "state",
    });
  }
  if (params.group !== undefined) {
    body.group = ValidateNonEmptyString({
      value: params.group,
      field_name: "group",
    });
  }
  if (params.max_relocate !== undefined) {
    if (!Number.isInteger(params.max_relocate) || params.max_relocate < 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "max_relocate must be a non-negative integer.",
        details: {
          field: "max_relocate",
        },
      });
    }
    body.max_relocate = params.max_relocate;
  }
  if (params.max_restart !== undefined) {
    if (!Number.isInteger(params.max_restart) || params.max_restart < 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "max_restart must be a non-negative integer.",
        details: {
          field: "max_restart",
        },
      });
    }
    body.max_restart = params.max_restart;
  }
  if (params.comment !== undefined) {
    body.comment = params.comment;
  }
  if (params.digest !== undefined) {
    body.digest = ValidateNonEmptyString({
      value: params.digest,
      field_name: "digest",
    });
  }
  return body;
}

function NormalizeResourceList(raw_records: unknown): Array<{
  sid: string;
  state?: string;
  group?: string;
  max_relocate?: number;
  max_restart?: number;
  comment?: string;
  status?: string;
  raw: Record<string, unknown>;
}> {
  if (!Array.isArray(raw_records)) {
    return [];
  }
  const normalized: Array<{
    sid: string;
    state?: string;
    group?: string;
    max_relocate?: number;
    max_restart?: number;
    comment?: string;
    status?: string;
    raw: Record<string, unknown>;
  }> = [];
  for (const raw_record of raw_records) {
    if (!IsRecord(raw_record)) {
      continue;
    }
    const sid = ToOptionalString(raw_record.sid);
    if (sid === undefined) {
      continue;
    }
    normalized.push({
      sid,
      state: ToOptionalString(raw_record.state),
      group: ToOptionalString(raw_record.group),
      max_relocate: ToOptionalInteger(raw_record.max_relocate),
      max_restart: ToOptionalInteger(raw_record.max_restart),
      comment: ToOptionalString(raw_record.comment),
      status: ToOptionalString(raw_record.status),
      raw: raw_record,
    });
  }
  return normalized;
}

function NormalizeGroupList(raw_records: unknown): Array<{
  group: string;
  nodes?: string;
  restricted?: boolean;
  nofailback?: boolean;
  comment?: string;
  raw: Record<string, unknown>;
}> {
  if (!Array.isArray(raw_records)) {
    return [];
  }
  const normalized: Array<{
    group: string;
    nodes?: string;
    restricted?: boolean;
    nofailback?: boolean;
    comment?: string;
    raw: Record<string, unknown>;
  }> = [];
  for (const raw_record of raw_records) {
    if (!IsRecord(raw_record)) {
      continue;
    }
    const group = ToOptionalString(raw_record.group);
    if (group === undefined) {
      continue;
    }
    normalized.push({
      group,
      nodes: ToOptionalString(raw_record.nodes),
      restricted: ToOptionalBoolean(raw_record.restricted),
      nofailback: ToOptionalBoolean(raw_record.nofailback),
      comment: ToOptionalString(raw_record.comment),
      raw: raw_record,
    });
  }
  return normalized;
}

function ResolveTaskId(raw_value: unknown): string {
  if (typeof raw_value === "string" && raw_value.trim().length > 0) {
    return raw_value.trim();
  }
  if (IsRecord(raw_value)) {
    const candidates = [
      raw_value.task_id,
      raw_value.taskid,
      raw_value.upid,
      raw_value.data,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return "unknown";
}

function RethrowIfUnsupportedHaContext(params: {
  error: unknown;
  operation: string;
}): void {
  if (!(params.error instanceof ProxmoxHttpError)) {
    return;
  }
  if (!IsUnsupportedHaContext(params.error)) {
    return;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "HA operations are not supported by the connected Proxmox cluster context.",
    details: {
      field: `ha_service.${params.operation}`,
    },
    status_code: params.error.status_code,
    cause: params.error,
  });
}

function IsUnsupportedHaContext(error: ProxmoxHttpError): boolean {
  if (error.status_code === 404 || error.status_code === 501) {
    return true;
  }
  const message = error.message.toLowerCase();
  return message.includes("ha") && (message.includes("unsupported") || message.includes("not enabled"));
}

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized_value = value.trim();
  return normalized_value.length > 0 ? normalized_value : undefined;
}

function ToOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return undefined;
}

function ToOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (typeof value === "string") {
    const normalized_value = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized_value)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized_value)) {
      return false;
    }
  }
  return undefined;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
