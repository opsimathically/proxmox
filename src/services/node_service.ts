import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { TaskPoller } from "../core/task/task_poller";
import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_node_list_query_i,
  proxmox_node_status_query_i,
  proxmox_node_network_interfaces_query_i,
  proxmox_node_network_interface_query_i,
  proxmox_node_bridges_query_i,
  proxmox_node_cpu_capacity_query_i,
  proxmox_node_core_preflight_input_i,
  proxmox_node_memory_capacity_query_i,
  proxmox_node_memory_allocation_query_i,
  proxmox_node_memory_preflight_input_i,
  proxmox_node_services_query_i,
  proxmox_node_metrics_request_i,
  proxmox_node_reboot_input_i,
  proxmox_node_reboot_result_t,
  proxmox_node_list_response_t,
  proxmox_node_status_response_t,
  proxmox_node_network_interface_response_t,
  proxmox_node_network_interface_list_response_t,
  proxmox_node_bridge_list_response_t,
  proxmox_node_cpu_capacity_response_t,
  proxmox_node_core_preflight_response_t,
  proxmox_node_memory_capacity_response_t,
  proxmox_node_memory_allocation_response_t,
  proxmox_node_memory_preflight_response_t,
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

  public async listNetworkInterfaces(
    params: proxmox_node_network_interfaces_query_i,
  ): Promise<proxmox_node_network_interface_list_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const type_filter = ValidateNetworkInterfaceTypeFilter(params.type);
    const response = await this.request_client.request<unknown[]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/network`,
      node_id,
      retry_allowed: true,
    });
    const normalized_interfaces = NormalizeNodeNetworkInterfaces({
      raw_records: response.data,
      type_filter,
    });
    return {
      ...response,
      data: normalized_interfaces,
    };
  }

  public async listBridges(
    params: proxmox_node_bridges_query_i,
  ): Promise<proxmox_node_bridge_list_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const interfaces_response = await this.listNetworkInterfaces({
      node_id,
      type: "any_bridge",
    });
    return {
      ...interfaces_response,
      data: interfaces_response.data.map((record) => ({
        ...record,
        is_bridge: true,
      })),
    };
  }

  public async getNetworkInterface(
    params: proxmox_node_network_interface_query_i,
  ): Promise<proxmox_node_network_interface_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const interface_id = ValidateNetworkInterfaceId(params.interface_id);
    const response = await this.request_client.request<unknown>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(node_id)}/network/${encodeURIComponent(interface_id)}`,
      node_id,
      retry_allowed: true,
    });
    return {
      ...response,
      data: NormalizeNodeNetworkInterfaceRecord({
        raw_record: response.data,
        fallback_interface_id: interface_id,
      }),
    };
  }

  public async getNodeCpuCapacity(
    params: proxmox_node_cpu_capacity_query_i,
  ): Promise<proxmox_node_cpu_capacity_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const status_response = await this.getNodeStatus({
      node_id,
    });
    const normalized_cpu_capacity = NormalizeNodeCpuCapacity({
      node_id,
      raw_status: ToRecord(status_response.data),
    });
    return {
      ...status_response,
      data: normalized_cpu_capacity,
    };
  }

  public async canAllocateCores(
    params: proxmox_node_core_preflight_input_i,
  ): Promise<proxmox_node_core_preflight_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const requested_cores = ValidateRequestedCores(params.requested_cores);
    const mode = ValidateCorePreflightMode(params.mode);
    const capacity_response = await this.getNodeCpuCapacity({
      node_id,
    });
    const available_cores = mode === "physical"
      ? capacity_response.data.physical_core_count
      : capacity_response.data.logical_cpu_count;

    let allowed = false;
    let reason: "within_limit" | "exceeds_limit" | "capacity_unknown" = "capacity_unknown";
    if (available_cores !== undefined) {
      allowed = requested_cores <= available_cores;
      reason = allowed ? "within_limit" : "exceeds_limit";
    }

    return {
      ...capacity_response,
      data: {
        node_id,
        mode,
        requested_cores,
        available_cores,
        allowed,
        reason,
      },
    };
  }

  public async getNodeMemoryCapacity(
    params: proxmox_node_memory_capacity_query_i,
  ): Promise<proxmox_node_memory_capacity_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const status_response = await this.getNodeStatus({
      node_id,
    });
    const normalized_memory_capacity = NormalizeNodeMemoryCapacity({
      node_id,
      raw_status: ToRecord(status_response.data),
    });
    return {
      ...status_response,
      data: normalized_memory_capacity,
    };
  }

  public async getNodeMemoryAllocations(
    params: proxmox_node_memory_allocation_query_i,
  ): Promise<proxmox_node_memory_allocation_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const include_stopped = params.include_stopped === true;
    const [qemu_response, lxc_response] = await Promise.all([
      this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: `/api2/json/nodes/${encodeURIComponent(node_id)}/qemu`,
        node_id,
        retry_allowed: true,
      }),
      this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: `/api2/json/nodes/${encodeURIComponent(node_id)}/lxc`,
        node_id,
        retry_allowed: true,
      }),
    ]);

    const normalized_allocations = NormalizeNodeMemoryAllocations({
      node_id,
      include_stopped,
      raw_qemu_records: qemu_response.data,
      raw_lxc_records: lxc_response.data,
    });
    return {
      ...qemu_response,
      data: normalized_allocations,
    };
  }

  public async canAllocateMemory(
    params: proxmox_node_memory_preflight_input_i,
  ): Promise<proxmox_node_memory_preflight_response_t> {
    const node_id = ValidateNodeId(params.node_id);
    const requested_memory_bytes = ValidateRequestedMemoryBytes(params.requested_memory_bytes);
    const mode = ValidateMemoryPreflightMode(params.mode);
    const memory_capacity_response = await this.getNodeMemoryCapacity({
      node_id,
    });

    let available_memory_bytes: number | undefined;
    if (mode === "free_headroom") {
      available_memory_bytes = memory_capacity_response.data.free_memory_bytes;
    } else {
      const memory_allocations_response = await this.getNodeMemoryAllocations({
        node_id,
        include_stopped: true,
      });
      if (memory_capacity_response.data.total_memory_bytes !== undefined) {
        const raw_available = memory_capacity_response.data.total_memory_bytes
          - memory_allocations_response.data.allocated_memory_bytes_total;
        available_memory_bytes = raw_available >= 0 ? raw_available : 0;
      }
    }

    let allowed = false;
    let reason: "within_limit" | "exceeds_limit" | "capacity_unknown" = "capacity_unknown";
    if (available_memory_bytes !== undefined) {
      allowed = requested_memory_bytes <= available_memory_bytes;
      reason = allowed ? "within_limit" : "exceeds_limit";
    }

    return {
      ...memory_capacity_response,
      data: {
        node_id,
        mode,
        requested_memory_bytes,
        available_memory_bytes,
        allowed,
        reason,
      },
    };
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

function ValidateRequestedCores(requested_cores: number): number {
  if (!Number.isInteger(requested_cores) || requested_cores <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "requested_cores must be a positive integer.",
      details: {
        field: "requested_cores",
      },
    });
  }
  return requested_cores;
}

