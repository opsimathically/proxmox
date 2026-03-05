import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { TaskPoller } from "../core/task/task_poller";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_node_list_query_i,
  proxmox_node_status_query_i,
  proxmox_node_services_query_i,
  proxmox_node_metrics_request_i,
  proxmox_node_reboot_input_i,
  proxmox_node_reboot_result_t,
  proxmox_node_list_response_t,
  proxmox_node_status_response_t,
  proxmox_node_services_response_t,
  proxmox_node_metrics_response_t,
} from "../types/proxmox_service_types";

export interface node_service_input_i {
  request_client: proxmox_request_client_i;
  task_poller?: TaskPoller;
  task_polling_enabled?: boolean;
  task_poll_options?: {
    interval_ms?: number;
    timeout_ms?: number;
    max_poll_failures?: number;
  };
}

export class NodeService {
  public readonly request_client: proxmox_request_client_i;
  public readonly task_poller?: TaskPoller;
  public readonly task_polling_enabled: boolean;
  public readonly task_poll_options?: {
    interval_ms?: number;
    timeout_ms?: number;
    max_poll_failures?: number;
  };

  constructor(params: node_service_input_i) {
    this.request_client = params.request_client;
    this.task_poller = params.task_poller;
    this.task_polling_enabled = params.task_polling_enabled === true;
    this.task_poll_options = params.task_poll_options;
  }

  public async listNodes(params: proxmox_node_list_query_i = {}): Promise<proxmox_node_list_response_t> {
    const query = BuildNodeListQuery(params);
    return this.request_client.request<proxmox_node_list_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: "/api2/json/nodes",
      query: query.raw_query,
      node_id: query.node_id,
    });
  }

  public async getNodeStatus(params: proxmox_node_status_query_i): Promise<proxmox_node_status_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    return this.request_client.request<proxmox_node_status_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/status`,
      node_id,
    });
  }

  public async getServices(params: proxmox_node_services_query_i): Promise<proxmox_node_services_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    return this.request_client.request<proxmox_node_services_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/services`,
      node_id,
    });
  }

  public async getNodeMetrics(params: proxmox_node_metrics_request_i): Promise<proxmox_node_metrics_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const query = BuildNodeMetricsQuery(params);
    return this.request_client.request<proxmox_node_metrics_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/rrddata`,
      node_id,
      query,
    });
  }

  public async rebootNode(params: proxmox_node_reboot_input_i): Promise<proxmox_node_reboot_result_t> {
    const node_id = ValidateNodeId(params.node_id);
    const request_body = {
      command: "reboot",
      force: params.force === true ? 1 : 0,
    };

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/status`,
      node_id,
      body: request_body,
      timeout_ms: params.timeout_ms,
    });

    const task_id = ResolveTaskId(response.data, node_id);
    if (params.wait_for_task !== true) {
      return {
        task_id,
        node_id,
      };
    }

    if (this.task_poller !== undefined && this.task_polling_enabled) {
      const node_connection = this.request_client.resolveNode(node_id);
      const auth_header = await node_connection.auth_provider.getAuthHeader();
      const completed_task = await this.task_poller.waitForTaskCompletion({
        node: node_id,
        task_id,
        host: node_connection.host,
        protocol: node_connection.protocol,
        port: node_connection.port,
        verify_tls: node_connection.verify_tls,
        request_timeout_ms: params.timeout_ms,
        request_headers: {
          Authorization: auth_header,
        },
        options: this.task_poll_options,
      });
      return {
        task_id,
        node_id,
        status: completed_task.status,
        exit_status: completed_task.exit_status,
        percent: completed_task.percent,
        message: completed_task.message,
        raw: completed_task.raw,
      };
    }

    return {
      task_id,
      node_id,
      status: "running",
      raw: response.data,
    };
  }

}

function ValidateNodeId(node_id: string): string {
  if (!node_id.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id is required and cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }
  return node_id.trim();
}

function BuildNodeListQuery(params: proxmox_node_list_query_i): {
  node_id?: string;
  raw_query: { [key: string]: string };
} {
  if (params.running !== undefined && typeof params.running !== "boolean") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "running must be boolean.",
      details: {
        field: "running",
      },
    });
  }
  const raw_query: { [key: string]: string } = {};
  if (params.running !== undefined) {
    raw_query.running = params.running ? "1" : "0";
  }
  return {
    node_id: undefined,
    raw_query,
  };
}

function BuildNodeMetricsQuery(params: proxmox_node_metrics_request_i): {
  start?: number;
  end?: number;
  datasource?: string;
  cf?: string;
} {
  if (params.start_time !== undefined && (!Number.isInteger(params.start_time) || params.start_time < 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "start_time must be a non-negative integer.",
      details: {
        field: "start_time",
      },
    });
  }
  if (params.end_time !== undefined && (!Number.isInteger(params.end_time) || params.end_time < 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "end_time must be a non-negative integer.",
      details: {
        field: "end_time",
      },
    });
  }
  const request_query: {
    start?: number;
    end?: number;
    datasource?: string;
    cf?: string;
  } = {};
  if (params.start_time !== undefined) {
    request_query.start = params.start_time;
  }
  if (params.end_time !== undefined) {
    request_query.end = params.end_time;
  }
  if (params.datasource !== undefined) {
    const datasource = params.datasource.trim();
    if (!datasource) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "datasource must not be empty.",
        details: {
          field: "datasource",
        },
      });
    }
    request_query.datasource = datasource;
  }
  if (params.cf !== undefined) {
    const cf = params.cf.trim();
    if (!cf) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "cf must not be empty.",
        details: {
          field: "cf",
        },
      });
    }
    request_query.cf = cf;
  }

  return request_query;
}

function ResolveTaskId(raw_task: unknown, fallback_node: string): string {
  if (typeof raw_task === "string" && raw_task.trim().length > 0) {
    return raw_task.trim();
  }

  if (raw_task !== null && raw_task !== undefined && typeof raw_task === "object") {
    const as_record = raw_task as Record<string, unknown>;
    if (typeof as_record.upid === "string" && as_record.upid.trim().length > 0) {
      return as_record.upid.trim();
    }
    if (typeof as_record.task === "string" && as_record.task.trim().length > 0) {
      return as_record.task.trim();
    }
    if (typeof as_record.task_id === "string" && as_record.task_id.trim().length > 0) {
      return as_record.task_id.trim();
    }
  }

  throw new ProxmoxValidationError({
    code: "proxmox.validation.missing_input",
    message: "Reboot response did not include a task id.",
    details: {
      field: "reboot.task_id",
      value: fallback_node,
    },
  });
}
