import { ProxmoxError, ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_cluster_nodes_response_t,
  proxmox_datacenter_storage_record_i,
  proxmox_lxc_list_response_t,
  proxmox_node_drain_input_i,
  proxmox_node_drain_response_t,
  proxmox_node_maintenance_plan_record_i,
  proxmox_node_maintenance_plan_response_t,
  proxmox_node_maintenance_prepare_input_i,
  proxmox_vm_list_response_t,
  proxmox_vm_placement_plan_response_t,
  proxmox_lxc_placement_plan_response_t,
  proxmox_vm_task_result_t,
  proxmox_lxc_task_result_t,
  proxmox_node_reboot_result_t,
} from "../types/proxmox_service_types";

interface cluster_service_node_maintenance_i {
  listNodes(): Promise<proxmox_cluster_nodes_response_t>;
}

interface datacenter_service_node_maintenance_i {
  listStorage(params?: {
    node?: string;
  }): Promise<{
    data: proxmox_datacenter_storage_record_i[];
  }>;
}

interface vm_service_node_maintenance_i {
  listVms(params?: {
    node_id?: string;
  }): Promise<proxmox_vm_list_response_t>;
  migrateVm(
    params: {
      node_id: string;
      vm_id: string | number;
      target_node_id: string;
      online?: boolean;
      force?: boolean;
      wait_for_task?: boolean;
      timeout_ms?: number;
      retry_allowed?: boolean;
    } & ({ wait_for_task: true } | { wait_for_task?: boolean }),
  ): Promise<proxmox_vm_task_result_t>;
}

interface lxc_service_node_maintenance_i {
  listContainers(params?: {
    node_id?: string;
  }): Promise<proxmox_lxc_list_response_t>;
  migrateContainer(
    params: {
      node_id: string;
      container_id: string | number;
      target_node_id: string;
      restart?: boolean;
      migrate_volumes?: boolean;
      wait_for_task?: boolean;
      timeout_ms?: number;
      retry_allowed?: boolean;
    } & ({ wait_for_task: true } | { wait_for_task?: boolean }),
  ): Promise<proxmox_lxc_task_result_t>;
}

interface node_service_node_maintenance_i {
  rebootNode(
    params: {
      node_id: string;
      wait_for_task?: boolean;
      timeout_ms?: number;
      force?: boolean;
    },
  ): Promise<proxmox_node_reboot_result_t>;
}

interface cluster_orchestration_node_maintenance_i {
  planLxcPlacement(params: {
    required_storage_id: string;
    required_bridge?: string;
    requested_cores?: number;
    requested_memory_bytes?: number;
    candidate_node_ids?: string[];
    scoring_mode?: "balanced" | "capacity_first" | "strict";
    strict_permissions?: boolean;
  }): Promise<proxmox_lxc_placement_plan_response_t>;
  planVmPlacement(params: {
    required_storage_id: string;
    required_bridge?: string;
    requested_cores?: number;
    requested_memory_bytes?: number;
    candidate_node_ids?: string[];
    scoring_mode?: "balanced" | "capacity_first" | "strict";
    strict_permissions?: boolean;
  }): Promise<proxmox_vm_placement_plan_response_t>;
}

type normalized_prepare_input_t = {
  node_id: string;
  target_node_ids: string[];
  include_resource_types: Array<"qemu" | "lxc">;
  include_resource_ids: Set<string>;
  exclude_resource_ids: Set<string>;
  include_stopped: boolean;
  required_bridge?: string;
  scoring_mode: "balanced" | "capacity_first" | "strict";
  strict_permissions: boolean;
};

type normalized_drain_input_t = normalized_prepare_input_t & {
  dry_run: boolean;
  max_parallel_migrations: number;
  fail_fast: boolean;
  wait_for_tasks: boolean;
  timeout_ms?: number;
  retry_allowed?: boolean;
  lxc_migrate_volumes: boolean;
  lxc_restart: boolean;
  vm_online: boolean;
  vm_force: boolean;
  reboot_after_drain: boolean;
  allow_reboot: boolean;
};

type maintenance_resource_candidate_t = {
  resource_type: "qemu" | "lxc";
  resource_id: string;
  node_id: string;
  status?: string;
  name?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
};

