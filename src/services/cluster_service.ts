import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import {
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import {
  proxmox_cluster_bridge_compatibility_query_i,
  proxmox_cluster_bridge_compatibility_response_t,
  proxmox_cluster_next_id_query_i,
  proxmox_cluster_next_id_response_t,
  proxmox_cluster_nodes_query_i,
  proxmox_cluster_storage_compatibility_query_i,
  proxmox_cluster_storage_compatibility_response_t,
  proxmox_cluster_status_response_t,
  proxmox_cluster_membership_response_t,
  proxmox_cluster_nodes_response_t,
  proxmox_cluster_storage_required_content_t,
  proxmox_cluster_storage_compatibility_node_record_i,
  proxmox_cluster_bridge_compatibility_node_record_i,
  proxmox_cluster_next_id_source_t,
} from "../types/proxmox_service_types";

export interface cluster_service_input_i {
  request_client: proxmox_request_client_i;
}

export class ClusterService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: cluster_service_input_i) {
    this.request_client = params.request_client;
  }

  public async getStatus(): Promise<proxmox_cluster_status_response_t> {
    return this.request_client.request<proxmox_cluster_status_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/cluster/status",
    });
  }

  public async getMembership(): Promise<proxmox_cluster_membership_response_t> {
    return this.request_client.request<proxmox_cluster_membership_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/cluster/members",
    });
  }

  public async listNodes(params: proxmox_cluster_nodes_query_i = {}): Promise<proxmox_cluster_nodes_response_t> {
    const query = BuildListNodesQuery(params);
    return this.request_client.request<proxmox_cluster_nodes_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/cluster/nodes",
      query: query.raw_query,
    });
  }

  public async allocateNextId(
    params: proxmox_cluster_next_id_query_i = {},
  ): Promise<proxmox_cluster_next_id_response_t> {
    const resource_type = ValidateOptionalResourceType(params.resource_type);
    try {
      const endpoint_response = await this.request_client.request<unknown>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/cluster/nextid",
        retry_allowed: true,
      });
      return {
        ...endpoint_response,
        data: {
          next_id: ResolveNextId({
            raw_value: endpoint_response.data,
            source: "cluster_nextid_endpoint",
          }),
          source: "cluster_nextid_endpoint",
          resource_type,
          raw: endpoint_response.data,
        },
      };
    } catch (error) {
      if (!ShouldFallbackToClusterResources(error)) {
        throw error;
      }
      return this.allocateNextIdFromClusterResources({
        resource_type,
      });
    }
  }

  public async checkStorageCompatibility(
    params: proxmox_cluster_storage_compatibility_query_i,
  ): Promise<proxmox_cluster_storage_compatibility_response_t> {
    const node_ids = ValidateNodeIds(params.node_ids);
    const required_content = ValidateStorageRequiredContent(params.required_content);
    const storage_id = ValidateOptionalStorageId(params.storage_id);

    const node_results: proxmox_cluster_storage_compatibility_node_record_i[] = [];
    for (const node_id of node_ids) {
      const storage_response = await this.listStorageForNode({
        node_id,
      });
      node_results.push(
        BuildStorageCompatibilityResult({
          node_id,
          required_content,
          storage_id,
          raw_records: storage_response,
        }),
      );
    }

    return {
      success: true,
      status_code: 200,
      data: {
        required_content,
        storage_id,
        checked_node_count: node_results.length,
        compatible_nodes: node_results
          .filter((node_result) => node_result.compatible)
          .map((node_result) => node_result.node_id),
        incompatible_nodes: node_results
          .filter((node_result) => !node_result.compatible)
          .map((node_result) => node_result.node_id),
        nodes: node_results,
      },
    };
  }

  public async checkBridgeCompatibility(
    params: proxmox_cluster_bridge_compatibility_query_i,
  ): Promise<proxmox_cluster_bridge_compatibility_response_t> {
    const node_ids = ValidateNodeIds(params.node_ids);
    const bridge = ValidateBridgeName(params.bridge);

    const node_results: proxmox_cluster_bridge_compatibility_node_record_i[] = [];
    for (const node_id of node_ids) {
      const response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: `/api2/json/nodes/${encodeURIComponent(node_id)}/network`,
        node_id,
        retry_allowed: true,
      });
      node_results.push(
        BuildBridgeCompatibilityResult({
          node_id,
          bridge,
          raw_records: response.data,
        }),
      );
    }

    return {
      success: true,
      status_code: 200,
      data: {
        bridge,
        checked_node_count: node_results.length,
        compatible_nodes: node_results
          .filter((node_result) => node_result.compatible)
          .map((node_result) => node_result.node_id),
        incompatible_nodes: node_results
          .filter((node_result) => !node_result.compatible)
          .map((node_result) => node_result.node_id),
        nodes: node_results,
      },
    };
  }

  private async allocateNextIdFromClusterResources(params: {
    resource_type?: "qemu" | "lxc";
  }): Promise<proxmox_cluster_next_id_response_t> {
    const query: Record<string, string> = {};
    if (params.resource_type !== undefined) {
      query.type = params.resource_type;
    }
    const resource_response = await this.request_client.request<unknown[]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/cluster/resources",
      query,
      retry_allowed: true,
    });

    const next_id = ResolveNextIdFromClusterResources({
      raw_resources: resource_response.data,
      resource_type: params.resource_type,
    });
    const source: proxmox_cluster_next_id_source_t = "cluster_resources_fallback";
    return {
      ...resource_response,
      data: {
        next_id,
        source,
        resource_type: params.resource_type,
        raw: resource_response.data,
      },
    };
  }

  private async listStorageForNode(params: {
    node_id: string;
  }): Promise<unknown[]> {
    try {
      const scoped_response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/storage",
        query: {
          node: params.node_id,
        },
        retry_allowed: true,
      });
      return Array.isArray(scoped_response.data) ? scoped_response.data : [];
    } catch (error) {
      if (!ShouldFallbackStorageNodeFilter(error)) {
        throw error;
      }
      const unscoped_response = await this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: "/api2/json/storage",
        retry_allowed: true,
      });
      if (!Array.isArray(unscoped_response.data)) {
        return [];
      }
      return unscoped_response.data.filter((raw_record) => {
        if (!IsRecord(raw_record)) {
          return false;
        }
        const record_node = ToOptionalString(raw_record.node);
        if (record_node === undefined) {
          return true;
        }
        return record_node.toLowerCase() === params.node_id.toLowerCase();
      });
    }
  }

}

