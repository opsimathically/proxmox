import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_datacenter_storage_query_i,
  proxmox_datacenter_summary_query_i,
  proxmox_datacenter_storage_response_t,
  proxmox_datacenter_summary_response_t,
  proxmox_datacenter_version_response_t,
} from "../types/proxmox_service_types";

export interface datacenter_service_input_i {
  request_client: proxmox_request_client_i;
}

export class DatacenterService {
  public readonly request_client: proxmox_request_client_i;

  constructor(params: datacenter_service_input_i) {
    this.request_client = params.request_client;
  }

  public async getSummary(params: proxmox_datacenter_summary_query_i = {}): Promise<proxmox_datacenter_summary_response_t> {
    const query = BuildDatacenterSummaryQuery(params);
    return this.request_client.request<proxmox_datacenter_summary_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/cluster/status",
      node_id: query.node_id,
      query: query.raw_query,
    });
  }

  public async getVersion(): Promise<proxmox_datacenter_version_response_t> {
    return this.request_client.request<proxmox_datacenter_version_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/version",
    });
  }

  public async listStorage(params: proxmox_datacenter_storage_query_i = {}): Promise<proxmox_datacenter_storage_response_t> {
    const query = BuildDatacenterStorageQuery(params);
    return this.request_client.request<proxmox_datacenter_storage_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/storage",
      query: query.raw_query,
    });
  }

}

function BuildDatacenterSummaryQuery(params: proxmox_datacenter_summary_query_i): {
  node_id?: string;
  raw_query: { [key: string]: string };
} {
  if (params.node_id !== undefined && !params.node_id.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }

  const raw_query: { [key: string]: string } = {};
  if (params.details !== undefined) {
    raw_query.details = params.details ? "1" : "0";
  }

  return {
    node_id: params.node_id?.trim(),
    raw_query,
  };
}

function BuildDatacenterStorageQuery(params: proxmox_datacenter_storage_query_i): {
  raw_query: { [key: string]: string };
} {
  if (params.content !== undefined && params.content.trim() === "") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "content filter must not be empty.",
      details: {
        field: "content",
      },
    });
  }
  if (params.node !== undefined && params.node.trim() === "") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node filter must not be empty.",
      details: {
        field: "node",
      },
    });
  }
  if (params.storage !== undefined && params.storage.trim() === "") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "storage filter must not be empty.",
      details: {
        field: "storage",
      },
    });
  }
  if (params.type !== undefined && params.type.trim() === "") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "type filter must not be empty.",
      details: {
        field: "type",
      },
    });
  }

  const raw_query: { [key: string]: string } = {};
  if (params.content !== undefined) {
    raw_query.content = params.content.trim();
  }
  if (params.node !== undefined) {
    raw_query.node = params.node.trim();
  }
  if (params.storage !== undefined) {
    raw_query.storage = params.storage.trim();
  }
  if (params.type !== undefined) {
    raw_query.type = params.type.trim();
  }

  return {
    raw_query,
  };
}