const DEFAULT_MAX_PARALLEL_MIGRATIONS = 2;
const MAX_PARALLEL_MIGRATIONS_LIMIT = 10;

export interface node_maintenance_helper_input_i {
  cluster_service: cluster_service_node_maintenance_i;
  datacenter_service: datacenter_service_node_maintenance_i;
  vm_service: vm_service_node_maintenance_i;
  lxc_service: lxc_service_node_maintenance_i;
  node_service: node_service_node_maintenance_i;
  cluster_orchestration_helper: cluster_orchestration_node_maintenance_i;
}

export class NodeMaintenanceHelper {
  public readonly cluster_service: cluster_service_node_maintenance_i;
  public readonly datacenter_service: datacenter_service_node_maintenance_i;
  public readonly vm_service: vm_service_node_maintenance_i;
  public readonly lxc_service: lxc_service_node_maintenance_i;
  public readonly node_service: node_service_node_maintenance_i;
  public readonly cluster_orchestration_helper: cluster_orchestration_node_maintenance_i;

  constructor(params: node_maintenance_helper_input_i) {
    this.cluster_service = params.cluster_service;
    this.datacenter_service = params.datacenter_service;
    this.vm_service = params.vm_service;
    this.lxc_service = params.lxc_service;
    this.node_service = params.node_service;
    this.cluster_orchestration_helper = params.cluster_orchestration_helper;
  }

  public async prepareNodeMaintenance(
    params: proxmox_node_maintenance_prepare_input_i,
  ): Promise<proxmox_node_maintenance_plan_response_t> {
    const normalized_input = await this.normalizePrepareInput(params);
    const plan = await this.buildMaintenancePlan(normalized_input);
    return {
      success: true,
      status_code: 200,
      data: plan,
    };
  }

  public async drainNode(
    params: proxmox_node_drain_input_i,
  ): Promise<proxmox_node_drain_response_t> {
    const normalized_input = await this.normalizeDrainInput(params);
    const plan_response = await this.prepareNodeMaintenance({
      node_id: normalized_input.node_id,
      target_node_ids: normalized_input.target_node_ids,
      include_resource_types: normalized_input.include_resource_types,
      include_resource_ids: Array.from(normalized_input.include_resource_ids.values()),
      exclude_resource_ids: Array.from(normalized_input.exclude_resource_ids.values()),
      include_stopped: normalized_input.include_stopped,
      required_bridge: normalized_input.required_bridge,
      scoring_mode: normalized_input.scoring_mode,
      strict_permissions: normalized_input.strict_permissions,
    });
    const plan = plan_response.data;
    const drain_candidates = plan.resources.filter(
      (resource_record) =>
        resource_record.selected_for_drain
        && !resource_record.blocked
        && resource_record.target_node_id !== undefined,
    );

    if (normalized_input.dry_run) {
      return {
        success: true,
        status_code: 200,
        data: {
          source_node_id: normalized_input.node_id,
          dry_run: true,
          fail_fast: normalized_input.fail_fast,
          wait_for_tasks: normalized_input.wait_for_tasks,
          max_parallel_migrations: normalized_input.max_parallel_migrations,
          planned_reboot: normalized_input.reboot_after_drain,
          reboot_executed: false,
          plan,
          summary: {
            requested: drain_candidates.length,
            attempted: 0,
            succeeded: 0,
            failed: 0,
            skipped: drain_candidates.length,
          },
          migrations: drain_candidates.map((resource_record) => ({
            resource_type: resource_record.resource_type,
            resource_id: resource_record.resource_id,
            source_node_id: resource_record.node_id,
            target_node_id: resource_record.target_node_id!,
            submitted: false,
            success: false,
            error: {
              message: "Migration skipped in dry-run mode.",
              field: "dry_run",
            },
          })),
        },
      };
    }

    const migrations: proxmox_node_drain_response_t["data"]["migrations"] = [];
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (
      let resource_index = 0;
      resource_index < drain_candidates.length;
      resource_index += normalized_input.max_parallel_migrations
    ) {
      const resource_chunk = drain_candidates.slice(
        resource_index,
        resource_index + normalized_input.max_parallel_migrations,
      );
      const chunk_results = await Promise.all(
        resource_chunk.map(async (resource_record) =>
          this.executeSingleMigration({
            resource_record,
            input: normalized_input,
          })
        ),
      );
      migrations.push(...chunk_results);
      attempted += chunk_results.length;
      succeeded += chunk_results.filter((migration_record) => migration_record.success).length;
      failed += chunk_results.filter((migration_record) => !migration_record.success).length;

      if (normalized_input.fail_fast && chunk_results.some((migration_record) => !migration_record.success)) {
        const remaining = drain_candidates.slice(resource_index + resource_chunk.length);
        for (const remaining_resource of remaining) {
          migrations.push({
            resource_type: remaining_resource.resource_type,
            resource_id: remaining_resource.resource_id,
            source_node_id: remaining_resource.node_id,
            target_node_id: remaining_resource.target_node_id!,
            submitted: false,
            success: false,
            error: {
              message: "Migration skipped after fail-fast trigger.",
              field: "fail_fast",
            },
          });
          skipped += 1;
        }
        break;
      }
    }

    let reboot_executed = false;
    let reboot_task: proxmox_node_drain_response_t["data"]["reboot_task"];
    if (
      normalized_input.reboot_after_drain
      && normalized_input.allow_reboot
      && failed === 0
    ) {
      reboot_task = await this.node_service.rebootNode({
        node_id: normalized_input.node_id,
        wait_for_task: normalized_input.wait_for_tasks,
        timeout_ms: normalized_input.timeout_ms,
      });
      reboot_executed = true;
    }

    return {
      success: true,
      status_code: failed > 0 ? 207 : 200,
      data: {
        source_node_id: normalized_input.node_id,
        dry_run: false,
        fail_fast: normalized_input.fail_fast,
        wait_for_tasks: normalized_input.wait_for_tasks,
        max_parallel_migrations: normalized_input.max_parallel_migrations,
        planned_reboot: normalized_input.reboot_after_drain,
        reboot_executed,
        plan,
        summary: {
          requested: drain_candidates.length,
          attempted,
          succeeded,
          failed,
          skipped,
        },
        migrations,
        reboot_task,
      },
    };
  }

