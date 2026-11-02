import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxError, ProxmoxHttpError, ProxmoxNotFoundError, ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_dr_backup_discovery_query_i,
  proxmox_dr_backup_discovery_response_t,
  proxmox_dr_capability_check_t,
  proxmox_dr_readiness_query_i,
  proxmox_dr_readiness_response_t,
  proxmox_dr_replication_discovery_query_i,
  proxmox_dr_replication_discovery_response_t,
} from "../types/proxmox_service_types";

export interface dr_service_input_i {
  request_client: proxmox_request_client_i;
}

export class DrService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: dr_service_input_i) {
    this.request_client = params.request_client;
  }

  public async discoverReplicationCapabilities(
    params: proxmox_dr_replication_discovery_query_i = {},
  ): Promise<proxmox_dr_replication_discovery_response_t> {
    const node_id = params.node_id === undefined
      ? undefined
      : ValidateNodeId({
        node_id: params.node_id,
        field_name: "node_id",
      });
    const checks: proxmox_dr_capability_check_t[] = [];

    const cluster_replication_result = await this.tryListEndpoint({
      path: "/api2/json/cluster/replication",
      node_id: undefined,
      capability_name: "cluster_replication_endpoint",
      checks,
    });
    const node_replication_result = node_id === undefined
      ? undefined
      : await this.tryListEndpoint({
        path: `/api2/json/nodes/${encodeURIComponent(node_id)}/replication`,
        node_id,
        capability_name: "node_replication_endpoint",
        checks,
      });

    const cluster_jobs = NormalizeRecords(cluster_replication_result.records);
    const node_jobs = NormalizeRecords(node_replication_result?.records);
    const supported = checks.some((check_record) => check_record.supported);

    return {
      success: true,
      status_code: 200,
      data: {
        node_id,
        supported,
        checks,
        cluster_jobs_count: cluster_jobs.length,
        node_jobs_count: node_jobs.length,
        cluster_jobs_raw: cluster_jobs,
        node_jobs_raw: node_jobs,
      },
    };
  }

  public async discoverBackupCapabilities(
    params: proxmox_dr_backup_discovery_query_i = {},
  ): Promise<proxmox_dr_backup_discovery_response_t> {
    const node_id = params.node_id === undefined
      ? undefined
      : ValidateNodeId({
        node_id: params.node_id,
        field_name: "node_id",
      });
    const checks: proxmox_dr_capability_check_t[] = [];

    const cluster_backup_result = await this.tryListEndpoint({
      path: "/api2/json/cluster/backup",
      node_id: undefined,
      capability_name: "cluster_backup_endpoint",
      checks,
    });
    const storage_records = await this.listStorageRecords({
      node_id,
      checks,
    });
    const backup_storages = storage_records.filter((record) =>
      NormalizeStorageContent(record.content).has("backup")
    );
    checks.push({
      capability: "backup_storage_capability",
      supported: backup_storages.length > 0,
      reason: backup_storages.length > 0
        ? "backup_storage_available"
        : "backup_storage_not_found",
      endpoint: "/api2/json/storage",
    });

    const backup_schedules = NormalizeRecords(cluster_backup_result.records);
    const normalized_backup_storages = NormalizeRecords(backup_storages);
    const supported = checks.some((check_record) => check_record.supported);

    return {
      success: true,
      status_code: 200,
      data: {
        node_id,
        supported,
        checks,
        backup_schedule_count: backup_schedules.length,
        backup_storage_count: normalized_backup_storages.length,
        backup_storage_ids: normalized_backup_storages
          .map((record) => ToOptionalString(record.storage))
          .filter((storage_id): storage_id is string => storage_id !== undefined),
        backup_schedules_raw: backup_schedules,
        backup_storage_raw: normalized_backup_storages,
      },
    };
  }

  public async checkDrReadiness(
    params: proxmox_dr_readiness_query_i = {},
  ): Promise<proxmox_dr_readiness_response_t> {
    const node_id = params.node_id === undefined
      ? undefined
      : ValidateNodeId({
        node_id: params.node_id,
        field_name: "node_id",
      });
    const require_replication_jobs = params.require_replication_jobs === true;
    const require_backup_storage = params.require_backup_storage === true;
    const minimum_backup_storage_count = params.minimum_backup_storage_count ?? 1;
    if (!Number.isInteger(minimum_backup_storage_count) || minimum_backup_storage_count < 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "minimum_backup_storage_count must be a non-negative integer.",
        details: {
          field: "minimum_backup_storage_count",
        },
      });
    }

    const [replication, backup] = await Promise.all([
      this.discoverReplicationCapabilities({
        node_id,
      }),
      this.discoverBackupCapabilities({
        node_id,
      }),
    ]);

    const checks: Array<{
      check: string;
      passed: boolean;
      reason: string;
    }> = [];
    checks.push({
      check: "replication_capability_detected",
      passed: replication.data.supported,
      reason: replication.data.supported ? "replication_supported" : "replication_unsupported",
    });
    checks.push({
      check: "backup_capability_detected",
      passed: backup.data.supported,
      reason: backup.data.supported ? "backup_supported" : "backup_unsupported",
    });

    if (require_replication_jobs) {
      const has_replication_jobs = replication.data.cluster_jobs_count + replication.data.node_jobs_count > 0;
      checks.push({
        check: "replication_jobs_present",
        passed: has_replication_jobs,
        reason: has_replication_jobs ? "replication_jobs_present" : "replication_jobs_missing",
      });
    }
    if (require_backup_storage) {
      const has_backup_storages = backup.data.backup_storage_count >= minimum_backup_storage_count;
      checks.push({
        check: "backup_storage_threshold",
        passed: has_backup_storages,
        reason: has_backup_storages
          ? "backup_storage_threshold_met"
          : "backup_storage_threshold_not_met",
      });
    }

    const failed_checks = checks.filter((check_record) => !check_record.passed).length;
    return {
      success: true,
      status_code: 200,
      data: {
        node_id,
        allowed: failed_checks === 0,
        failed_checks,
        checks,
        replication: replication.data,
        backup: backup.data,
      },
    };
  }

  private async tryListEndpoint(params: {
    path: string;
    node_id?: string;
    capability_name: string;
    checks: proxmox_dr_capability_check_t[];
  }): Promise<{
    records: Record<string, unknown>[];
  }> {
    try {
      const response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: params.path,
        node_id: params.node_id,
        retry_allowed: true,
      });
      params.checks.push({
        capability: params.capability_name,
        supported: true,
        reason: "endpoint_supported",
        endpoint: params.path,
      });
      return {
        records: NormalizeRecords(response.data),
      };
    } catch (error) {
      if (IsUnsupportedEndpointError(error)) {
        const status_code = error instanceof ProxmoxError ? error.status_code : undefined;
        params.checks.push({
          capability: params.capability_name,
          supported: false,
          reason: "endpoint_unsupported",
          endpoint: params.path,
          status_code,
        });
        return {
          records: [],
        };
      }
      throw error;
    }
  }

  private async listStorageRecords(params: {
    node_id?: string;
    checks: proxmox_dr_capability_check_t[];
  }): Promise<Record<string, unknown>[]> {
    if (params.node_id === undefined) {
      const response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/storage",
        retry_allowed: true,
      });
      params.checks.push({
        capability: "storage_listing_endpoint",
        supported: true,
        reason: "endpoint_supported",
        endpoint: "/api2/json/storage",
      });
      return NormalizeRecords(response.data);
    }

    try {
      const scoped_response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/storage",
        query: {
          node: params.node_id,
        },
        retry_allowed: true,
      });
      params.checks.push({
        capability: "storage_listing_endpoint",
        supported: true,
        reason: "endpoint_supported",
        endpoint: "/api2/json/storage?node=<node>",
      });
      return NormalizeRecords(scoped_response.data);
    } catch (error) {
      if (!ShouldFallbackStorageNodeQuery(error)) {
        throw error;
      }
      params.checks.push({
        capability: "storage_listing_endpoint",
        supported: true,
        reason: "node_scope_unsupported_unscoped_fallback_used",
        endpoint: "/api2/json/storage",
      });
      const unscoped_response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/storage",
        retry_allowed: true,
      });
      return NormalizeRecords(unscoped_response.data).filter((record) => {
        const record_node = ToOptionalString(record.node);
        if (record_node === undefined) {
          return true;
        }
        return record_node.toLowerCase() === params.node_id?.toLowerCase();
      });
    }
  }
}

