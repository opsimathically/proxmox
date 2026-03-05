import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { TaskPoller, proxmox_task_result_t } from "../core/task/task_poller";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_vm_list_query_i,
  proxmox_vm_list_response_t,
  proxmox_vm_get_input_i,
  proxmox_vm_get_response_t,
  proxmox_vm_create_input_i,
  proxmox_vm_update_input_i,
  proxmox_vm_clone_input_i,
  proxmox_vm_delete_input_i,
  proxmox_vm_start_input_i,
  proxmox_vm_stop_input_i,
  proxmox_vm_restart_input_i,
  proxmox_vm_migrate_input_i,
  proxmox_vm_task_started_t,
  proxmox_vm_task_completed_t,
  proxmox_vm_task_result_t,
  proxmox_vm_reference_input_i,
  proxmox_task_polling_options_t,
} from "../types/proxmox_service_types";

export interface vm_service_input_i {
  request_client: proxmox_request_client_i;
  task_poller?: TaskPoller;
  task_polling_enabled?: boolean;
  task_poll_options?: proxmox_task_polling_options_t;
}

/**
 * Example:
 * const created = await client.vm_service.createVm({
 *   node_id: "pve1",
 *   vm_id: 200,
 *   config: {
 *     name: "web-01",
 *     memory: 4096,
 *     cores: 4,
 *   },
 * });
 *
 * const started = await client.vm_service.startVm({
 *   node_id: "pve1",
 *   vm_id: 200,
 *   wait_for_task: true,
 * });
 */
export class VmService {
  public readonly request_client: proxmox_request_client_i;
  public readonly task_poller?: TaskPoller;
  public readonly task_polling_enabled: boolean;
  public readonly task_poll_options?: proxmox_task_polling_options_t;

  constructor(params: vm_service_input_i) {
    this.request_client = params.request_client;
    this.task_poller = params.task_poller;
    this.task_polling_enabled = params.task_polling_enabled === true;
    this.task_poll_options = params.task_poll_options;
  }