  private async executeSingleMigration(params: {
    resource_record: proxmox_node_maintenance_plan_record_i["resources"][number];
    input: normalized_drain_input_t;
  }): Promise<proxmox_node_drain_response_t["data"]["migrations"][number]> {
    const target_node_id = params.resource_record.target_node_id!;
    try {
      if (params.resource_record.resource_type === "qemu") {
        const migration_task = await this.vm_service.migrateVm({
          node_id: params.resource_record.node_id,
          vm_id: params.resource_record.resource_id,
          target_node_id,
          online: params.input.vm_online,
          force: params.input.vm_force,
          wait_for_task: params.input.wait_for_tasks,
          timeout_ms: params.input.timeout_ms,
          retry_allowed: params.input.retry_allowed,
        });
        return {
          resource_type: "qemu",
          resource_id: params.resource_record.resource_id,
          source_node_id: params.resource_record.node_id,
          target_node_id,
          submitted: true,
          success: true,
          task_id: migration_task.task_id,
          operation: migration_task.operation,
        };
      }

      const migration_task = await this.lxc_service.migrateContainer({
        node_id: params.resource_record.node_id,
        container_id: params.resource_record.resource_id,
        target_node_id,
        restart: params.input.lxc_restart,
        migrate_volumes: params.input.lxc_migrate_volumes,
        wait_for_task: params.input.wait_for_tasks,
        timeout_ms: params.input.timeout_ms,
        retry_allowed: params.input.retry_allowed,
      });
      return {
        resource_type: "lxc",
        resource_id: params.resource_record.resource_id,
        source_node_id: params.resource_record.node_id,
        target_node_id,
        submitted: true,
        success: true,
        task_id: migration_task.task_id,
        operation: migration_task.operation,
      };
    } catch (error) {
      return {
        resource_type: params.resource_record.resource_type,
        resource_id: params.resource_record.resource_id,
        source_node_id: params.resource_record.node_id,
        target_node_id,
        submitted: true,
        success: false,
        error: BuildSafeErrorRecord(error),
      };
    }
  }

