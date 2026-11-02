import { isIP } from "node:net";
import { proxmox_http_method_t } from "../types/proxmox_http_types";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import {
  ProxmoxAuthError,
  ProxmoxConflictError,
  ProxmoxError,
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxRateLimitError,
  ProxmoxTaskError,
  ProxmoxTimeoutError,
  ProxmoxTransportError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import {
  proxmox_api_config_record_i,
  proxmox_datacenter_storage_record_i,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_preflight_check_t,
  proxmox_lxc_helper_preflight_result_t,
  proxmox_lxc_helper_ipv4_mode_t,
  proxmox_lxc_helper_ipv6_mode_t,
  proxmox_lxc_task_result_t,
  proxmox_node_list_response_t,
} from "../types/proxmox_service_types";
import { LxcService } from "../services/lxc_service";
import { NodeService } from "../services/node_service";
import { DatacenterService } from "../services/datacenter_service";
import { PoolService } from "../services/pool_service";
import { AccessService } from "../services/access_service";

type normalized_lxc_helper_general_t = {
  node_id: string;
  container_id: string;
  hostname: string;
  resource_pool?: string;
  password?: string;
  ssh_public_keys?: string;
  unprivileged_container?: boolean;
  nesting?: boolean;
  add_to_ha: boolean;
  tags?: string;
};

type normalized_lxc_helper_template_t = {
  storage: string;
  template: string;
};

type normalized_lxc_helper_disks_t = {
  storage: string;
  disk_size_gib: number;
};

type normalized_lxc_helper_cpu_t = {
  cores?: number;
  cpu_limit?: number | "unlimited";
  cpu_units?: number;
};

type normalized_lxc_helper_memory_t = {
  memory_mib?: number;
  swap_mib?: number;
};

type normalized_lxc_helper_network_t = {
  name: string;
  bridge: string;
  mac_address?: string;
  vlan_tag?: number;
  ipv4_mode: proxmox_lxc_helper_ipv4_mode_t;
  ipv4_cidr?: string;
  ipv4_gateway?: string;
  ipv6_mode: proxmox_lxc_helper_ipv6_mode_t;
  ipv6_cidr?: string;
  ipv6_gateway?: string;
  disconnect: boolean;
  rate_limit_mbps?: number;
  mtu?: number;
  host_managed?: boolean;
};

type normalized_lxc_helper_dns_t = {
  dns_domain?: string;
  dns_servers?: string;
};

type normalized_lxc_helper_preflight_t = {
  enabled: boolean;
  enforce: boolean;
  check_node_exists: boolean;
  check_container_id_available: boolean;
  check_storage_rootdir: boolean;
  check_template_exists: boolean;
  check_bridge_exists: boolean;
  check_cpu: boolean;
  check_memory: boolean;
  cpu_mode: "logical" | "physical";
  memory_mode: "free_headroom" | "allocated_headroom";
};

type normalized_lxc_helper_input_t = {
  general: normalized_lxc_helper_general_t;
  template: normalized_lxc_helper_template_t;
  disks: normalized_lxc_helper_disks_t;
  cpu: normalized_lxc_helper_cpu_t;
  memory: normalized_lxc_helper_memory_t;
  network?: normalized_lxc_helper_network_t;
  dns?: normalized_lxc_helper_dns_t;
  preflight: normalized_lxc_helper_preflight_t;
  start_after_created: boolean;
  wait_for_task: boolean;
  dry_run: boolean;
};

export interface lxc_helper_input_i {
  request_client: proxmox_request_client_i;
  lxc_service: LxcService;
  node_service: NodeService;
  datacenter_service: DatacenterService;
  pool_service: PoolService;
  access_service?: AccessService;
}

export class LxcHelper {
  public readonly request_client: proxmox_request_client_i;
  public readonly lxc_service: LxcService;
  public readonly node_service: NodeService;
  public readonly datacenter_service: DatacenterService;
  public readonly pool_service: PoolService;
  public readonly access_service?: AccessService;

  constructor(params: lxc_helper_input_i) {
    this.request_client = params.request_client;
    this.lxc_service = params.lxc_service;
    this.node_service = params.node_service;
    this.datacenter_service = params.datacenter_service;
    this.pool_service = params.pool_service;
    this.access_service = params.access_service;
  }

  public async createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t> {
    const normalized_input = NormalizeCreateInput(params);
    const create_config = BuildCreateConfig(normalized_input);
    const preflight_result = await this.runPreflight({
      normalized_input,
    });

    if (normalized_input.dry_run) {
      return {
        success: true,
        status_code: 200,
        data: {
          node_id: normalized_input.general.node_id,
          container_id: normalized_input.general.container_id,
          dry_run: true,
          config: create_config,
          preflight: preflight_result,
        },
      };
    }

    let create_task: proxmox_lxc_task_result_t;
    try {
      create_task = await this.createContainer({
        normalized_input,
        create_config,
      });
    } catch (error) {
      RethrowWithCreateContext({
        error,
        stage: "create",
        normalized_input,
        create_config,
      });
    }

    let ha_added: boolean | undefined;
    if (normalized_input.general.add_to_ha) {
      try {
        ha_added = await this.addContainerToHa({
          node_id: normalized_input.general.node_id,
          container_id: normalized_input.general.container_id,
        });
      } catch (error) {
        RethrowWithCreateContext({
          error,
          stage: "add_to_ha",
          normalized_input,
          create_config,
        });
      }
    }

    let start_task: proxmox_lxc_task_result_t | undefined;
    if (normalized_input.start_after_created) {
      try {
        start_task = await this.startContainer({
          normalized_input,
        });
      } catch (error) {
        RethrowWithCreateContext({
          error,
          stage: "start",
          normalized_input,
          create_config,
        });
      }
    }

    return {
      success: true,
      status_code: 200,
      data: {
        node_id: normalized_input.general.node_id,
        container_id: normalized_input.general.container_id,
        dry_run: false,
        config: create_config,
        preflight: preflight_result,
        create_task,
        start_task,
        ha_added,
      },
    };
  }

  private async runPreflight(params: {
    normalized_input: normalized_lxc_helper_input_t;
  }): Promise<proxmox_lxc_helper_preflight_result_t> {
    const preflight = params.normalized_input.preflight;
    if (!preflight.enabled) {
      return {
        executed: false,
        enforce: false,
        failed_checks: 0,
        checks: [],
      };
    }

    const checks: proxmox_lxc_helper_preflight_check_t[] = [];

    if (preflight.check_node_exists) {
      const node_check = await this.checkNodeExists({
        node_id: params.normalized_input.general.node_id,
      });
      checks.push(node_check);
    }

    if (preflight.check_container_id_available) {
      const container_id_check = await this.checkContainerIdAvailable({
        node_id: params.normalized_input.general.node_id,
        container_id: params.normalized_input.general.container_id,
      });
      checks.push(container_id_check);
    }

    if (preflight.check_storage_rootdir) {
      const storage_checks = await this.checkStorageSupport({
        node_id: params.normalized_input.general.node_id,
        disk_storage: params.normalized_input.disks.storage,
        template_storage: params.normalized_input.template.storage,
      });
      checks.push(...storage_checks);
    }

    if (preflight.check_template_exists) {
      const template_check = await this.checkTemplateExists({
        node_id: params.normalized_input.general.node_id,
        template_storage: params.normalized_input.template.storage,
        template: params.normalized_input.template.template,
      });
      checks.push(template_check);
    }

    if (params.normalized_input.general.resource_pool !== undefined) {
      const pool_check = await this.checkPoolExists({
        pool_id: params.normalized_input.general.resource_pool,
      });
      checks.push(pool_check);
    }

    if (preflight.check_bridge_exists && params.normalized_input.network !== undefined) {
      const bridge_check = await this.checkBridgeExists({
        node_id: params.normalized_input.general.node_id,
        bridge: params.normalized_input.network.bridge,
      });
      checks.push(bridge_check);
    }

    if (preflight.check_cpu && params.normalized_input.cpu.cores !== undefined) {
      const cpu_check = await this.checkCpuHeadroom({
        node_id: params.normalized_input.general.node_id,
        requested_cores: params.normalized_input.cpu.cores,
        mode: preflight.cpu_mode,
      });
      checks.push(cpu_check);
    }

    if (preflight.check_memory && params.normalized_input.memory.memory_mib !== undefined) {
      const memory_check = await this.checkMemoryHeadroom({
        node_id: params.normalized_input.general.node_id,
        requested_memory_mib: params.normalized_input.memory.memory_mib,
        mode: preflight.memory_mode,
      });
      checks.push(memory_check);
    }

    const failed_checks = checks.filter((check_record) => !check_record.passed).length;
    if (failed_checks > 0 && preflight.enforce) {
      const failed_names = checks
        .filter((check_record) => !check_record.passed)
        .map((check_record) => check_record.check)
        .join(",");
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC preflight checks failed.",
        details: {
          field: "preflight",
          value: failed_names,
        },
      });
    }

    return {
      executed: true,
      enforce: preflight.enforce,
      failed_checks,
      checks,
    };
  }

  private async checkNodeExists(params: {
    node_id: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const response = await this.node_service.listNodes();
    const exists = DoesNodeExist({
      node_id: params.node_id,
      nodes_response: response,
    });
    return {
      check: "node_exists",
      passed: exists,
      reason: exists ? "node_exists" : "node_not_found",
    };
  }

  private async checkStorageSupport(params: {
    node_id: string;
    disk_storage: string;
    template_storage: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t[]> {
    const storage_records = await this.listStorageRecords({
      node_id: params.node_id,
    });

    const disk_storage_record = storage_records.find((record) => ResolveStorageId(record) === params.disk_storage);
    const template_storage_record = storage_records.find((record) => ResolveStorageId(record) === params.template_storage);

    const disk_storage_contents = ResolveStorageContentSet(disk_storage_record);
    const template_storage_contents = ResolveStorageContentSet(template_storage_record);

    const disk_storage_exists = disk_storage_record !== undefined;
    const template_storage_exists = template_storage_record !== undefined;

    return [
      {
        check: "disk_storage_exists",
        passed: disk_storage_exists,
        reason: disk_storage_exists ? "storage_exists" : "storage_not_found",
      },
      {
        check: "disk_storage_supports_rootdir",
        passed: disk_storage_exists && disk_storage_contents.has("rootdir"),
        reason: disk_storage_exists
          ? (disk_storage_contents.has("rootdir") ? "storage_supports_rootdir" : "storage_missing_rootdir")
          : "storage_not_found",
      },
      {
        check: "template_storage_exists",
        passed: template_storage_exists,
        reason: template_storage_exists ? "storage_exists" : "storage_not_found",
      },
      {
        check: "template_storage_supports_vztmpl",
        passed: template_storage_exists && template_storage_contents.has("vztmpl"),
        reason: template_storage_exists
          ? (template_storage_contents.has("vztmpl") ? "storage_supports_vztmpl" : "storage_missing_vztmpl")
          : "storage_not_found",
      },
    ];
  }

  private async checkContainerIdAvailable(params: {
    node_id: string;
    container_id: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const [lxc_list_response, vm_list_response] = await Promise.all([
      this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: `/api2/json/nodes/${encodeURIComponent(params.node_id)}/lxc`,
        node_id: params.node_id,
        retry_allowed: true,
      }),
      this.request_client.request<unknown[]>({
        method: "GET" as proxmox_http_method_t,
        path: `/api2/json/nodes/${encodeURIComponent(params.node_id)}/qemu`,
        node_id: params.node_id,
        retry_allowed: true,
      }),
    ]);

    const lxc_records = Array.isArray(lxc_list_response.data) ? lxc_list_response.data : [];
    const vm_records = Array.isArray(vm_list_response.data) ? vm_list_response.data : [];
    const existing_ids = new Set<string>();
    for (const raw_record of [...lxc_records, ...vm_records]) {
      if (!IsRecord(raw_record)) {
        continue;
      }
      const vmid_value = raw_record.vmid;
      if (typeof vmid_value === "number" && Number.isInteger(vmid_value) && vmid_value > 0) {
        existing_ids.add(String(vmid_value));
        continue;
      }
      if (typeof vmid_value === "string" && /^[1-9][0-9]*$/.test(vmid_value.trim())) {
        existing_ids.add(vmid_value.trim());
      }
    }

    const available = !existing_ids.has(params.container_id);
    return {
      check: "container_id_available",
      passed: available,
      reason: available ? "container_id_available" : "container_id_already_exists",
    };
  }

  private async checkTemplateExists(params: {
    node_id: string;
    template_storage: string;
    template: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const template_volume_id = ResolveTemplateVolumeId({
      storage: params.template_storage,
      template: params.template,
    });
    const template_storage = ExtractStorageFromVolumeId(template_volume_id) ?? params.template_storage;

    const template_response = await this.request_client.request<unknown[]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(params.node_id)}/storage/${encodeURIComponent(template_storage)}/content`,
      node_id: params.node_id,
      query: {
        content: "vztmpl",
      },
      retry_allowed: true,
    });

    const template_records = Array.isArray(template_response.data) ? template_response.data : [];
    const candidate_volume_ids = BuildTemplateVolumeIdCandidates(template_volume_id);
    let exists = false;
    for (const raw_record of template_records) {
      if (!IsRecord(raw_record)) {
        continue;
      }
      const record_candidates = [
        ToOptionalString(raw_record.volid),
        ToOptionalString(raw_record.id),
      ].filter((value): value is string => value !== undefined);
      if (record_candidates.some((candidate) => candidate_volume_ids.has(candidate))) {
        exists = true;
        break;
      }
    }

    return {
      check: "template_exists",
      passed: exists,
      reason: exists ? "template_exists" : "template_not_found",
    };
  }

  private async checkPoolExists(params: {
    pool_id: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    try {
      const pool_response = await this.pool_service.getPool({
        pool_id: params.pool_id,
      });
      const pool_found = pool_response.data.pool_id.trim().length > 0;
      return {
        check: "resource_pool_exists",
        passed: pool_found,
        reason: pool_found ? "pool_exists" : "pool_not_found",
      };
    } catch (error) {
      if (error instanceof ProxmoxNotFoundError) {
        return {
          check: "resource_pool_exists",
          passed: false,
          reason: "pool_not_found",
        };
      }
      throw error;
    }
  }

  private async checkBridgeExists(params: {
    node_id: string;
    bridge: string;
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const bridge_response = await this.node_service.listBridges({
      node_id: params.node_id,
    });
    const bridge_exists = bridge_response.data.some(
      (bridge_record) => bridge_record.interface_id.toLowerCase() === params.bridge.toLowerCase(),
    );
    return {
      check: "bridge_exists",
      passed: bridge_exists,
      reason: bridge_exists ? "bridge_exists" : "bridge_not_found",
    };
  }

  private async checkCpuHeadroom(params: {
    node_id: string;
    requested_cores: number;
    mode: "logical" | "physical";
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const preflight = await this.node_service.canAllocateCores({
      node_id: params.node_id,
      requested_cores: params.requested_cores,
      mode: params.mode,
    });
    return {
      check: "cpu_headroom",
      passed: preflight.data.allowed,
      reason: preflight.data.reason,
    };
  }

  private async checkMemoryHeadroom(params: {
    node_id: string;
    requested_memory_mib: number;
    mode: "free_headroom" | "allocated_headroom";
  }): Promise<proxmox_lxc_helper_preflight_check_t> {
    const requested_memory_bytes = params.requested_memory_mib * 1024 * 1024;
    const preflight = await this.node_service.canAllocateMemory({
      node_id: params.node_id,
      requested_memory_bytes,
      mode: params.mode,
    });
    return {
      check: "memory_headroom",
      passed: preflight.data.allowed,
      reason: preflight.data.reason,
    };
  }

  private async listStorageRecords(params: {
    node_id: string;
  }): Promise<proxmox_datacenter_storage_record_i[]> {
    try {
      const scoped_storage_response = await this.datacenter_service.listStorage({
        node: params.node_id,
      });
      return scoped_storage_response.data as proxmox_datacenter_storage_record_i[];
    } catch (error) {
      if (ShouldFallbackStorageList(error)) {
        const fallback_storage_response = await this.datacenter_service.listStorage();
        return fallback_storage_response.data as proxmox_datacenter_storage_record_i[];
      }
      throw error;
    }
  }

  private async createContainer(params: {
    normalized_input: normalized_lxc_helper_input_t;
    create_config: proxmox_api_config_record_i;
  }): Promise<proxmox_lxc_task_result_t> {
    if (params.normalized_input.wait_for_task) {
      return this.lxc_service.createContainer({
        node_id: params.normalized_input.general.node_id,
        container_id: params.normalized_input.general.container_id,
        config: params.create_config,
        wait_for_task: true,
      });
    }
    return this.lxc_service.createContainer({
      node_id: params.normalized_input.general.node_id,
      container_id: params.normalized_input.general.container_id,
      config: params.create_config,
    });
  }

  private async startContainer(params: {
    normalized_input: normalized_lxc_helper_input_t;
  }): Promise<proxmox_lxc_task_result_t> {
    if (params.normalized_input.wait_for_task) {
      return this.lxc_service.startContainer({
        node_id: params.normalized_input.general.node_id,
        container_id: params.normalized_input.general.container_id,
        wait_for_task: true,
      });
    }
    return this.lxc_service.startContainer({
      node_id: params.normalized_input.general.node_id,
      container_id: params.normalized_input.general.container_id,
    });
  }

  private async addContainerToHa(params: {
    node_id: string;
    container_id: string;
  }): Promise<boolean> {
    try {
      await this.request_client.request<unknown>({
        method: "POST" as proxmox_http_method_t,
        path: "/api2/json/cluster/ha/resources",
        node_id: params.node_id,
        body: {
          sid: `ct:${params.container_id}`,
        },
        retry_allowed: false,
      });
      return true;
    } catch (error) {
      if (error instanceof ProxmoxNotFoundError) {
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: "add_to_ha is not supported by the connected Proxmox cluster.",
          details: {
            field: "general.add_to_ha",
            value: "unsupported",
          },
        });
      }
      if (error instanceof ProxmoxHttpError && error.status_code === 501) {
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: "add_to_ha is not supported by the connected Proxmox cluster.",
          details: {
            field: "general.add_to_ha",
            value: "unsupported",
          },
        });
      }
      throw error;
    }
  }
}

function NormalizeCreateInput(
  input: proxmox_lxc_helper_create_input_i,
): normalized_lxc_helper_input_t {
  return {
    general: NormalizeGeneralInput(input.general),
    template: NormalizeTemplateInput(input.template),
    disks: NormalizeDisksInput(input.disks),
    cpu: NormalizeCpuInput(input.cpu),
    memory: NormalizeMemoryInput(input.memory),
    network: input.network === undefined ? undefined : NormalizeNetworkInput(input.network),
    dns: input.dns === undefined ? undefined : NormalizeDnsInput(input.dns),
    preflight: NormalizePreflightInput(input.preflight),
    start_after_created: input.start_after_created === true,
    wait_for_task: input.wait_for_task === true,
    dry_run: input.dry_run === true,
  };
}

function NormalizeGeneralInput(
  input: proxmox_lxc_helper_create_input_i["general"],
): normalized_lxc_helper_general_t {
  const node_id = ValidateRequiredToken({
    value: input.node_id,
    field_name: "general.node_id",
    pattern: /^[A-Za-z0-9._-]+$/,
  });
  const container_id = ValidateContainerId(input.container_id);
  const hostname = ValidateRequiredToken({
    value: input.hostname,
    field_name: "general.hostname",
    pattern: /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/,
  });

  const resource_pool = input.resource_pool === undefined
    ? undefined
    : ValidateRequiredToken({
      value: input.resource_pool,
      field_name: "general.resource_pool",
      pattern: /^[A-Za-z0-9._-]+$/,
    });

  const password = NormalizeOptionalPassword({
    value: input.password,
    field_name: "general.password",
  });
  const ssh_public_keys = NormalizeSshPublicKeys(input.ssh_public_keys);
  const tags = NormalizeTags(input.tags);

  return {
    node_id,
    container_id,
    hostname,
    resource_pool,
    password,
    ssh_public_keys,
    unprivileged_container: input.unprivileged_container,
    nesting: input.nesting,
    add_to_ha: input.add_to_ha === true,
    tags,
  };
}

function NormalizeTemplateInput(
  input: proxmox_lxc_helper_create_input_i["template"],
): normalized_lxc_helper_template_t {
  return {
    storage: ValidateRequiredToken({
      value: input.storage,
      field_name: "template.storage",
      pattern: /^[A-Za-z0-9._-]+$/,
    }),
    template: ValidateTemplateReference({
      value: input.template,
      field_name: "template.template",
    }),
  };
}

function NormalizeDisksInput(
  input: proxmox_lxc_helper_create_input_i["disks"],
): normalized_lxc_helper_disks_t {
  return {
    storage: ValidateRequiredToken({
      value: input.storage,
      field_name: "disks.storage",
      pattern: /^[A-Za-z0-9._-]+$/,
    }),
    disk_size_gib: ValidatePositiveInteger({
      value: input.disk_size_gib,
      field_name: "disks.disk_size_gib",
    }),
  };
}

function NormalizeCpuInput(
  input: proxmox_lxc_helper_create_input_i["cpu"] | undefined,
): normalized_lxc_helper_cpu_t {
  if (input === undefined) {
    return {};
  }
  return {
    cores: input.cores === undefined
      ? undefined
      : ValidatePositiveInteger({
        value: input.cores,
        field_name: "cpu.cores",
      }),
    cpu_limit: input.cpu_limit === undefined
      ? undefined
      : ValidateCpuLimit({
        value: input.cpu_limit,
      }),
    cpu_units: input.cpu_units === undefined
      ? undefined
      : ValidatePositiveInteger({
        value: input.cpu_units,
        field_name: "cpu.cpu_units",
      }),
  };
}

function NormalizeMemoryInput(
  input: proxmox_lxc_helper_create_input_i["memory"] | undefined,
): normalized_lxc_helper_memory_t {
  if (input === undefined) {
    return {};
  }
  return {
    memory_mib: input.memory_mib === undefined
      ? undefined
      : ValidatePositiveInteger({
        value: input.memory_mib,
        field_name: "memory.memory_mib",
      }),
    swap_mib: input.swap_mib === undefined
      ? undefined
      : ValidateNonNegativeInteger({
        value: input.swap_mib,
        field_name: "memory.swap_mib",
      }),
  };
}

function NormalizeNetworkInput(
  input: NonNullable<proxmox_lxc_helper_create_input_i["network"]>,
): normalized_lxc_helper_network_t {
  const name = input.name === undefined
    ? "eth0"
    : ValidateRequiredToken({
      value: input.name,
      field_name: "network.name",
      pattern: /^[A-Za-z0-9._-]+$/,
    });
  const bridge = ValidateRequiredToken({
    value: input.bridge,
    field_name: "network.bridge",
    pattern: /^[A-Za-z0-9._-]+$/,
  });

  const mac_address = NormalizeOptionalMacAddress(input.mac_address);
  const vlan_tag = input.vlan_tag === undefined
    ? undefined
    : ValidateIntegerRange({
      value: input.vlan_tag,
      field_name: "network.vlan_tag",
      minimum: 1,
      maximum: 4094,
    });
  const ipv4_mode = input.ipv4_mode ?? "dhcp";
  const ipv6_mode = input.ipv6_mode ?? "dhcp";
  ValidateIpv4Options({
    mode: ipv4_mode,
    cidr: input.ipv4_cidr,
    gateway: input.ipv4_gateway,
  });
  ValidateIpv6Options({
    mode: ipv6_mode,
    cidr: input.ipv6_cidr,
    gateway: input.ipv6_gateway,
  });

  const rate_limit_mbps = input.rate_limit_mbps === undefined
    ? undefined
    : ValidatePositiveNumber({
      value: input.rate_limit_mbps,
      field_name: "network.rate_limit_mbps",
    });

  const mtu = input.mtu === undefined
    ? undefined
    : ValidateIntegerRange({
      value: input.mtu,
      field_name: "network.mtu",
      minimum: 576,
      maximum: 9216,
    });

  return {
    name,
    bridge,
    mac_address,
    vlan_tag,
    ipv4_mode,
    ipv4_cidr: input.ipv4_cidr?.trim() || undefined,
    ipv4_gateway: input.ipv4_gateway?.trim() || undefined,
    ipv6_mode,
    ipv6_cidr: input.ipv6_cidr?.trim() || undefined,
    ipv6_gateway: input.ipv6_gateway?.trim() || undefined,
    disconnect: input.disconnect === true,
    rate_limit_mbps,
    mtu,
    host_managed: input.host_managed,
  };
}

function NormalizeDnsInput(
  input: NonNullable<proxmox_lxc_helper_create_input_i["dns"]>,
): normalized_lxc_helper_dns_t {
  const dns_domain = input.dns_domain === undefined
    ? undefined
    : ValidateRequiredToken({
      value: input.dns_domain,
      field_name: "dns.dns_domain",
      pattern: /^[A-Za-z0-9.-]+$/,
    });
  const dns_servers = NormalizeDnsServers({
    value: input.dns_servers,
  });
  return {
    dns_domain,
    dns_servers,
  };
}

function NormalizePreflightInput(
  input: proxmox_lxc_helper_create_input_i["preflight"] | undefined,
): normalized_lxc_helper_preflight_t {
  if (input === undefined || input.enabled !== true) {
    return {
      enabled: false,
      enforce: false,
      check_node_exists: false,
      check_container_id_available: false,
      check_storage_rootdir: false,
      check_template_exists: false,
      check_bridge_exists: false,
      check_cpu: false,
      check_memory: false,
      cpu_mode: "logical",
      memory_mode: "free_headroom",
    };
  }
  return {
    enabled: true,
    enforce: input.enforce === true,
    check_node_exists: input.check_node_exists !== false,
    check_container_id_available: input.check_container_id_available !== false,
    check_storage_rootdir: input.check_storage_rootdir !== false,
    check_template_exists: input.check_template_exists !== false,
    check_bridge_exists: input.check_bridge_exists !== false,
    check_cpu: input.check_cpu === true,
    check_memory: input.check_memory === true,
    cpu_mode: input.cpu_mode ?? "logical",
    memory_mode: input.memory_mode ?? "free_headroom",
  };
}

function BuildCreateConfig(
  input: normalized_lxc_helper_input_t,
): proxmox_api_config_record_i {
  const config: proxmox_api_config_record_i = {
    hostname: input.general.hostname,
    ostemplate: ResolveTemplateVolumeId({
      storage: input.template.storage,
      template: input.template.template,
    }),
    rootfs: `${input.disks.storage}:${input.disks.disk_size_gib}`,
  };

  if (input.general.resource_pool !== undefined) {
    config.pool = input.general.resource_pool;
  }
  if (input.general.password !== undefined) {
    config.password = input.general.password;
  }
  if (input.general.ssh_public_keys !== undefined) {
    config["ssh-public-keys"] = input.general.ssh_public_keys;
  }
  if (input.general.unprivileged_container !== undefined) {
    config.unprivileged = input.general.unprivileged_container ? 1 : 0;
  }
  if (input.general.nesting === true) {
    config.features = "nesting=1";
  }
  if (input.general.tags !== undefined) {
    config.tags = input.general.tags;
  }

  if (input.cpu.cores !== undefined) {
    config.cores = input.cpu.cores;
  }
  if (input.cpu.cpu_limit !== undefined && input.cpu.cpu_limit !== "unlimited") {
    config.cpulimit = input.cpu.cpu_limit;
  }
  if (input.cpu.cpu_units !== undefined) {
    config.cpuunits = input.cpu.cpu_units;
  }

  if (input.memory.memory_mib !== undefined) {
    config.memory = input.memory.memory_mib;
  }
  if (input.memory.swap_mib !== undefined) {
    config.swap = input.memory.swap_mib;
  }

  if (input.network !== undefined) {
    config.net0 = BuildNet0Config(input.network);
  }

  if (input.dns?.dns_domain !== undefined) {
    config.searchdomain = input.dns.dns_domain;
  }
  if (input.dns?.dns_servers !== undefined) {
    config.nameserver = input.dns.dns_servers;
  }

  return config;
}

function BuildNet0Config(
  input: normalized_lxc_helper_network_t,
): string {
  const net0_options: string[] = [];
  net0_options.push(`name=${input.name}`);
  net0_options.push(`bridge=${input.bridge}`);

  if (input.mac_address !== undefined) {
    net0_options.push(`hwaddr=${input.mac_address}`);
  }
  if (input.vlan_tag !== undefined) {
    net0_options.push(`tag=${input.vlan_tag}`);
  }

  net0_options.push(`ip=${ResolveIpv4NetValue(input)}`);
  if (input.ipv4_gateway !== undefined) {
    net0_options.push(`gw=${input.ipv4_gateway}`);
  }

  net0_options.push(`ip6=${ResolveIpv6NetValue(input)}`);
  if (input.ipv6_gateway !== undefined) {
    net0_options.push(`gw6=${input.ipv6_gateway}`);
  }

  if (input.disconnect) {
    net0_options.push("link_down=1");
  }
  if (input.rate_limit_mbps !== undefined) {
    net0_options.push(`rate=${input.rate_limit_mbps}`);
  }
  if (input.mtu !== undefined) {
    net0_options.push(`mtu=${input.mtu}`);
  }
  if (input.host_managed !== undefined) {
    net0_options.push(`ipam=${input.host_managed ? 1 : 0}`);
  }

  return net0_options.join(",");
}

function ResolveIpv4NetValue(
  input: normalized_lxc_helper_network_t,
): string {
  if (input.ipv4_mode === "dhcp") {
    return "dhcp";
  }
  if (input.ipv4_mode === "none") {
    return "manual";
  }
  return input.ipv4_cidr as string;
}

function ResolveIpv6NetValue(
  input: normalized_lxc_helper_network_t,
): string {
  if (input.ipv6_mode === "dhcp") {
    return "dhcp";
  }
  if (input.ipv6_mode === "slaac") {
    return "auto";
  }
  if (input.ipv6_mode === "none") {
    return "manual";
  }
  return input.ipv6_cidr as string;
}

function ResolveTemplateVolumeId(params: {
  storage: string;
  template: string;
}): string {
  if (params.template.includes(":")) {
    return params.template;
  }
  if (params.template.startsWith("vztmpl/")) {
    return `${params.storage}:${params.template}`;
  }
  return `${params.storage}:vztmpl/${params.template}`;
}

function ValidateContainerId(value: string | number): string {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "general.container_id must be a positive integer.",
        details: {
          field: "general.container_id",
        },
      });
    }
    return String(value);
  }

  const trimmed = value.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "general.container_id must be a positive integer.",
      details: {
        field: "general.container_id",
      },
    });
  }
  return trimmed;
}

function ValidateRequiredToken(params: {
  value: string;
  field_name: string;
  pattern: RegExp;
}): string {
  const trimmed = params.value.trim();
  if (!trimmed) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: `${params.field_name} is required and cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  if (!params.pattern.test(trimmed)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} contains unsupported characters.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return trimmed;
}

function ValidateTemplateReference(params: {
  value: string;
  field_name: string;
}): string {
  const trimmed = params.value.trim();
  if (!trimmed) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: `${params.field_name} is required and cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  if (/\s/.test(trimmed)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must not contain whitespace.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return trimmed;
}

function ValidatePositiveInteger(params: {
  value: number;
  field_name: string;
}): number {
  if (!Number.isInteger(params.value) || params.value <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a positive integer.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function ValidateNonNegativeInteger(params: {
  value: number;
  field_name: string;
}): number {
  if (!Number.isInteger(params.value) || params.value < 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a non-negative integer.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function ValidatePositiveNumber(params: {
  value: number;
  field_name: string;
}): number {
  if (!Number.isFinite(params.value) || params.value <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a positive number.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function ValidateCpuLimit(params: {
  value: number | "unlimited";
}): number | "unlimited" {
  if (params.value === "unlimited") {
    return params.value;
  }
  if (!Number.isFinite(params.value) || params.value <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "cpu.cpu_limit must be \"unlimited\" or a positive number.",
      details: {
        field: "cpu.cpu_limit",
      },
    });
  }
  return params.value;
}

function ValidateIntegerRange(params: {
  value: number;
  field_name: string;
  minimum: number;
  maximum: number;
}): number {
  if (!Number.isInteger(params.value) || params.value < params.minimum || params.value > params.maximum) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be between ${params.minimum} and ${params.maximum}.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function NormalizeOptionalPassword(params: {
  value: string | undefined;
  field_name: string;
}): string | undefined {
  if (params.value === undefined) {
    return undefined;
  }
  if (params.value.trim().length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} cannot be blank when provided.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function NormalizeSshPublicKeys(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "general.ssh_public_keys cannot be blank when provided.",
        details: {
          field: "general.ssh_public_keys",
        },
      });
    }
    return trimmed;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "general.ssh_public_keys must be a non-empty string or string array.",
      details: {
        field: "general.ssh_public_keys",
      },
    });
  }
  const normalized_keys = value
    .map((key_record) => key_record.trim())
    .filter((key_record) => key_record.length > 0);
  if (normalized_keys.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "general.ssh_public_keys must include at least one non-empty key.",
      details: {
        field: "general.ssh_public_keys",
      },
    });
  }
  return normalized_keys.join("\n");
}

function NormalizeTags(tags: string[] | undefined): string | undefined {
  if (tags === undefined) {
    return undefined;
  }
  const normalized_tags = tags
    .map((tag_record) => tag_record.trim())
    .filter((tag_record) => tag_record.length > 0);
  if (normalized_tags.length === 0) {
    return undefined;
  }
  for (const tag_record of normalized_tags) {
    if (!/^[A-Za-z0-9._-]+$/.test(tag_record)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "general.tags contains unsupported characters.",
        details: {
          field: "general.tags",
        },
      });
    }
  }
  return normalized_tags.join(";");
}

function NormalizeOptionalMacAddress(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") {
    return undefined;
  }
  const normalized = trimmed.toUpperCase();
  if (!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "network.mac_address must be a valid MAC address or \"auto\".",
      details: {
        field: "network.mac_address",
      },
    });
  }
  return normalized;
}

function ValidateIpv4Options(params: {
  mode: proxmox_lxc_helper_ipv4_mode_t;
  cidr?: string;
  gateway?: string;
}): void {
  if (params.mode === "static") {
    if (params.cidr === undefined || params.cidr.trim().length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "network.ipv4_cidr is required when network.ipv4_mode is static.",
        details: {
          field: "network.ipv4_cidr",
        },
      });
    }
    ValidateCidr({
      value: params.cidr,
      field_name: "network.ipv4_cidr",
      family: 4,
    });
    if (params.gateway !== undefined && params.gateway.trim().length > 0) {
      ValidateIpAddress({
        value: params.gateway,
        field_name: "network.ipv4_gateway",
        family: 4,
      });
    }
    return;
  }

  if (params.cidr !== undefined && params.cidr.trim().length > 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "network.ipv4_cidr can only be set when network.ipv4_mode is static.",
      details: {
        field: "network.ipv4_cidr",
      },
    });
  }

  if (params.gateway !== undefined && params.gateway.trim().length > 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "network.ipv4_gateway can only be set when network.ipv4_mode is static.",
      details: {
        field: "network.ipv4_gateway",
      },
    });
  }
}

function ValidateIpv6Options(params: {
  mode: proxmox_lxc_helper_ipv6_mode_t;
  cidr?: string;
  gateway?: string;
}): void {
  if (params.mode === "static") {
    if (params.cidr === undefined || params.cidr.trim().length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "network.ipv6_cidr is required when network.ipv6_mode is static.",
        details: {
          field: "network.ipv6_cidr",
        },
      });
    }
    ValidateCidr({
      value: params.cidr,
      field_name: "network.ipv6_cidr",
      family: 6,
    });
    if (params.gateway !== undefined && params.gateway.trim().length > 0) {
      ValidateIpAddress({
        value: params.gateway,
        field_name: "network.ipv6_gateway",
        family: 6,
      });
    }
    return;
  }

  if (params.cidr !== undefined && params.cidr.trim().length > 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "network.ipv6_cidr can only be set when network.ipv6_mode is static.",
      details: {
        field: "network.ipv6_cidr",
      },
    });
  }

  if (params.gateway !== undefined && params.gateway.trim().length > 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "network.ipv6_gateway can only be set when network.ipv6_mode is static.",
      details: {
        field: "network.ipv6_gateway",
      },
    });
  }
}

function ValidateCidr(params: {
  value: string;
  field_name: string;
  family: 4 | 6;
}): string {
  const normalized = params.value.trim();
  const segments = normalized.split("/");
  if (segments.length !== 2) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a valid CIDR value.`,
      details: {
        field: params.field_name,
      },
    });
  }

  const [ip_value, prefix_value] = segments;
  const ip_family = isIP(ip_value);
  if (ip_family !== params.family) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must use IPv${params.family} CIDR format.`,
      details: {
        field: params.field_name,
      },
    });
  }

  const parsed_prefix = Number.parseInt(prefix_value, 10);
  const max_prefix = params.family === 4 ? 32 : 128;
  if (!Number.isInteger(parsed_prefix) || parsed_prefix < 0 || parsed_prefix > max_prefix) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} prefix must be between 0 and ${max_prefix}.`,
      details: {
        field: params.field_name,
      },
    });
  }

  return normalized;
}