function BuildListNodesQuery(params: proxmox_cluster_nodes_query_i): {
  raw_query: { [key: string]: string };
} {
  if (params.type !== undefined && !params.type.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "type filter must not be empty.",
      details: {
        field: "type",
      },
    });
  }

  const raw_query: { [key: string]: string } = {};
  if (params.type !== undefined) {
    raw_query.type = params.type.trim();
  }

  return {
    raw_query,
  };
}

function ValidateNodeIds(node_ids: string[]): string[] {
  if (!Array.isArray(node_ids) || node_ids.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_ids must include at least one node id.",
      details: {
        field: "node_ids",
      },
    });
  }

  const normalized_node_ids: string[] = [];
  const dedupe_set = new Set<string>();
  for (const raw_node_id of node_ids) {
    const normalized_node_id = raw_node_id.trim();
    if (!normalized_node_id) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "node_ids cannot include empty values.",
        details: {
          field: "node_ids",
        },
      });
    }
    const dedupe_key = normalized_node_id.toLowerCase();
    if (dedupe_set.has(dedupe_key)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "node_ids must be unique.",
        details: {
          field: "node_ids",
        },
      });
    }
    dedupe_set.add(dedupe_key);
    normalized_node_ids.push(normalized_node_id);
  }

  return normalized_node_ids;
}

function ValidateStorageRequiredContent(
  required_content: proxmox_cluster_storage_required_content_t,
): proxmox_cluster_storage_required_content_t {
  if (required_content !== "rootdir" && required_content !== "images") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "required_content must be rootdir or images.",
      details: {
        field: "required_content",
      },
    });
  }
  return required_content;
}