  private async buildMaintenancePlan(
    params: normalized_prepare_input_t,
  ): Promise<proxmox_node_maintenance_plan_record_i> {
    const source_resources = await this.listSourceResources({
      node_id: params.node_id,
      include_stopped: params.include_stopped,
    });
    const filtered_resources = source_resources.filter((resource_record) =>
      ResourceMatchesFilters({
        resource_record,
        include_resource_types: params.include_resource_types,
        include_resource_ids: params.include_resource_ids,
        exclude_resource_ids: params.exclude_resource_ids,
      })
    );

    const default_storage_by_type = await this.resolveDefaultStorageByResourceType({
      node_id: params.node_id,
    });

    const resources: proxmox_node_maintenance_plan_record_i["resources"] = [];
    for (const resource_record of filtered_resources) {
      const required_storage_id = default_storage_by_type[resource_record.resource_type];
      if (required_storage_id === undefined) {
        resources.push({
          resource_type: resource_record.resource_type,
          resource_id: resource_record.resource_id,
          node_id: resource_record.node_id,
          status: resource_record.status,
          name: resource_record.name,
          selected_for_drain: false,
          blocked: true,
          reason: "no_compatible_storage_discovered",
        });
        continue;
      }

      const planner_result = resource_record.resource_type === "qemu"
        ? await this.cluster_orchestration_helper.planVmPlacement({
          required_storage_id,
          required_bridge: params.required_bridge,
          requested_cores: resource_record.requested_cores,
          requested_memory_bytes: resource_record.requested_memory_bytes,
          candidate_node_ids: params.target_node_ids,
          scoring_mode: params.scoring_mode,
          strict_permissions: params.strict_permissions,
        })
        : await this.cluster_orchestration_helper.planLxcPlacement({
          required_storage_id,
          required_bridge: params.required_bridge,
          requested_cores: resource_record.requested_cores,
          requested_memory_bytes: resource_record.requested_memory_bytes,
          candidate_node_ids: params.target_node_ids,
          scoring_mode: params.scoring_mode,
          strict_permissions: params.strict_permissions,
        });
      const recommended_node_id = planner_result.data.recommended_node_id;
      const recommended_candidate = planner_result.data.candidates.find(
        (candidate) => candidate.node_id === recommended_node_id,
      );
      const blocked = recommended_node_id === undefined;
      resources.push({
        resource_type: resource_record.resource_type,
        resource_id: resource_record.resource_id,
        node_id: resource_record.node_id,
        status: resource_record.status,
        name: resource_record.name,
        selected_for_drain: !blocked,
        blocked,
        reason: blocked
          ? "no_placement_candidate_passed_preflight"
          : "placement_candidate_selected",
        target_node_id: recommended_node_id,
        planner_score: recommended_candidate?.score,
        planner_failed_required_checks: recommended_candidate?.failed_required_checks,
        planner_raw: recommended_candidate,
      });
    }

    const blocked_resource_count = resources.filter((resource_record) => resource_record.blocked).length;
    const migration_candidate_count = resources.filter(
      (resource_record) => resource_record.selected_for_drain && !resource_record.blocked,
    ).length;
    return {
      source_node_id: params.node_id,
      target_node_ids: params.target_node_ids,
      checked_resource_count: source_resources.length,
      selected_resource_count: resources.length,
      blocked_resource_count,
      migration_candidate_count,
      planned_reboot: false,
      resources,
    };
  }

  private async listSourceResources(params: {
    node_id: string;
    include_stopped: boolean;
  }): Promise<maintenance_resource_candidate_t[]> {
    const [vm_response, lxc_response] = await Promise.all([
      this.vm_service.listVms({
        node_id: params.node_id,
      }),
      this.lxc_service.listContainers({
        node_id: params.node_id,
      }),
    ]);

    const resources: maintenance_resource_candidate_t[] = [];
    for (const vm_record of vm_response.data) {
      if (!IsRecord(vm_record)) {
        continue;
      }
      const resource_id = ResolveResourceId(vm_record);
      if (resource_id === undefined) {
        continue;
      }
      const status = ToOptionalString(vm_record.status);
      if (!params.include_stopped && status !== undefined && status !== "running") {
        continue;
      }
      resources.push({
        resource_type: "qemu",
        resource_id,
        node_id: params.node_id,
        status,
        name: ToOptionalString(vm_record.name),
        requested_cores: ToOptionalPositiveInteger(vm_record.cpus),
        requested_memory_bytes: ToOptionalPositiveInteger(vm_record.maxmem),
      });
    }
    for (const lxc_record of lxc_response.data) {
      if (!IsRecord(lxc_record)) {
        continue;
      }
      const resource_id = ResolveResourceId(lxc_record);
      if (resource_id === undefined) {
        continue;
      }
      const status = ToOptionalString(lxc_record.status);
      if (!params.include_stopped && status !== undefined && status !== "running") {
        continue;
      }
      resources.push({
        resource_type: "lxc",
        resource_id,
        node_id: params.node_id,
        status,
        name: ToOptionalString(lxc_record.name),
        requested_cores: ToOptionalPositiveInteger(lxc_record.cpus),
        requested_memory_bytes: ToOptionalPositiveInteger(lxc_record.maxmem),
      });
    }
    return resources;
  }

