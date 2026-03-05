import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_cluster_nodes_query_i,
  proxmox_cluster_status_response_t,
  proxmox_cluster_membership_response_t,
  proxmox_cluster_nodes_response_t,
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