function ValidateNodeId(params: {
  node_id: string;
  field_name: string;
}): string {
  const node_id = params.node_id.trim();
  if (!node_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  if (!/^[A-Za-z0-9._-]+$/.test(node_id)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} contains unsupported characters.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return node_id;
}

function IsUnsupportedEndpointError(error: unknown): boolean {
  if (error instanceof ProxmoxNotFoundError) {
    return true;
  }
  if (error instanceof ProxmoxHttpError) {
    return error.status_code === 501 || error.status_code === 405 || error.status_code === 404;
  }
  return false;
}

function ShouldFallbackStorageNodeQuery(error: unknown): boolean {
  if (!(error instanceof ProxmoxHttpError)) {
    return false;
  }
  return error.status_code === 400 || error.status_code === 501;
}

function NormalizeRecords(raw_records: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw_records)) {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  for (const raw_record of raw_records) {
    if (IsRecord(raw_record)) {
      records.push(raw_record);
    }
  }
  return records;
}

function NormalizeStorageContent(raw_content: unknown): Set<string> {
  const content_set = new Set<string>();
  if (Array.isArray(raw_content)) {
    for (const raw_value of raw_content) {
      if (typeof raw_value === "string" && raw_value.trim().length > 0) {
        content_set.add(raw_value.trim().toLowerCase());
      }
    }
    return content_set;
  }
  if (typeof raw_content === "string") {
    for (const token of raw_content.split(",")) {
      const normalized_token = token.trim().toLowerCase();
      if (normalized_token.length > 0) {
        content_set.add(normalized_token);
      }
    }
  }
  return content_set;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized_value = value.trim();
  return normalized_value.length > 0 ? normalized_value : undefined;
}