  private async resolveDefaultStorageByResourceType(params: {
    node_id: string;
  }): Promise<Record<"qemu" | "lxc", string | undefined>> {
    const storage_records = await this.listStorageRecordsForNode({
      node_id: params.node_id,
    });
    return {
      qemu: SelectStorageByContent({
        records: storage_records,
        required_content: "images",
      }),
      lxc: SelectStorageByContent({
        records: storage_records,
        required_content: "rootdir",
      }),
    };
  }

  private async listStorageRecordsForNode(params: {
    node_id: string;
  }): Promise<proxmox_datacenter_storage_record_i[]> {
    try {
      const scoped_response = await this.datacenter_service.listStorage({
        node: params.node_id,
      });
      return Array.isArray(scoped_response.data) ? scoped_response.data : [];
    } catch (error) {
      if (!ShouldFallbackStorageNodeQuery(error)) {
        throw error;
      }
      const unscoped_response = await this.datacenter_service.listStorage();
      if (!Array.isArray(unscoped_response.data)) {
        return [];
      }
      return unscoped_response.data.filter((record) => {
        const record_node = record.node?.trim();
        if (record_node === undefined || record_node.length === 0) {
          return true;
        }
        return record_node.toLowerCase() === params.node_id.toLowerCase();
      });
    }
  }