function ValidateCorePreflightMode(
  mode: "logical" | "physical" | undefined,
): "logical" | "physical" {
  if (mode === undefined) {
    return "logical";
  }
  if (mode === "logical" || mode === "physical") {
    return mode;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "mode must be logical or physical.",
    details: {
      field: "mode",
    },
  });
}

function ValidateNetworkInterfaceTypeFilter(
  type_filter: "any_bridge" | "bridge" | "physical" | "vlan" | "bond" | undefined,
): "any_bridge" | "bridge" | "physical" | "vlan" | "bond" | undefined {
  if (type_filter === undefined) {
    return undefined;
  }
  if (
    type_filter === "any_bridge"
    || type_filter === "bridge"
    || type_filter === "physical"
    || type_filter === "vlan"
    || type_filter === "bond"
  ) {
    return type_filter;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "type must be any_bridge, bridge, physical, vlan, or bond.",
    details: {
      field: "type",
    },
  });
}

function ValidateNetworkInterfaceId(interface_id: string): string {
  const normalized_interface_id = interface_id.trim();
  if (!normalized_interface_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "interface_id is required and cannot be empty.",
      details: {
        field: "interface_id",
      },
    });
  }
  return normalized_interface_id;
}

function ValidateRequestedMemoryBytes(requested_memory_bytes: number): number {
  if (!Number.isInteger(requested_memory_bytes) || requested_memory_bytes <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "requested_memory_bytes must be a positive integer.",
      details: {
        field: "requested_memory_bytes",
      },
    });
  }
  return requested_memory_bytes;
}