function ValidateIpAddress(params: {
  value: string;
  field_name: string;
  family: 4 | 6;
}): string {
  const normalized = params.value.trim();
  if (isIP(normalized) !== params.family) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a valid IPv${params.family} address.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized;
}

function NormalizeDnsServers(params: {
  value: string | string[] | undefined;
}): string | undefined {
  if (params.value === undefined) {
    return undefined;
  }
  const server_values = typeof params.value === "string"
    ? params.value.split(/[,\s]+/g).filter((candidate) => candidate.trim().length > 0)
    : params.value;

  if (!Array.isArray(server_values) || server_values.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "dns.dns_servers must be a non-empty string or string array when provided.",
      details: {
        field: "dns.dns_servers",
      },
    });
  }

  const normalized_servers: string[] = [];
  for (const raw_server of server_values) {
    const normalized_server = raw_server.trim();
    if (!normalized_server) {
      continue;
    }
    if (isIP(normalized_server) === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "dns.dns_servers entries must be valid IP addresses.",
        details: {
          field: "dns.dns_servers",
        },
      });
    }
    normalized_servers.push(normalized_server);
  }

  if (normalized_servers.length === 0) {
    return undefined;
  }
  return normalized_servers.join(" ");
}

function DoesNodeExist(params: {
  node_id: string;
  nodes_response: proxmox_node_list_response_t;
}): boolean {
  const expected_node_id = params.node_id.toLowerCase();
  return params.nodes_response.data.some((node_record) => {
    const candidates = [
      node_record.node,
      node_record.name,
      node_record.id,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().toLowerCase() === expected_node_id) {
        return true;
      }
    }
    return false;
  });
}