function ValidateOptionalStorageId(storage_id: string | undefined): string | undefined {
  if (storage_id === undefined) {
    return undefined;
  }
  const normalized_storage_id = storage_id.trim();
  if (!normalized_storage_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "storage_id must not be empty.",
      details: {
        field: "storage_id",
      },
    });
  }
  return normalized_storage_id;
}

function ValidateBridgeName(bridge: string): string {
  const normalized_bridge = bridge.trim();
  if (!normalized_bridge) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "bridge is required and cannot be empty.",
      details: {
        field: "bridge",
      },
    });
  }
  return normalized_bridge;
}

function ValidateOptionalResourceType(
  resource_type: "qemu" | "lxc" | undefined,
): "qemu" | "lxc" | undefined {
  if (resource_type === undefined) {
    return undefined;
  }
  if (resource_type !== "qemu" && resource_type !== "lxc") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "resource_type must be qemu or lxc.",
      details: {
        field: "resource_type",
      },
    });
  }
  return resource_type;
}

function ResolveNextId(params: {
  raw_value: unknown;
  source: "cluster_nextid_endpoint" | "cluster_resources_fallback";
}): number {
  if (typeof params.raw_value === "number" && Number.isInteger(params.raw_value) && params.raw_value > 0) {
    return params.raw_value;
  }
  if (typeof params.raw_value === "string" && /^[1-9][0-9]*$/.test(params.raw_value.trim())) {
    return Number.parseInt(params.raw_value.trim(), 10);
  }
  if (IsRecord(params.raw_value)) {
    const candidates = [params.raw_value.nextid, params.raw_value.vmid, params.raw_value.id];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) {
        return candidate;
      }
      if (typeof candidate === "string" && /^[1-9][0-9]*$/.test(candidate.trim())) {
        return Number.parseInt(candidate.trim(), 10);
      }
    }
  }

  throw new ProxmoxValidationError({
    code: "proxmox.validation.missing_input",
    message: "Could not resolve next cluster id from response.",
    details: {
      field: `${params.source}.next_id`,
    },
  });
}

function ResolveNextIdFromClusterResources(params: {
  raw_resources: unknown;
  resource_type?: "qemu" | "lxc";
}): number {
  const minimum_next_id = 100;
  if (!Array.isArray(params.raw_resources)) {
    return minimum_next_id;
  }

  let highest_vmid = 0;
  for (const raw_resource of params.raw_resources) {
    if (!IsRecord(raw_resource)) {
      continue;
    }
    if (params.resource_type !== undefined) {
      const resource_type = ToOptionalString(raw_resource.type);
      if (resource_type?.toLowerCase() !== params.resource_type) {
        continue;
      }
    }
    const vmid = ToOptionalPositiveInteger(raw_resource.vmid);
    if (vmid !== undefined && vmid > highest_vmid) {
      highest_vmid = vmid;
    }
  }

  const next_id = highest_vmid + 1;
  return next_id >= minimum_next_id ? next_id : minimum_next_id;
}

function BuildStorageCompatibilityResult(params: {
  node_id: string;
  required_content: proxmox_cluster_storage_required_content_t;
  storage_id?: string;
  raw_records: unknown[];
}): proxmox_cluster_storage_compatibility_node_record_i {
  const normalized_records: Array<{
    storage_id: string;
    enabled: boolean;
    content: Set<string>;
    raw: Record<string, unknown>;
  }> = [];
  for (const raw_record of params.raw_records) {
    if (!IsRecord(raw_record)) {
      continue;
    }
    const storage_id = ResolveStorageId(raw_record);
    if (storage_id === undefined) {
      continue;
    }
    normalized_records.push({
      storage_id,
      enabled: ResolveStorageEnabled(raw_record),
      content: NormalizeStorageContent(raw_record.content),
      raw: raw_record,
    });
  }

  const scoped_records = params.storage_id === undefined
    ? normalized_records
    : normalized_records.filter(
      (record) => record.storage_id.toLowerCase() === params.storage_id?.toLowerCase(),
    );
  const enabled_records = scoped_records.filter((record) => record.enabled);
  const matching_records = enabled_records.filter((record) => record.content.has(params.required_content));

  const reason = ResolveStorageCompatibilityReason({
    scoped_records,
    enabled_records,
    matching_records,
  });

  return {
    node_id: params.node_id,
    compatible: matching_records.length > 0,
    reason,
    required_content: params.required_content,
    storage_id: params.storage_id,
    matching_storage_ids: matching_records.map((record) => record.storage_id),
    checked_storage_ids: scoped_records.map((record) => record.storage_id),
    raw_storage_records: scoped_records.map((record) => record.raw),
  };
}