  private async normalizePrepareInput(
    params: proxmox_node_maintenance_prepare_input_i,
  ): Promise<normalized_prepare_input_t> {
    const node_id = ValidateNodeId({
      node_id: params.node_id,
      field_name: "node_id",
    });
    const target_node_ids = params.target_node_ids === undefined
      ? await this.resolveDefaultTargetNodeIds({
        source_node_id: node_id,
      })
      : ValidateNodeIdList({
        node_ids: params.target_node_ids,
        field_name: "target_node_ids",
      }).filter((target_node_id) => target_node_id.toLowerCase() !== node_id.toLowerCase());

    if (target_node_ids.length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "At least one target node is required for maintenance planning.",
        details: {
          field: "target_node_ids",
        },
      });
    }

    const include_resource_types = ValidateResourceTypes(params.include_resource_types);
    const include_resource_ids = ValidateResourceFilterSet({
      resource_ids: params.include_resource_ids,
      field_name: "include_resource_ids",
    });
    const exclude_resource_ids = ValidateResourceFilterSet({
      resource_ids: params.exclude_resource_ids,
      field_name: "exclude_resource_ids",
    });
    const include_stopped = params.include_stopped === true;
    const required_bridge = params.required_bridge === undefined
      ? undefined
      : ValidateBridgeName(params.required_bridge);
    const scoring_mode = ValidateScoringMode(params.scoring_mode);
    const strict_permissions = params.strict_permissions === true;

    return {
      node_id,
      target_node_ids,
      include_resource_types,
      include_resource_ids,
      exclude_resource_ids,
      include_stopped,
      required_bridge,
      scoring_mode,
      strict_permissions,
    };
  }

  private async normalizeDrainInput(
    params: proxmox_node_drain_input_i,
  ): Promise<normalized_drain_input_t> {
    const prepare_input = await this.normalizePrepareInput(params);
    const dry_run = params.dry_run !== false;
    const max_parallel_migrations = params.max_parallel_migrations
      ?? DEFAULT_MAX_PARALLEL_MIGRATIONS;
    if (!Number.isInteger(max_parallel_migrations) || max_parallel_migrations <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "max_parallel_migrations must be a positive integer.",
        details: {
          field: "max_parallel_migrations",
        },
      });
    }
    if (max_parallel_migrations > MAX_PARALLEL_MIGRATIONS_LIMIT) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `max_parallel_migrations must be <= ${MAX_PARALLEL_MIGRATIONS_LIMIT}.`,
        details: {
          field: "max_parallel_migrations",
        },
      });
    }
    const fail_fast = params.fail_fast === true;
    const wait_for_tasks = params.wait_for_tasks !== false;
    const timeout_ms = params.timeout_ms;
    if (timeout_ms !== undefined && (!Number.isInteger(timeout_ms) || timeout_ms <= 0)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "timeout_ms must be a positive integer when provided.",
        details: {
          field: "timeout_ms",
        },
      });
    }

    const reboot_after_drain = params.reboot_after_drain === true;
    const allow_reboot = params.allow_reboot === true;
    if (reboot_after_drain && !allow_reboot) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "allow_reboot must be true when reboot_after_drain is requested.",
        details: {
          field: "allow_reboot",
        },
      });
    }

    return {
      ...prepare_input,
      dry_run,
      max_parallel_migrations,
      fail_fast,
      wait_for_tasks,
      timeout_ms,
      retry_allowed: params.retry_allowed,
      lxc_migrate_volumes: params.lxc_migrate_volumes === true,
      lxc_restart: params.lxc_restart === true,
      vm_online: params.vm_online !== false,
      vm_force: params.vm_force === true,
      reboot_after_drain,
      allow_reboot,
    };
  }

  private async resolveDefaultTargetNodeIds(params: {
    source_node_id: string;
  }): Promise<string[]> {
    const cluster_nodes_response = await this.cluster_service.listNodes();
    const target_node_ids: string[] = [];
    for (const raw_node of cluster_nodes_response.data) {
      const node_id = ResolveNodeId(raw_node);
      if (node_id === undefined) {
        continue;
      }
      if (node_id.toLowerCase() === params.source_node_id.toLowerCase()) {
        continue;
      }
      target_node_ids.push(node_id);
    }
    return ValidateNodeIdList({
      node_ids: target_node_ids,
      field_name: "target_node_ids",
    });
  }
}

function ResourceMatchesFilters(params: {
  resource_record: maintenance_resource_candidate_t;
  include_resource_types: Array<"qemu" | "lxc">;
  include_resource_ids: Set<string>;
  exclude_resource_ids: Set<string>;
}): boolean {
  if (!params.include_resource_types.includes(params.resource_record.resource_type)) {
    return false;
  }
  const canonical_id = `${params.resource_record.resource_type}/${params.resource_record.resource_id}`.toLowerCase();
  if (params.exclude_resource_ids.has(canonical_id)) {
    return false;
  }
  if (params.include_resource_ids.size > 0 && !params.include_resource_ids.has(canonical_id)) {
    return false;
  }
  return true;
}

function BuildSafeErrorRecord(error: unknown): {
  code?: string;
  message: string;
  status_code?: number;
  path?: string;
  field?: string;
} {
  if (error instanceof ProxmoxError) {
    return {
      code: error.code,
      message: error.message,
      status_code: error.status_code,
      path: error.details?.path,
      field: error.details?.field,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }
  return {
    message: "Operation failed for unknown reason.",
  };
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

function ValidateNodeIdList(params: {
  node_ids: string[];
  field_name: string;
}): string[] {
  if (!Array.isArray(params.node_ids) || params.node_ids.length === 0) {
    return [];
  }
  const dedupe_set = new Set<string>();
  const normalized: string[] = [];
  for (const raw_node_id of params.node_ids) {
    const node_id = ValidateNodeId({
      node_id: raw_node_id,
      field_name: params.field_name,
    });
    const dedupe_key = node_id.toLowerCase();
    if (dedupe_set.has(dedupe_key)) {
      continue;
    }
    dedupe_set.add(dedupe_key);
    normalized.push(node_id);
  }
  return normalized;
}

function ValidateResourceTypes(
  resource_types: proxmox_node_maintenance_prepare_input_i["include_resource_types"],
): Array<"qemu" | "lxc"> {
  if (resource_types === undefined || resource_types.length === 0) {
    return ["qemu", "lxc"];
  }
  const dedupe_set = new Set<"qemu" | "lxc">();
  for (const resource_type of resource_types) {
    if (resource_type !== "qemu" && resource_type !== "lxc") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "include_resource_types supports qemu and lxc only.",
        details: {
          field: "include_resource_types",
        },
      });
    }
    dedupe_set.add(resource_type);
  }
  return Array.from(dedupe_set.values());
}