function ResolveStorageId(record: proxmox_datacenter_storage_record_i): string | undefined {
  if (typeof record.storage === "string" && record.storage.trim().length > 0) {
    return record.storage.trim();
  }
  return undefined;
}

function ResolveStorageContentSet(record: proxmox_datacenter_storage_record_i | undefined): Set<string> {
  if (record === undefined) {
    return new Set<string>();
  }
  const raw_content = (record as Record<string, unknown>).content;
  const output = new Set<string>();

  if (Array.isArray(raw_content)) {
    for (const content_value of raw_content) {
      if (typeof content_value !== "string") {
        continue;
      }
      const normalized = content_value.trim().toLowerCase();
      if (normalized) {
        output.add(normalized);
      }
    }
    return output;
  }

  if (typeof raw_content === "string") {
    const entries = raw_content.split(",");
    for (const entry of entries) {
      const normalized = entry.trim().toLowerCase();
      if (normalized) {
        output.add(normalized);
      }
    }
  }
  return output;
}

function ShouldFallbackStorageList(error: unknown): boolean {
  if (!(error instanceof ProxmoxHttpError)) {
    return false;
  }
  if (error.code !== "proxmox.http.client_error") {
    return false;
  }
  return error.message.toLowerCase().includes("parameter verification failed");
}