function ResolveStorageCompatibilityReason(params: {
  scoped_records: Array<{ enabled: boolean; content: Set<string> }>;
  enabled_records: Array<{ enabled: boolean; content: Set<string> }>;
  matching_records: Array<{ enabled: boolean; content: Set<string> }>;
}): string {
  if (params.scoped_records.length === 0) {
    return "storage_not_found";
  }
  if (params.enabled_records.length === 0) {
    return "storage_disabled";
  }
  if (params.matching_records.length === 0) {
    return "storage_missing_required_content";
  }
  return "storage_supports_required_content";
}

function BuildBridgeCompatibilityResult(params: {
  node_id: string;
  bridge: string;
  raw_records: unknown[];
}): proxmox_cluster_bridge_compatibility_node_record_i {
  const normalized_bridge = params.bridge.toLowerCase();
  let matched_record: Record<string, unknown> | undefined;
  for (const raw_record of params.raw_records) {
    if (!IsRecord(raw_record)) {
      continue;
    }
    const interface_id = ResolveInterfaceId(raw_record);
    if (interface_id?.toLowerCase() === normalized_bridge) {
      matched_record = raw_record;
      break;
    }
  }

  if (matched_record === undefined) {
    return {
      node_id: params.node_id,
      bridge: params.bridge,
      compatible: false,
      reason: "bridge_not_found",
      bridge_found: false,
      is_bridge: false,
    };
  }

  const interface_type = ToOptionalString(matched_record.type);
  const is_bridge = DetermineIsBridgeType(interface_type);
  return {
    node_id: params.node_id,
    bridge: params.bridge,
    compatible: is_bridge,
    reason: is_bridge ? "bridge_found" : "interface_is_not_bridge",
    bridge_found: true,
    is_bridge,
    interface_type,
    raw_interface: matched_record,
  };
}

function ResolveInterfaceId(raw_record: Record<string, unknown>): string | undefined {
  const candidates = [raw_record.iface, raw_record.interface_id, raw_record.id, raw_record.name];
  for (const candidate of candidates) {
    const value = ToOptionalString(candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function DetermineIsBridgeType(interface_type: string | undefined): boolean {
  if (interface_type === undefined) {
    return false;
  }
  const normalized_type = interface_type.toLowerCase();
  return normalized_type === "bridge" || normalized_type === "ovsbridge";
}

function ResolveStorageId(raw_record: Record<string, unknown>): string | undefined {
  const candidates = [raw_record.storage, raw_record.id, raw_record.name];
  for (const candidate of candidates) {
    const value = ToOptionalString(candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function ResolveStorageEnabled(raw_record: Record<string, unknown>): boolean {
  if (typeof raw_record.enabled === "boolean") {
    return raw_record.enabled;
  }
  if (typeof raw_record.enabled === "number") {
    return raw_record.enabled > 0;
  }
  const status = ToOptionalString(raw_record.status);
  if (status !== undefined) {
    const normalized_status = status.toLowerCase();
    if (normalized_status === "disabled") {
      return false;
    }
  }
  return true;
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

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function ToOptionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return undefined;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ShouldFallbackToClusterResources(error: unknown): boolean {
  if (error instanceof ProxmoxNotFoundError) {
    return true;
  }
  if (error instanceof ProxmoxHttpError) {
    return error.status_code === 501 || error.status_code === 405;
  }
  return false;
}

function ShouldFallbackStorageNodeFilter(error: unknown): boolean {
  if (!(error instanceof ProxmoxHttpError)) {
    return false;
  }
  return error.status_code === 400 || error.status_code === 501;
}