function ValidateMemoryPreflightMode(
  mode: "free_headroom" | "allocated_headroom" | undefined,
): "free_headroom" | "allocated_headroom" {
  if (mode === undefined) {
    return "free_headroom";
  }
  if (mode === "free_headroom" || mode === "allocated_headroom") {
    return mode;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "mode must be free_headroom or allocated_headroom.",
    details: {
      field: "mode",
    },
  });
}

function NormalizeNodeNetworkInterfaces(params: {
  raw_records: unknown;
  type_filter?: "any_bridge" | "bridge" | "physical" | "vlan" | "bond";
}): Array<{
  interface_id: string;
  type?: string;
  active?: boolean;
  autostart?: boolean;
  is_bridge: boolean;
  bridge_ports?: string[];
  bridge_vlan_aware?: boolean;
  address?: string;
  cidr?: string;
  method?: string;
  comments?: string;
  raw: Record<string, unknown>;
}> {
  if (!Array.isArray(params.raw_records)) {
    return [];
  }
  const normalized_records: Array<{
    interface_id: string;
    type?: string;
    active?: boolean;
    autostart?: boolean;
    is_bridge: boolean;
    bridge_ports?: string[];
    bridge_vlan_aware?: boolean;
    address?: string;
    cidr?: string;
    method?: string;
    comments?: string;
    raw: Record<string, unknown>;
  }> = [];
  for (const raw_record of params.raw_records) {
    const normalized_record = NormalizeNodeNetworkInterfaceRecord({
      raw_record,
    });
    if (normalized_record.interface_id === "unknown") {
      continue;
    }
    if (!IsNetworkInterfaceTypeMatch({
      record: normalized_record,
      type_filter: params.type_filter,
    })) {
      continue;
    }
    normalized_records.push(normalized_record);
  }
  return normalized_records;
}

function NormalizeNodeNetworkInterfaceRecord(params: {
  raw_record: unknown;
  fallback_interface_id?: string;
}): {
  interface_id: string;
  type?: string;
  active?: boolean;
  autostart?: boolean;
  is_bridge: boolean;
  bridge_ports?: string[];
  bridge_vlan_aware?: boolean;
  address?: string;
  cidr?: string;
  method?: string;
  comments?: string;
  raw: Record<string, unknown>;
} {
  const record = ToRecord(params.raw_record);
  const interface_id =
    ToOptionalString(record.iface)
    ?? ToOptionalString(record.interface)
    ?? params.fallback_interface_id
    ?? "unknown";
  const type = ToOptionalString(record.type);
  const normalized_type = type?.toLowerCase();
  const is_bridge = normalized_type === "bridge" || normalized_type === "ovsbridge";
  return {
    interface_id,
    type,
    active: ToOptionalBoolean(record.active),
    autostart: ToOptionalBoolean(record.autostart),
    is_bridge,
    bridge_ports: ToOptionalStringList(record.bridge_ports),
    bridge_vlan_aware: ToOptionalBoolean(record.bridge_vlan_aware),
    address: ToOptionalString(record.address),
    cidr: ToOptionalString(record.cidr),
    method: ToOptionalString(record.method),
    comments: ToOptionalString(record.comments),
    raw: record,
  };
}