function BuildTemplateVolumeIdCandidates(template_volume_id: string): Set<string> {
  const candidates = new Set<string>();
  const normalized = template_volume_id.trim();
  if (!normalized) {
    return candidates;
  }
  candidates.add(normalized);

  const colon_index = normalized.indexOf(":");
  if (colon_index > 0) {
    const without_storage = normalized.slice(colon_index + 1);
    if (without_storage) {
      candidates.add(without_storage);
      if (without_storage.startsWith("vztmpl/")) {
        candidates.add(without_storage.slice("vztmpl/".length));
      }
    }
  } else if (normalized.startsWith("vztmpl/")) {
    candidates.add(normalized.slice("vztmpl/".length));
  }

  return candidates;
}

function ExtractStorageFromVolumeId(volume_id: string): string | undefined {
  const trimmed = volume_id.trim();
  if (!trimmed) {
    return undefined;
  }
  const separator_index = trimmed.indexOf(":");
  if (separator_index <= 0) {
    return undefined;
  }
  const storage = trimmed.slice(0, separator_index).trim();
  return storage || undefined;
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

function BuildCreateContextValue(params: {
  stage: "create" | "start" | "add_to_ha";
  normalized_input: normalized_lxc_helper_input_t;
  create_config: proxmox_api_config_record_i;
}): string {
  const summary = {
    stage: params.stage,
    node_id: params.normalized_input.general.node_id,
    container_id: params.normalized_input.general.container_id,
    hostname: params.normalized_input.general.hostname,
    template_storage: params.normalized_input.template.storage,
    template: ResolveTemplateVolumeId({
      storage: params.normalized_input.template.storage,
      template: params.normalized_input.template.template,
    }),
    disk_storage: params.normalized_input.disks.storage,
    disk_size_gib: params.normalized_input.disks.disk_size_gib,
    bridge: params.normalized_input.network?.bridge,
    ipv4_mode: params.normalized_input.network?.ipv4_mode,
    ipv6_mode: params.normalized_input.network?.ipv6_mode,
    start_after_created: params.normalized_input.start_after_created,
    wait_for_task: params.normalized_input.wait_for_task,
    dry_run: params.normalized_input.dry_run,
    add_to_ha: params.normalized_input.general.add_to_ha,
    preflight_enabled: params.normalized_input.preflight.enabled,
    config_preview: BuildSafeConfigPreview(params.create_config),
  };
  const serialized = JSON.stringify(summary);
  const max_length = 1000;
  if (serialized.length <= max_length) {
    return serialized;
  }
  return `${serialized.slice(0, max_length - 3)}...`;
}

function BuildSafeConfigPreview(config: proxmox_api_config_record_i): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key_name, key_value] of Object.entries(config)) {
    const lowered = key_name.toLowerCase();
    if (
      lowered.includes("password")
      || lowered.includes("ssh-public-keys")
      || lowered.includes("ssh_public_keys")
      || lowered.includes("token")
      || lowered.includes("secret")
    ) {
      continue;
    }
    output[key_name] = key_value;
  }
  return output;
}

