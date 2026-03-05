import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { TaskPoller, proxmox_task_result_t } from "../core/task/task_poller";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_task_polling_options_t,
  proxmox_lxc_list_query_i,
  proxmox_lxc_list_response_t,
  proxmox_lxc_reference_request_i,
  proxmox_lxc_get_response_t,
  proxmox_lxc_create_input_i,
  proxmox_lxc_update_input_i,
  proxmox_lxc_delete_input_i,
  proxmox_lxc_start_input_i,
  proxmox_lxc_stop_input_i,
  proxmox_lxc_migrate_input_i,
  proxmox_lxc_snapshot_input_i,
  proxmox_lxc_restore_input_i,
  proxmox_lxc_task_started_t,
  proxmox_lxc_task_completed_t,
  proxmox_lxc_task_result_t,
} from "../types/proxmox_service_types";

export interface lxc_service_input_i {
  request_client: proxmox_request_client_i;
  task_poller?: TaskPoller;
  task_polling_enabled?: boolean;
  task_poll_options?: proxmox_task_polling_options_t;
}

/**
 * Example:
 * const created = await client.lxc_service.createContainer({
 *   node_id: "pve1",
 *   config: {
 *     ostemplate: "local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst",
 *     storage: "local-lvm",
 *   },
 * });
 *
 * const started = await client.lxc_service.startContainer({
 *   node_id: "pve1",
 *   container_id: created.resource_id,
 *   wait_for_task: true,
 * });
 */
export class LxcService {
  public readonly request_client: proxmox_request_client_i;
  public readonly task_poller?: TaskPoller;
  public readonly task_polling_enabled: boolean;
  public readonly task_poll_options?: proxmox_task_polling_options_t;

  constructor(params: lxc_service_input_i) {
    this.request_client = params.request_client;
    this.task_poller = params.task_poller;
    this.task_polling_enabled = params.task_polling_enabled === true;
    this.task_poll_options = params.task_poll_options;
  }