function IsNetworkInterfaceTypeMatch(params: {
  record: {
    interface_id: string;
    type?: string;
    is_bridge: boolean;
  };
  type_filter?: "any_bridge" | "bridge" | "physical" | "vlan" | "bond";
}): boolean {
  const type_filter = params.type_filter;
  if (type_filter === undefined) {
    return true;
  }
  const normalized_type = params.record.type?.toLowerCase();
  if (type_filter === "any_bridge") {
    return params.record.is_bridge;
  }
  if (type_filter === "bridge") {
    return normalized_type === "bridge";
  }
  if (type_filter === "vlan") {
    return normalized_type?.includes("vlan") === true;
  }
  if (type_filter === "bond") {
    return normalized_type?.includes("bond") === true;
  }
  if (type_filter === "physical") {
    return normalized_type === "eth" || normalized_type === "physical";
  }
  return false;
}

function NormalizeNodeCpuCapacity(params: {
  node_id: string;
  raw_status: Record<string, unknown>;
}): {
  node_id: string;
  logical_cpu_count?: number;
  physical_core_count?: number;
  sockets?: number;
  model?: string;
  source_fields: {
    logical_cpu_count?: string;
    physical_core_count?: string;
    sockets?: string;
    model?: string;
  };
  raw: Record<string, unknown>;
} {
  const cpuinfo = ToRecord(params.raw_status.cpuinfo);
  const source_fields: {
    logical_cpu_count?: string;
    physical_core_count?: string;
    sockets?: string;
    model?: string;
  } = {};

  let logical_cpu_count = ToOptionalPositiveInteger(cpuinfo.cpus);
  if (logical_cpu_count !== undefined) {
    source_fields.logical_cpu_count = "cpuinfo.cpus";
  } else {
    logical_cpu_count = ToOptionalPositiveInteger(params.raw_status.cpus);
    if (logical_cpu_count !== undefined) {
      source_fields.logical_cpu_count = "cpus";
    }
  }

  const sockets = ToOptionalPositiveInteger(cpuinfo.sockets);
  if (sockets !== undefined) {
    source_fields.sockets = "cpuinfo.sockets";
  }

  const model = ToOptionalString(cpuinfo.model);
  if (model !== undefined) {
    source_fields.model = "cpuinfo.model";
  }

  let physical_core_count: number | undefined;
  const cores_per_socket = ToOptionalPositiveInteger(cpuinfo.cores);
  if (cores_per_socket !== undefined && sockets !== undefined) {
    physical_core_count = cores_per_socket * sockets;
    source_fields.physical_core_count = "cpuinfo.cores*cpuinfo.sockets";
  } else if (cores_per_socket !== undefined) {
    physical_core_count = cores_per_socket;
    source_fields.physical_core_count = "cpuinfo.cores";
  }

  return {
    node_id: params.node_id,
    logical_cpu_count,
    physical_core_count,
    sockets,
    model,
    source_fields,
    raw: params.raw_status,
  };
}