function RethrowWithCreateContext(params: {
  error: unknown;
  stage: "create" | "start" | "add_to_ha";
  normalized_input: normalized_lxc_helper_input_t;
  create_config: proxmox_api_config_record_i;
}): never {
  if (!(params.error instanceof ProxmoxError)) {
    throw params.error;
  }

  const context_value = BuildCreateContextValue({
    stage: params.stage,
    normalized_input: params.normalized_input,
    create_config: params.create_config,
  });
  const detail_field = typeof params.error.details?.field === "string" && params.error.details.field.trim().length > 0
    ? params.error.details.field
    : "helpers.create_lxc_container";
  const existing_value = typeof params.error.details?.value === "string" && params.error.details.value.trim().length > 0
    ? params.error.details.value
    : undefined;
  const merged_details = {
    ...params.error.details,
    field: detail_field,
    value: existing_value === undefined
      ? context_value
      : `${existing_value}; helper_context=${context_value}`,
  };
  const message = `LXC helper ${params.stage} failed: ${params.error.message}`;

  if (params.error instanceof ProxmoxValidationError) {
    throw new ProxmoxValidationError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxAuthError) {
    throw new ProxmoxAuthError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxNotFoundError) {
    throw new ProxmoxNotFoundError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxConflictError) {
    throw new ProxmoxConflictError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxRateLimitError) {
    throw new ProxmoxRateLimitError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTimeoutError) {
    throw new ProxmoxTimeoutError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTransportError) {
    throw new ProxmoxTransportError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTaskError) {
    throw new ProxmoxTaskError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxHttpError) {
    throw new ProxmoxHttpError({
      code: params.error.code,
      message,
      details: merged_details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }

  throw new ProxmoxError({
    code: params.error.code,
    message,
    details: merged_details,
    status_code: params.error.status_code,
    cause: params.error.cause,
  });
}