  /**
   * Example:
   * const listed = await client.vm_service.listVms({ running: true });
   */
  public async listVms(params: proxmox_vm_list_query_i = {}): Promise<proxmox_vm_list_response_t> {
    const query = BuildVmListQuery(params);
    return this.request_client.request<proxmox_vm_list_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: query.path,
      node_id: query.node_id,
      query: query.request_query,
      retry_allowed: true,
    });
  }

  /**
   * Example:
   * const vm = await client.vm_service.getVm({ node_id: "pve1", vm_id: 200 });
   */
  public async getVm(params: proxmox_vm_get_input_i): Promise<proxmox_vm_get_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const vm_id = ValidateVmId(params.vm_id, "vm_id");
    return this.request_client.request<proxmox_vm_get_response_t["data"]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/qemu/${encodeURIComponent(vm_id)}/status/current`,
      node_id,
      retry_allowed: true,
    });
  }

  public async createVm(params: proxmox_vm_create_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async createVm(params: proxmox_vm_create_input_i): Promise<proxmox_vm_task_started_t>;
  public async createVm(params: proxmox_vm_create_input_i): Promise<proxmox_vm_task_result_t> {
    const node_id = ValidateNodeId(params.node_id);
    const vm_id = params.vm_id === undefined
      ? "unknown"
      : ValidateVmId(params.vm_id, "vm_id");
    const body = BuildCreateUpdateBody(params.config, "create.config");
    if (params.vm_id !== undefined) {
      body.vmid = vm_id;
    }

    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/qemu`,
      node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id,
      resource_id: vm_id,
      operation: "create",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async updateVm(params: proxmox_vm_update_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async updateVm(params: proxmox_vm_update_input_i): Promise<proxmox_vm_task_started_t>;
  public async updateVm(params: proxmox_vm_update_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
    const body = BuildCreateUpdateBody(params.config, "update.config");
    const response = await this.request_client.request<unknown>({
      method: "PUT" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}/config`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "update",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async cloneVm(params: proxmox_vm_clone_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async cloneVm(params: proxmox_vm_clone_input_i): Promise<proxmox_vm_task_started_t>;
  public async cloneVm(params: proxmox_vm_clone_input_i): Promise<proxmox_vm_task_result_t> {
    const source_reference = BuildVmReference(params);
    const new_vm_id = ValidateVmId(params.new_vm_id, "new_vm_id");
    const body = params.config ?? {};
    const clone_payload = BuildCloneBody({
      new_vm_id,
      new_name: params.new_name,
      target_node: params.target_node,
      full: params.full,
      custom_config: body,
    });
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(source_reference.node_id)}/qemu/${encodeURIComponent(source_reference.vm_id)}/clone`,
      node_id: source_reference.node_id,
      body: clone_payload,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: source_reference.node_id,
      resource_id: new_vm_id,
      operation: "clone",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async deleteVm(params: proxmox_vm_delete_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async deleteVm(params: proxmox_vm_delete_input_i): Promise<proxmox_vm_task_started_t>;
  public async deleteVm(params: proxmox_vm_delete_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
    const body = BuildDeleteBody({
      purge: params.purge,
      force: params.force,
    });
    const response = await this.request_client.request<unknown>({
      method: "DELETE" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}`,
      node_id: reference.node_id,
      body,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });

    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "delete",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async startVm(params: proxmox_vm_start_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async startVm(params: proxmox_vm_start_input_i): Promise<proxmox_vm_task_started_t>;
  public async startVm(params: proxmox_vm_start_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}/status/start`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });
    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "start",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async stopVm(params: proxmox_vm_stop_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async stopVm(params: proxmox_vm_stop_input_i): Promise<proxmox_vm_task_started_t>;
  public async stopVm(params: proxmox_vm_stop_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}/status/stop`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
      body: params.force === true
        ? {
          force: 1,
        }
        : undefined,
    });
    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "stop",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async restartVm(params: proxmox_vm_restart_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async restartVm(params: proxmox_vm_restart_input_i): Promise<proxmox_vm_task_started_t>;
  public async restartVm(params: proxmox_vm_restart_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
    const response = await this.request_client.request<unknown>({
      method: "POST" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}/status/reset`,
      node_id: reference.node_id,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });
    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "restart",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async migrateVm(params: proxmox_vm_migrate_input_i & { wait_for_task: true }): Promise<proxmox_vm_task_completed_t>;
  public async migrateVm(params: proxmox_vm_migrate_input_i): Promise<proxmox_vm_task_started_t>;
  public async migrateVm(params: proxmox_vm_migrate_input_i): Promise<proxmox_vm_task_result_t> {
    const reference = BuildVmReference(params);
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
      path: `/api2/json/nodes/${encodeURIComponent(reference.node_id)}/qemu/${encodeURIComponent(reference.vm_id)}/migrate`,
      node_id: reference.node_id,
      body: {
        target: target_node_id,
        online: params.online === true ? 1 : 0,
        force: params.force === true ? 1 : 0,
      },
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed === true,
    });
    return this.resolveTaskResult({
      response_data: response.data,
      resource_type: "qemu",
      node_id: reference.node_id,
      resource_id: reference.vm_id,
      operation: "migrate",
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
    });
  }

  public async waitForTask(params: {
    operation: "create" | "update" | "clone" | "delete" | "start" | "stop" | "restart" | "migrate";
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
    resource_type: "qemu";
    node_id: string;
    resource_id: string;
    operation: "create" | "update" | "clone" | "delete" | "start" | "stop" | "restart" | "migrate";
    wait_for_task?: boolean;
    timeout_ms?: number;
  }): Promise<proxmox_vm_task_result_t> {
    const task_id = ResolveTaskId(
      params.response_data,
      params.resource_type,
      params.node_id,
      params.resource_id,
      params.operation,
    );
    if (params.wait_for_task !== true) {
      return {
        resource_type: params.resource_type,
        node_id: params.node_id,
        task_id,
        resource_id: params.resource_id,
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
        resource_type: params.resource_type,
        resource_id: params.resource_id,
        node_id: params.node_id,
        task_id,
        operation: params.operation,
        status: completed_task.status,
        exit_status: completed_task.exit_status,
        percent: completed_task.percent,
        message: completed_task.message,
        raw: completed_task.raw,
      };
    }

    return {
      resource_type: params.resource_type,
      node_id: params.node_id,
      task_id,
      resource_id: params.resource_id,
      operation: params.operation,
      status: "running",
      raw: params.response_data,
    };
  }
}

function BuildVmListQuery(params: proxmox_vm_list_query_i): {
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
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/qemu`,
      request_query,
    };
  }

  request_query.type = "qemu";
  if (params.full !== undefined) {
    request_query.full = params.full;
  }

  return {
    node_id: undefined,
    path: "/api2/json/cluster/resources",
    request_query,
  };
}

function BuildVmReference(params: proxmox_vm_reference_input_i): {
  node_id: string;
  vm_id: string;
} {
  return {
    node_id: ValidateNodeId(params.node_id),
    vm_id: ValidateVmId(params.vm_id, "vm_id"),
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

function BuildCloneBody(params: {
  new_vm_id: string;
  new_name?: string;
  target_node?: string;
  full?: number | boolean;
  custom_config?: Record<string, unknown>;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    newid: params.new_vm_id,
  };
  if (params.new_name !== undefined) {
    const trimmed_name = params.new_name.trim();
    if (trimmed_name.length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "new_name must not be empty.",
        details: {
          field: "new_name",
        },
      });
    }
    payload.name = trimmed_name;
  }
  if (params.target_node !== undefined) {
    payload.target = ValidateNodeId(params.target_node);
  }
  if (params.full !== undefined) {
    payload.full = params.full === true ? 1 : 0;
  }
  if (params.custom_config && Object.keys(params.custom_config).length > 0) {
    return {
      ...payload,
      ...params.custom_config,
    };
  }

  return payload;
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
  _resource_type: "qemu",
  _node_id: string,
  _resource_id: string,
  operation: "create" | "update" | "clone" | "delete" | "start" | "stop" | "restart" | "migrate",
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
      value: _node_id,
    },
  });
}

function ValidateVmId(raw_vm_id: string | number, field: string): string {
  const normalized = typeof raw_vm_id === "number"
    ? String(raw_vm_id)
    : raw_vm_id.trim();
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