function NormalizeNodeMemoryCapacity(params: {
  node_id: string;
  raw_status: Record<string, unknown>;
}): {
  node_id: string;
  total_memory_bytes?: number;
  used_memory_bytes?: number;
  free_memory_bytes?: number;
  source_fields: {
    total_memory_bytes?: string;
    used_memory_bytes?: string;
    free_memory_bytes?: string;
  };
  raw: Record<string, unknown>;
} {
  const memory_record = ToRecord(params.raw_status.memory);
  const source_fields: {
    total_memory_bytes?: string;
    used_memory_bytes?: string;
    free_memory_bytes?: string;
  } = {};

  const total_memory_bytes = ResolveNodeMemoryField({
    source_fields,
    source_field_name: "total_memory_bytes",
    primary_value: memory_record.total,
    primary_source: "memory.total",
    fallback_value: params.raw_status.memory_total,
    fallback_source: "memory_total",
  });
  const used_memory_bytes = ResolveNodeMemoryField({
    source_fields,
    source_field_name: "used_memory_bytes",
    primary_value: memory_record.used,
    primary_source: "memory.used",
    fallback_value: params.raw_status.memory_used,
    fallback_source: "memory_used",
  });

  let free_memory_bytes = ResolveNodeMemoryField({
    source_fields,
    source_field_name: "free_memory_bytes",
    primary_value: memory_record.free,
    primary_source: "memory.free",
    fallback_value: params.raw_status.memory_free,
    fallback_source: "memory_free",
  });
  if (
    free_memory_bytes === undefined
    && total_memory_bytes !== undefined
    && used_memory_bytes !== undefined
  ) {
    const computed_free_memory_bytes = total_memory_bytes - used_memory_bytes;
    if (computed_free_memory_bytes >= 0) {
      free_memory_bytes = computed_free_memory_bytes;
      source_fields.free_memory_bytes = "computed(total-used)";
    }
  }

  return {
    node_id: params.node_id,
    total_memory_bytes,
    used_memory_bytes,
    free_memory_bytes,
    source_fields,
    raw: params.raw_status,
  };
}

function ResolveNodeMemoryField(params: {
  source_fields: {
    total_memory_bytes?: string;
    used_memory_bytes?: string;
    free_memory_bytes?: string;
  };
  source_field_name: "total_memory_bytes" | "used_memory_bytes" | "free_memory_bytes";
  primary_value: unknown;
  primary_source: string;
  fallback_value: unknown;
  fallback_source: string;
}): number | undefined {
  const primary_value = ToOptionalNonNegativeInteger(params.primary_value);
  if (primary_value !== undefined) {
    params.source_fields[params.source_field_name] = params.primary_source;
    return primary_value;
  }
  const fallback_value = ToOptionalNonNegativeInteger(params.fallback_value);
  if (fallback_value !== undefined) {
    params.source_fields[params.source_field_name] = params.fallback_source;
    return fallback_value;
  }
  return undefined;
}

function NormalizeNodeMemoryAllocations(params: {
  node_id: string;
  include_stopped: boolean;
  raw_qemu_records: unknown;
  raw_lxc_records: unknown;
}): {
  node_id: string;
  include_stopped: boolean;
  resource_count: number;
  allocated_memory_bytes_total: number;
  used_memory_bytes_total: number;
  resources: Array<{
    resource_type: "qemu" | "lxc";
    resource_id: string;
    name?: string;
    status?: string;
    memory_used_bytes?: number;
    memory_limit_bytes?: number;
    raw: Record<string, unknown>;
  }>;
} {
  const qemu_resources = NormalizeNodeMemoryResourceRecords({
    raw_records: params.raw_qemu_records,
    resource_type: "qemu",
    include_stopped: params.include_stopped,
  });
  const lxc_resources = NormalizeNodeMemoryResourceRecords({
    raw_records: params.raw_lxc_records,
    resource_type: "lxc",
    include_stopped: params.include_stopped,
  });
  const resources = [
    ...qemu_resources,
    ...lxc_resources,
  ];

  let allocated_memory_bytes_total = 0;
  let used_memory_bytes_total = 0;
  for (const resource of resources) {
    if (resource.memory_limit_bytes !== undefined) {
      allocated_memory_bytes_total += resource.memory_limit_bytes;
    }
    if (resource.memory_used_bytes !== undefined) {
      used_memory_bytes_total += resource.memory_used_bytes;
    }
  }

  return {
    node_id: params.node_id,
    include_stopped: params.include_stopped,
    resource_count: resources.length,
    allocated_memory_bytes_total,
    used_memory_bytes_total,
    resources,
  };
}