  /**
   * Example:
   * const list = await client.lxc_service.listContainers({ node_id: "pve1" });
   */
  public async listContainers(params: proxmox_lxc_list_query_i = {}): Promise<proxmox_lxc_list_response_t> {
    const query = BuildLxcListQuery(params);
    return this.request_client.request<proxmox_lxc_list_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: query.path,
      node_id: query.node_id,
      query: query.request_query,
      retry_allowed: true,
    });
  }

  /**
   * Example:
   * const container = await client.lxc_service.getContainer({
   *   node_id: "pve1",
   *   container_id: "101",
   * });
   */
  public async getContainer(params: proxmox_lxc_reference_request_i): Promise<proxmox_lxc_get_response_t> {
    const normalized = BuildLxcReference(params);
    return this.request_client.request<proxmox_lxc_get_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(normalized.node_id)}/lxc/${encodeURIComponent(normalized.container_id)}/status/current`,
      node_id: normalized.node_id,
      retry_allowed: true,
    });
  }

  public async createContainer(params: proxmox_lxc_create_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async createContainer(params: proxmox_lxc_create_input_i): Promise<proxmox_lxc_task_started_t>;
  public async createContainer(params: proxmox_lxc_create_input_i): Promise<proxmox_lxc_task_result_t> {
    const node_id = ValidateNodeId(params.node_id);
    const container_id = params.container_id === undefined
      ? "unknown"
      : ValidateContainerId(params.container_id, "container_id");
    const body = BuildCreateUpdateBody(params.config, "create.config");

    if (params.container_id !== undefined) {
      body.vmid = container_id;
    }

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/lxc`,
      node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id,
      container_id,
      operation: "create",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async updateContainer(params: proxmox_lxc_update_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async updateContainer(params: proxmox_lxc_update_input_i): Promise<proxmox_lxc_task_started_t>;
  public async updateContainer(params: proxmox_lxc_update_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const body = BuildCreateUpdateBody(params.config, "update.config");
    const response = await this.request_client.request<unknown>({
      method: "PUT" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/config`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "update",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async deleteContainer(params: proxmox_lxc_delete_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async deleteContainer(params: proxmox_lxc_delete_input_i): Promise<proxmox_lxc_task_started_t>;
  public async deleteContainer(params: proxmox_lxc_delete_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const body = BuildDeleteBody({
      purge: params.purge,
      force: params.force,
    });
    const response = await this.request_client.request<unknown>({
      method: "DELETE" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "delete",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async startContainer(params: proxmox_lxc_start_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async startContainer(params: proxmox_lxc_start_input_i): Promise<proxmox_lxc_task_started_t>;
  public async startContainer(params: proxmox_lxc_start_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/status/start`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "start",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async stopContainer(params: proxmox_lxc_stop_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async stopContainer(params: proxmox_lxc_stop_input_i): Promise<proxmox_lxc_task_started_t>;
  public async stopContainer(params: proxmox_lxc_stop_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/status/stop`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
      body: params.force === true
        ? {
          timeout: params.timeout_ms,
        }
        : undefined,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "stop",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async migrateContainer(params: proxmox_lxc_migrate_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async migrateContainer(params: proxmox_lxc_migrate_input_i): Promise<proxmox_lxc_task_started_t>;
  public async migrateContainer(params: proxmox_lxc_migrate_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const target_node_id = ValidateNodeId(params.target_node_id);
    if (target_node_id.toLowerCase() === reference.node_id.toLowerCase()) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "target_node_id must be different from source node_id for migrate.",
        details: {
          field: "target_node_id",
        },
      });
    }

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/migrate`,
      node_id: reference.node_id,
      body: {
        target: target_node_id,
        restart: params.restart === true ? 1 : 0,
        migrate_volumes: params.migrate_volumes === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "migrate",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i): Promise<proxmox_lxc_task_started_t>;
  public async snapshotContainer(params: proxmox_lxc_snapshot_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const snapshot_name = ValidateSnapshotName(params.snapshot_name);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/snapshot`,
      node_id: reference.node_id,
      body: {
        snapname: snapshot_name,
        description: params.description,
        vmstate: params.include_memory === true ? 1 : 0,
        stop: params.stop === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "snapshot",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async restoreContainer(params: proxmox_lxc_restore_input_i & { wait_for_task: true }): Promise<proxmox_lxc_task_completed_t>;
  public async restoreContainer(params: proxmox_lxc_restore_input_i): Promise<proxmox_lxc_task_started_t>;
  public async restoreContainer(params: proxmox_lxc_restore_input_i): Promise<proxmox_lxc_task_result_t> {
    const reference = BuildLxcReference(params);
    const snapshot_name = ValidateSnapshotName(params.snapshot_name);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/lxc/${encodeURIComponent(reference.container_id)}/snapshot/${encodeURIComponent(snapshot_name)}/rollback`,
      node_id: reference.node_id,
      body: {
        force: params.force === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      node_id: reference.node_id,
      container_id: reference.container_id,
      operation: "restore",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async waitForTask(params: {
    operation: "create" | "update" | "delete" | "start" | "stop" | "migrate" | "snapshot" | "restore";
    node_id: string;
    task_id: string;
    timeout_ms?: number;
  }): Promise<proxmox_task_result_t> {
    const request_node_id = ValidateNodeId(params.node_id);
    if (this.task_poller === undefined || !this.task_polling_enabled) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Task polling is disabled or not configured.",
        details: {
          field: "task_poller",
        },
      });
    }
    const node_connection = this.request_client.resolveNode(request_node_id);
    const auth_header = await node_connection.auth_provider.getAuthHeader();
    return this.task_poller!.waitForTaskCompletion({
      node: request_node_id,
      task_id: params.task_id,
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
  }

  private async resolveTaskResult(params: {
    response_data: unknown;
    node_id: string;
    container_id: string;
    operation: "create" | "update" | "delete" | "start" | "stop" | "migrate" | "snapshot" | "restore";
    wait_for_task?: boolean;
    timeout_ms?: number;
  }): Promise<proxmox_lxc_task_result_t> {
    const task_id = ResolveTaskId(
      params.response_data,
      params.container_id,
      params.operation,
      params.node_id,
    );

    if (params.wait_for_task !== true) {
      return {
        resource_type: "lxc",
        node_id: params.node_id,
        task_id,
        resource_id: params.container_id,
        operation: params.operation,
      };
    }

    if (this.task_poller !== undefined && this.task_polling_enabled) {
      const node_connection = this.request_client.resolveNode(params.node_id);
      const auth_header = await node_connection.auth_provider.getAuthHeader();
      const completed_task = await this.task_poller.waitForTaskCompletion({
        node: params.node_id,
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
        resource_type: "lxc",
        node_id: params.node_id,
        task_id,
        resource_id: params.container_id,
        operation: params.operation,
        status: completed_task.status,
        exit_status: completed_task.exit_status,
        percent: completed_task.percent,
        message: completed_task.message,
        raw: completed_task.raw,
      };
    }

    return {
      resource_type: "lxc",
      node_id: params.node_id,
      task_id,
      resource_id: params.container_id,
      operation: params.operation,
      status: "running",
      raw: params.response_data,
    };
  }
}

function BuildLxcListQuery(params: proxmox_lxc_list_query_i): {
  node_id?: string;
  path: string;
  request_query: { [key: string]: string | number | boolean };
} {
  const request_query: { [key: string]: string | number | boolean } = {};
  const node_id = ValidateOptionalNodeId(params.node_id);
  if (params.running !== undefined) {
    request_query.status = params.running ? "running" : "stopped";
  }
  if (params.pool !== undefined) {
    const pool = params.pool.trim();
    if (!pool) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "pool must not be empty.",
        details: {
          field: "pool",
        },
      });
    }
    request_query.pool = pool;
  }

  if (node_id !== undefined) {
    return {
      node_id,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/lxc`,
      request_query,
    };
  }

  request_query.type = "lxc";
  if (params.full !== undefined) {
    request_query.full = params.full;
  }

  return {
    node_id: undefined,
    path: "/api2/json/cluster/resources",
    request_query,
  };
}

function BuildLxcReference(params: proxmox_lxc_reference_request_i): {
  node_id: string;
  container_id: string;
} {
  return {
    node_id: ValidateNodeId(params.node_id),
    container_id: ValidateContainerId(params.container_id, "container_id"),
  };
}

function BuildCreateUpdateBody(raw_config: Record<string, unknown>, _field: string): Record<string, unknown> {
  if (!raw_config || typeof raw_config !== "object" || Array.isArray(raw_config)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "config must be an object.",
      details: {
        field: "config",
      },
    });
  }

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(raw_config)) {
    if (key.trim()) {
      sanitized[key.trim()] = raw_config[key];
    }
  }
  if (Object.keys(sanitized).length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "config must contain at least one value.",
      details: {
        field: "config",
      },
    });
  }
  return sanitized;
}

function BuildDeleteBody(params: {
  purge?: boolean;
  force?: boolean;
}): Record<string, number> | undefined {
  const keys_present = params.purge !== undefined || params.force !== undefined;
  if (!keys_present) {
    return undefined;
  }
  return {
    purge: params.purge === true ? 1 : 0,
    force: params.force === true ? 1 : 0,
  };
}

function ResolveTaskId(
  raw_task: unknown,
  _container_id: string,
  operation: string,
  node_id: string,
): string {
  if (typeof raw_task === "string" && raw_task.trim().length > 0) {
    return raw_task.trim();
  }

  if (raw_task !== null && raw_task !== undefined && typeof raw_task === "object") {
    const typed = raw_task as Record<string, unknown>;
    if (typeof typed.upid === "string" && typed.upid.trim().length > 0) {
      return typed.upid.trim();
    }
    if (typeof typed.task === "string" && typed.task.trim().length > 0) {
      return typed.task.trim();
    }
    if (typeof typed.task_id === "string" && typed.task_id.trim().length > 0) {
      return typed.task_id.trim();
    }
  }

  throw new ProxmoxValidationError({
    code: "proxmox.validation.missing_input",
    message: `${operation} response did not include a task id.`,
    details: {
      field: `${operation}.task_id`,
      value: node_id,
    },
  });
}

function ValidateContainerId(raw_container_id: string | number, field: string): string {
  const normalized = typeof raw_container_id === "number"
    ? String(raw_container_id)
    : raw_container_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field} is required and cannot be empty.`,
      details: {
        field,
      },
    });
  }
  if (!/^\d+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field} must be a numeric identifier.`,
      details: {
        field,
      },
    });
  }
  return normalized;
}

function ValidateNodeId(raw_node_id: string): string {
  if (!raw_node_id.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id is required and cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }
  return raw_node_id.trim();
}

function ValidateOptionalNodeId(raw_node_id?: string): string | undefined {
  if (raw_node_id === undefined) {
    return undefined;
  }
  return ValidateNodeId(raw_node_id);
}

function ValidateSnapshotName(snapshot_name: string): string {
  const normalized = snapshot_name.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "snapshot_name is required and cannot be empty.",
      details: {
        field: "snapshot_name",
      },
    });
  }
  return normalized;
}