function ValidateResourceFilterSet(params: {
  resource_ids: string[] | undefined;
  field_name: string;
}): Set<string> {
  const resource_set = new Set<string>();
  if (params.resource_ids === undefined) {
    return resource_set;
  }
  for (const raw_resource_id of params.resource_ids) {
    const normalized_resource_id = raw_resource_id.trim().toLowerCase();
    if (!normalized_resource_id) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} cannot include empty values.`,
        details: {
          field: params.field_name,
        },
      });
    }
    if (!/^(qemu|lxc)\/[1-9][0-9]*$/.test(normalized_resource_id)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} values must match <qemu|lxc>/<id>.`,
        details: {
          field: params.field_name,
        },
      });
    }
    resource_set.add(normalized_resource_id);
  }
  return resource_set;
}

function ValidateBridgeName(raw_bridge_name: string): string {
  const bridge_name = raw_bridge_name.trim();
  if (!bridge_name) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "required_bridge cannot be empty.",
      details: {
        field: "required_bridge",
      },
    });
  }
  return bridge_name;
}

function ValidateScoringMode(
  scoring_mode: "balanced" | "capacity_first" | "strict" | undefined,
): "balanced" | "capacity_first" | "strict" {
  if (scoring_mode === undefined) {
    return "balanced";
  }
  if (scoring_mode !== "balanced" && scoring_mode !== "capacity_first" && scoring_mode !== "strict") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "scoring_mode must be balanced, capacity_first, or strict.",
      details: {
        field: "scoring_mode",
      },
    });
  }
  return scoring_mode;
}

function ResolveNodeId(raw_node: unknown): string | undefined {
  if (!IsRecord(raw_node)) {
    return undefined;
  }
  const candidates = [raw_node.node, raw_node.name, raw_node.id];
  for (const candidate of candidates) {
    const value = ToOptionalString(candidate);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function ResolveResourceId(raw_record: Record<string, unknown>): string | undefined {
  const vmid = ToOptionalPositiveInteger(raw_record.vmid);
  if (vmid !== undefined) {
    return String(vmid);
  }
  const id = ToOptionalString(raw_record.id);
  if (id !== undefined) {
    const match = id.match(/(?:qemu|lxc)\/([1-9][0-9]*)/i);
    if (match !== null) {
      return match[1];
    }
  }
  return undefined;
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

function ShouldFallbackStorageNodeQuery(error: unknown): boolean {
  if (!(error instanceof ProxmoxError)) {
    return false;
  }
  return error.status_code === 400 || error.status_code === 501;
}

function SelectStorageByContent(params: {
  records: proxmox_datacenter_storage_record_i[];
  required_content: "images" | "rootdir";
}): string | undefined {
  const matching_records = params.records.filter((record) => {
    const storage_id = ToOptionalString(record.storage);
    if (storage_id === undefined) {
      return false;
    }
    if (!ResolveStorageEnabled(record)) {
      return false;
    }
    const content = NormalizeStorageContent(record.content);
    return content.has(params.required_content);
  });
  if (matching_records.length === 0) {
    return undefined;
  }

  const shared_record = matching_records.find((record) => ResolveStorageShared(record));
  if (shared_record !== undefined) {
    return shared_record.storage?.trim();
  }
  return matching_records[0].storage?.trim();
}

function ResolveStorageEnabled(record: proxmox_datacenter_storage_record_i): boolean {
  if (typeof record.enabled === "boolean") {
    return record.enabled;
  }
  if (typeof record.enabled === "number") {
    return record.enabled > 0;
  }
  if (typeof record.status === "string") {
    return record.status.trim().toLowerCase() !== "disabled";
  }
  return true;
}

function ResolveStorageShared(record: proxmox_datacenter_storage_record_i): boolean {
  if (typeof record.shared === "number") {
    return record.shared > 0;
  }
  return false;
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