function NormalizeNodeMemoryResourceRecords(params: {
  raw_records: unknown;
  resource_type: "qemu" | "lxc";
  include_stopped: boolean;
}): Array<{
  resource_type: "qemu" | "lxc";
  resource_id: string;
  name?: string;
  status?: string;
  memory_used_bytes?: number;
  memory_limit_bytes?: number;
  raw: Record<string, unknown>;
}> {
  if (!Array.isArray(params.raw_records)) {
    return [];
  }
  const output: Array<{
    resource_type: "qemu" | "lxc";
    resource_id: string;
    name?: string;
    status?: string;
    memory_used_bytes?: number;
    memory_limit_bytes?: number;
    raw: Record<string, unknown>;
  }> = [];
  for (const raw_record of params.raw_records) {
    const record = ToRecord(raw_record);
    if (Object.keys(record).length === 0) {
      continue;
    }

    const status = ToOptionalString(record.status);
    if (
      params.include_stopped !== true
      && status !== undefined
      && status.toLowerCase() !== "running"
    ) {
      continue;
    }

    output.push({
      resource_type: params.resource_type,
      resource_id: ResolveNodeMemoryResourceId(record),
      name: ToOptionalString(record.name),
      status,
      memory_used_bytes: ResolveNodeMemoryUsage(record),
      memory_limit_bytes: ResolveNodeMemoryLimit(record),
      raw: record,
    });
  }
  return output;
}

function ResolveNodeMemoryResourceId(record: Record<string, unknown>): string {
  const vmid = ToOptionalNonNegativeInteger(record.vmid);
  if (vmid !== undefined) {
    return String(vmid);
  }
  const id = ToOptionalString(record.id);
  if (id !== undefined) {
    return id;
  }
  return "unknown";
}

function ResolveNodeMemoryUsage(record: Record<string, unknown>): number | undefined {
  const candidates = [
    record.mem,
    record.mem_used,
    record.memory_used,
  ];
  for (const candidate of candidates) {
    const parsed_value = ToOptionalNonNegativeInteger(candidate);
    if (parsed_value !== undefined) {
      return parsed_value;
    }
  }
  return undefined;
}

function ResolveNodeMemoryLimit(record: Record<string, unknown>): number | undefined {
  const candidates = [
    record.maxmem,
    record.memory,
    record.mem_total,
  ];
  for (const candidate of candidates) {
    const parsed_value = ToOptionalNonNegativeInteger(candidate);
    if (parsed_value !== undefined) {
      return parsed_value;
    }
  }
  return undefined;
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

function ToOptionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed_value = value.trim();
    if (!trimmed_value) {
      return undefined;
    }
    const parsed_value = Number(trimmed_value);
    if (Number.isInteger(parsed_value) && parsed_value > 0) {
      return parsed_value;
    }
  }
  return undefined;
}

function ToOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed_value = value.trim();
    if (!trimmed_value) {
      return undefined;
    }
    const parsed_value = Number(trimmed_value);
    if (Number.isInteger(parsed_value) && parsed_value >= 0) {
      return parsed_value;
    }
  }
  return undefined;
}

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized_value = value.trim();
  return normalized_value || undefined;
}

function ToOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return undefined;
  }
  if (typeof value === "string") {
    const normalized_value = value.trim().toLowerCase();
    if (!normalized_value) {
      return undefined;
    }
    if (normalized_value === "1" || normalized_value === "true" || normalized_value === "yes" || normalized_value === "on") {
      return true;
    }
    if (normalized_value === "0" || normalized_value === "false" || normalized_value === "no" || normalized_value === "off") {
      return false;
    }
  }
  return undefined;
}

function ToOptionalStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized_list = value
      .map((item) => ToOptionalString(item))
      .filter((item): item is string => item !== undefined);
    return normalized_list.length > 0 ? normalized_list : undefined;
  }
  if (typeof value === "string") {
    const normalized_list = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return normalized_list.length > 0 ? normalized_list : undefined;
  }
  return undefined;
}

function ToRecord(value: unknown): Record<string, unknown> {
  if (value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
