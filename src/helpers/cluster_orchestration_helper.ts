import { ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_cluster_bridge_compatibility_response_t,
  proxmox_cluster_nodes_response_t,
  proxmox_cluster_placement_candidate_t,
  proxmox_cluster_placement_check_t,
  proxmox_cluster_placement_scoring_mode_t,
  proxmox_cluster_storage_compatibility_response_t,
  proxmox_datacenter_storage_record_i,
  proxmox_lxc_migration_with_preflight_input_i,
  proxmox_lxc_migration_with_preflight_response_t,
  proxmox_lxc_placement_plan_input_i,
  proxmox_lxc_placement_plan_response_t,
  proxmox_lxc_task_result_t,
  proxmox_node_core_preflight_response_t,
  proxmox_node_memory_preflight_response_t,
  proxmox_vm_migration_with_preflight_input_i,
  proxmox_vm_migration_with_preflight_response_t,
  proxmox_vm_placement_plan_input_i,
  proxmox_vm_placement_plan_response_t,
  proxmox_vm_task_result_t,
} from "../types/proxmox_service_types";

interface cluster_service_orchestration_i {
  listNodes(): Promise<proxmox_cluster_nodes_response_t>;
  checkStorageCompatibility(params: {
    node_ids: string[];
    required_content: "rootdir" | "images";
    storage_id?: string;
  }): Promise<proxmox_cluster_storage_compatibility_response_t>;
  checkBridgeCompatibility(params: {
    node_ids: string[];
    bridge: string;
  }): Promise<proxmox_cluster_bridge_compatibility_response_t>;
}

interface node_service_orchestration_i {
  canAllocateCores(params: {
    node_id: string;
    requested_cores: number;
    mode?: "logical" | "physical";
  }): Promise<proxmox_node_core_preflight_response_t>;
  canAllocateMemory(params: {
    node_id: string;
    requested_memory_bytes: number;
    mode?: "free_headroom" | "allocated_headroom";
  }): Promise<proxmox_node_memory_preflight_response_t>;
}

interface datacenter_service_orchestration_i {
  listStorage(params?: {
    node?: string;
  }): Promise<{
    data: proxmox_datacenter_storage_record_i[];
  }>;
}

interface access_service_orchestration_i {
  hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }): Promise<{
    data: {
      allowed: boolean;
    };
  }>;
}

interface lxc_service_orchestration_i {
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

interface vm_service_orchestration_i {
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

export interface cluster_orchestration_helper_input_i {
  cluster_service: cluster_service_orchestration_i;
  node_service: node_service_orchestration_i;
  datacenter_service: datacenter_service_orchestration_i;
  access_service: access_service_orchestration_i;
  lxc_service: lxc_service_orchestration_i;
  vm_service: vm_service_orchestration_i;
}

type placement_permission_check_t = {
  path: string;
  privilege: string;
  check_name: string;
};

type template_storage_support_result_t = {
  node_id: string;
  supports_vztmpl: boolean;
  reason: string;
};

type placement_internal_input_t = {
  resource_type: "lxc" | "qemu";
  required_content: "rootdir" | "images";
  required_storage_id: string;
  template_storage_id?: string;
  required_bridge?: string;
  requested_cores?: number;
  requested_memory_bytes?: number;
  candidate_node_ids?: string[];
  preferred_node_ids?: string[];
  disallowed_node_ids?: string[];
  required_pool_id?: string;
  scoring_mode?: proxmox_cluster_placement_scoring_mode_t;
  strict_permissions?: boolean;
  permission_checks: placement_permission_check_t[];
};

const DEFAULT_SCORING_MODE: proxmox_cluster_placement_scoring_mode_t = "balanced";

export class ClusterOrchestrationHelper {
  public readonly cluster_service: cluster_service_orchestration_i;
  public readonly node_service: node_service_orchestration_i;
  public readonly datacenter_service: datacenter_service_orchestration_i;
  public readonly access_service: access_service_orchestration_i;
  public readonly lxc_service: lxc_service_orchestration_i;
  public readonly vm_service: vm_service_orchestration_i;

  constructor(params: cluster_orchestration_helper_input_i) {
    this.cluster_service = params.cluster_service;
    this.node_service = params.node_service;
    this.datacenter_service = params.datacenter_service;
    this.access_service = params.access_service;
    this.lxc_service = params.lxc_service;
    this.vm_service = params.vm_service;
  }

  public async planLxcPlacement(
    params: proxmox_lxc_placement_plan_input_i,
  ): Promise<proxmox_lxc_placement_plan_response_t> {
    const required_storage_id = ValidateStorageId({
      value: params.required_storage_id,
      field_name: "required_storage_id",
    });
    const template_storage_id = params.template_storage_id === undefined
      ? undefined
      : ValidateStorageId({
        value: params.template_storage_id,
        field_name: "template_storage_id",
      });
    const required_pool_id = params.required_pool_id === undefined
      ? undefined
      : ValidatePoolId(params.required_pool_id);
    return this.planPlacement({
      resource_type: "lxc",
      required_content: "rootdir",
      required_storage_id,
      template_storage_id,
      required_bridge: ValidateOptionalBridge(params.required_bridge),
      requested_cores: ValidateOptionalRequestedCores(params.requested_cores),
      requested_memory_bytes: ValidateOptionalRequestedMemoryBytes(params.requested_memory_bytes),
      candidate_node_ids: params.candidate_node_ids,
      preferred_node_ids: params.preferred_node_ids,
      disallowed_node_ids: params.disallowed_node_ids,
      required_pool_id,
      scoring_mode: params.scoring_mode,
      strict_permissions: params.strict_permissions,
      permission_checks: BuildLxcPlacementPermissionChecks({
        required_storage_id,
        template_storage_id,
        required_pool_id,
      }),
    });
  }

  public async planVmPlacement(
    params: proxmox_vm_placement_plan_input_i,
  ): Promise<proxmox_vm_placement_plan_response_t> {
    const required_storage_id = ValidateStorageId({
      value: params.required_storage_id,
      field_name: "required_storage_id",
    });
    const required_pool_id = params.required_pool_id === undefined
      ? undefined
      : ValidatePoolId(params.required_pool_id);
    return this.planPlacement({
      resource_type: "qemu",
      required_content: "images",
      required_storage_id,
      required_bridge: ValidateOptionalBridge(params.required_bridge),
      requested_cores: ValidateOptionalRequestedCores(params.requested_cores),
      requested_memory_bytes: ValidateOptionalRequestedMemoryBytes(params.requested_memory_bytes),
      candidate_node_ids: params.candidate_node_ids,
      preferred_node_ids: params.preferred_node_ids,
      disallowed_node_ids: params.disallowed_node_ids,
      required_pool_id,
      scoring_mode: params.scoring_mode,
      strict_permissions: params.strict_permissions,
      permission_checks: BuildVmPlacementPermissionChecks({
        required_storage_id,
        required_pool_id,
      }),
    });
  }

  public async migrateLxcWithPreflight(
    params: proxmox_lxc_migration_with_preflight_input_i,
  ): Promise<proxmox_lxc_migration_with_preflight_response_t> {
    const source_node_id = ValidateNodeId({
      value: params.node_id,
      field_name: "node_id",
    });
    const target_node_id = ValidateNodeId({
      value: params.target_node_id,
      field_name: "target_node_id",
    });
    if (source_node_id.toLowerCase() === target_node_id.toLowerCase()) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "target_node_id must differ from node_id.",
        details: {
          field: "target_node_id",
        },
      });
    }
    const container_id = ValidateResourceId({
      value: params.container_id,
      field_name: "container_id",
    });
    const required_storage_id = ValidateStorageId({
      value: params.required_storage_id,
      field_name: "required_storage_id",
    });
    const plan = await this.planLxcPlacement({
      required_storage_id,
      template_storage_id: params.template_storage_id,
      required_bridge: params.required_bridge,
      requested_cores: params.requested_cores,
      requested_memory_bytes: params.requested_memory_bytes,
      candidate_node_ids: [target_node_id],
      scoring_mode: params.scoring_mode,
      strict_permissions: params.strict_permissions,
    });
    const migration_privilege_check = await this.access_service.hasCurrentPrivilege({
      path: `/vms/${container_id}`,
      privilege: "VM.Migrate",
    });
    const target_candidate = plan.data.candidates.find((candidate) =>
      candidate.node_id.toLowerCase() === target_node_id.toLowerCase()
    );
    const preflight_allowed = target_candidate?.allowed === true
      && migration_privilege_check.data.allowed === true;
    const preflight_reason = ResolveMigrationPreflightReason({
      target_candidate,
      migration_privilege_allowed: migration_privilege_check.data.allowed === true,
    });
    const preflight = {
      scoring_mode: plan.data.scoring_mode,
      strict_permissions: plan.data.strict_permissions,
      source_node_id,
      target_node_id,
      allowed: preflight_allowed,
      reason: preflight_reason,
      planner: plan.data,
      target_candidate,
    };

    if (!preflight_allowed) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC migration preflight failed.",
        details: {
          field: "target_node_id",
          value: preflight_reason,
        },
      });
    }

    const migration_task = await this.lxc_service.migrateContainer({
      node_id: source_node_id,
      container_id,
      target_node_id,
      restart: params.restart,
      migrate_volumes: params.migrate_volumes,
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed,
    });

    return {
      success: true,
      status_code: 200,
      data: {
        resource_type: "lxc",
        node_id: source_node_id,
        target_node_id,
        container_id,
        preflight,
        migration_task,
      },
    };
  }

  public async migrateVmWithPreflight(
    params: proxmox_vm_migration_with_preflight_input_i,
  ): Promise<proxmox_vm_migration_with_preflight_response_t> {
    const source_node_id = ValidateNodeId({
      value: params.node_id,
      field_name: "node_id",
    });
    const target_node_id = ValidateNodeId({
      value: params.target_node_id,
      field_name: "target_node_id",
    });
    if (source_node_id.toLowerCase() === target_node_id.toLowerCase()) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "target_node_id must differ from node_id.",
        details: {
          field: "target_node_id",
        },
      });
    }
    const vm_id = ValidateResourceId({
      value: params.vm_id,
      field_name: "vm_id",
    });
    const required_storage_id = ValidateStorageId({
      value: params.required_storage_id,
      field_name: "required_storage_id",
    });
    const plan = await this.planVmPlacement({
      required_storage_id,
      required_bridge: params.required_bridge,
      requested_cores: params.requested_cores,
      requested_memory_bytes: params.requested_memory_bytes,
      candidate_node_ids: [target_node_id],
      scoring_mode: params.scoring_mode,
      strict_permissions: params.strict_permissions,
    });
    const migration_privilege_check = await this.access_service.hasCurrentPrivilege({
      path: `/vms/${vm_id}`,
      privilege: "VM.Migrate",
    });
    const target_candidate = plan.data.candidates.find((candidate) =>
      candidate.node_id.toLowerCase() === target_node_id.toLowerCase()
    );
    const preflight_allowed = target_candidate?.allowed === true
      && migration_privilege_check.data.allowed === true;
    const preflight_reason = ResolveMigrationPreflightReason({
      target_candidate,
      migration_privilege_allowed: migration_privilege_check.data.allowed === true,
    });
    const preflight = {
      scoring_mode: plan.data.scoring_mode,
      strict_permissions: plan.data.strict_permissions,
      source_node_id,
      target_node_id,
      allowed: preflight_allowed,
      reason: preflight_reason,
      planner: plan.data,
      target_candidate,
    };

    if (!preflight_allowed) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "VM migration preflight failed.",
        details: {
          field: "target_node_id",
          value: preflight_reason,
        },
      });
    }

    const migration_task = await this.vm_service.migrateVm({
      node_id: source_node_id,
      vm_id,
      target_node_id,
      online: params.online,
      force: params.force,
      wait_for_task: params.wait_for_task,
      timeout_ms: params.timeout_ms,
      retry_allowed: params.retry_allowed,
    });

    return {
      success: true,
      status_code: 200,
      data: {
        resource_type: "qemu",
        node_id: source_node_id,
        target_node_id,
        vm_id,
        preflight,
        migration_task,
      },
    };
  }

  private async planPlacement(
    params: placement_internal_input_t,
  ): Promise<proxmox_lxc_placement_plan_response_t | proxmox_vm_placement_plan_response_t> {
    const scoring_mode = ValidateScoringMode(params.scoring_mode);
    const strict_permissions = params.strict_permissions === true;
    const candidate_node_ids = await this.resolveCandidateNodeIds(params.candidate_node_ids);
    const preferred_node_ids = ValidateOptionalNodeIdList({
      node_ids: params.preferred_node_ids,
      field_name: "preferred_node_ids",
    });
    const preferred_node_set = new Set(preferred_node_ids.map((node_id) => node_id.toLowerCase()));
    const disallowed_node_ids = ValidateOptionalNodeIdList({
      node_ids: params.disallowed_node_ids,
      field_name: "disallowed_node_ids",
    });
    const disallowed_node_set = new Set(disallowed_node_ids.map((node_id) => node_id.toLowerCase()));

    const storage_evaluated_at_iso = new Date().toISOString();
    const storage_compatibility = await this.cluster_service.checkStorageCompatibility({
      node_ids: candidate_node_ids,
      required_content: params.required_content,
      storage_id: params.required_storage_id,
    });
    const bridge_evaluated_at_iso = new Date().toISOString();
    const bridge_compatibility = params.required_bridge === undefined
      ? undefined
      : await this.cluster_service.checkBridgeCompatibility({
        node_ids: candidate_node_ids,
        bridge: params.required_bridge,
      });
    const template_storage_support_map = params.template_storage_id === undefined
      ? undefined
      : await this.resolveTemplateStorageSupport({
        node_ids: candidate_node_ids,
        template_storage_id: params.template_storage_id,
      });
    const permissions = await this.resolvePermissionChecks(params.permission_checks);

    const candidates: proxmox_cluster_placement_candidate_t[] = [];
    for (const node_id of candidate_node_ids) {
      const checks: proxmox_cluster_placement_check_t[] = [];
      const metrics: proxmox_cluster_placement_candidate_t["metrics"] = {};
      let cpu_evaluated_at_iso: string | undefined;
      let memory_evaluated_at_iso: string | undefined;

      const node_is_disallowed = disallowed_node_set.has(node_id.toLowerCase());
      checks.push({
        check: "affinity_disallowed_nodes",
        passed: !node_is_disallowed,
        reason: node_is_disallowed ? "node_disallowed" : "node_allowed",
        source: "input",
        required: true,
      });

      if (preferred_node_ids.length > 0) {
        const node_is_preferred = preferred_node_set.has(node_id.toLowerCase());
        checks.push({
          check: "affinity_preferred_nodes",
          passed: node_is_preferred,
          reason: node_is_preferred ? "node_preferred" : "node_not_preferred",
          source: "input",
          required: scoring_mode === "strict",
        });
      }

      const storage_node = storage_compatibility.data.nodes.find((record) =>
        record.node_id.toLowerCase() === node_id.toLowerCase()
      );
      checks.push({
        check: "storage_compatibility",
        passed: storage_node?.compatible === true,
        reason: storage_node?.reason ?? "storage_result_missing",
        source: "cluster_service",
        required: true,
      });

      if (params.required_bridge !== undefined) {
        const bridge_node = bridge_compatibility?.data.nodes.find((record) =>
          record.node_id.toLowerCase() === node_id.toLowerCase()
        );
        checks.push({
          check: "bridge_compatibility",
          passed: bridge_node?.compatible === true,
          reason: bridge_node?.reason ?? "bridge_result_missing",
          source: "cluster_service",
          required: true,
        });
      }

      if (template_storage_support_map !== undefined) {
        const template_support = template_storage_support_map.get(node_id);
        checks.push({
          check: "template_storage_vztmpl",
          passed: template_support?.supports_vztmpl === true,
          reason: template_support?.reason ?? "template_storage_result_missing",
          source: "cluster_service",
          required: true,
        });
      }

      if (params.requested_cores !== undefined) {
        cpu_evaluated_at_iso = new Date().toISOString();
        const core_preflight = await this.node_service.canAllocateCores({
          node_id,
          requested_cores: params.requested_cores,
          mode: "logical",
        });
        metrics.logical_cpu_count = core_preflight.data.available_cores;
        metrics.available_cores = core_preflight.data.available_cores;
        checks.push({
          check: "capacity_cpu",
          passed: core_preflight.data.allowed,
          reason: core_preflight.data.reason,
          source: "node_service",
          required: scoring_mode === "strict",
        });
      }

      if (params.requested_memory_bytes !== undefined) {
        memory_evaluated_at_iso = new Date().toISOString();
        const memory_preflight = await this.node_service.canAllocateMemory({
          node_id,
          requested_memory_bytes: params.requested_memory_bytes,
          mode: "free_headroom",
        });
        metrics.free_memory_bytes = memory_preflight.data.available_memory_bytes;
        metrics.available_memory_bytes = memory_preflight.data.available_memory_bytes;
        checks.push({
          check: "capacity_memory",
          passed: memory_preflight.data.allowed,
          reason: memory_preflight.data.reason,
          source: "node_service",
          required: scoring_mode === "strict",
        });
      }

      for (const permission of permissions) {
        checks.push({
          check: permission.check_name,
          passed: permission.allowed,
          reason: permission.allowed ? "allowed" : "denied",
          source: "access_service",
          required: strict_permissions || scoring_mode === "strict",
        });
      }

      const score = CalculatePlacementScore({
        checks,
        scoring_mode,
        metrics,
      });
      const failed_required_checks = checks.filter(
        (check_record) => check_record.required && !check_record.passed,
      ).length;
      candidates.push({
        node_id,
        allowed: failed_required_checks === 0,
        score,
        failed_required_checks,
        checks,
        metrics,
        evidence: {
          evaluated_at_iso: new Date().toISOString(),
          cpu_evaluated_at_iso,
          memory_evaluated_at_iso,
          storage_evaluated_at_iso,
          bridge_evaluated_at_iso: bridge_compatibility === undefined
            ? undefined
            : bridge_evaluated_at_iso,
        },
      });
    }

    candidates.sort((left, right) => {
      if (left.allowed !== right.allowed) {
        return left.allowed ? -1 : 1;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.node_id.localeCompare(right.node_id);
    });

    const allowed_node_count = candidates.filter((candidate) => candidate.allowed).length;
    const denied_node_count = candidates.length - allowed_node_count;
    const recommended_node_id = candidates.find((candidate) => candidate.allowed)?.node_id;

    return {
      success: true,
      status_code: 200,
      data: {
        resource_type: params.resource_type,
        scoring_mode,
        strict_permissions,
        required_storage_id: params.required_storage_id,
        required_storage_content: params.required_content,
        template_storage_id: params.template_storage_id,
        required_bridge: params.required_bridge,
        required_pool_id: params.required_pool_id,
        requested_cores: params.requested_cores,
        requested_memory_bytes: params.requested_memory_bytes,
        checked_node_count: candidates.length,
        allowed_node_count,
        denied_node_count,
        recommended_node_id,
        candidates,
      },
    };
  }

  private async resolveCandidateNodeIds(candidate_node_ids: string[] | undefined): Promise<string[]> {
    if (candidate_node_ids !== undefined) {
      return ValidateNodeIds({
        node_ids: candidate_node_ids,
        field_name: "candidate_node_ids",
      });
    }
    const response = await this.cluster_service.listNodes();
    const discovered_node_ids = new Set<string>();
    for (const raw_node of response.data) {
      const node_id = ResolveNodeId(raw_node);
      if (node_id !== undefined) {
        discovered_node_ids.add(node_id);
      }
    }
    if (discovered_node_ids.size === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.missing_input",
        message: "No cluster nodes were discovered for placement planning.",
        details: {
          field: "candidate_node_ids",
        },
      });
    }
    return Array.from(discovered_node_ids);
  }

  private async resolveTemplateStorageSupport(params: {
    node_ids: string[];
    template_storage_id: string;
  }): Promise<Map<string, template_storage_support_result_t>> {
    const support_map = new Map<string, template_storage_support_result_t>();
    for (const node_id of params.node_ids) {
      const storage_records = await this.listStorageRecordsForNode({
        node_id,
      });
      const matching_record = storage_records.find((record) =>
        ResolveStorageRecordId(record)?.toLowerCase() === params.template_storage_id.toLowerCase()
      );
      if (matching_record === undefined) {
        support_map.set(node_id, {
          node_id,
          supports_vztmpl: false,
          reason: "template_storage_not_found",
        });
        continue;
      }
      const content = NormalizeStorageContent(matching_record.content);
      const supports_vztmpl = content.has("vztmpl");
      support_map.set(node_id, {
        node_id,
        supports_vztmpl,
        reason: supports_vztmpl
          ? "template_storage_supports_vztmpl"
          : "template_storage_missing_vztmpl",
      });
    }
    return support_map;
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

  private async resolvePermissionChecks(params: placement_permission_check_t[]): Promise<Array<{
    check_name: string;
    allowed: boolean;
  }>> {
    const results: Array<{
      check_name: string;
      allowed: boolean;
    }> = [];
    for (const permission of params) {
      const permission_result = await this.access_service.hasCurrentPrivilege({
        path: permission.path,
        privilege: permission.privilege,
      });
      results.push({
        check_name: permission.check_name,
        allowed: permission_result.data.allowed === true,
      });
    }
    return results;
  }
}

function BuildLxcPlacementPermissionChecks(params: {
  required_storage_id: string;
  template_storage_id?: string;
  required_pool_id?: string;
}): placement_permission_check_t[] {
  const checks: placement_permission_check_t[] = [
    {
      path: "/vms",
      privilege: "VM.Allocate",
      check_name: "permission_vm_allocate",
    },
    {
      path: `/storage/${params.required_storage_id}`,
      privilege: "Datastore.AllocateSpace",
      check_name: "permission_storage_allocate_space",
    },
  ];
  if (params.template_storage_id !== undefined) {
    checks.push({
      path: `/storage/${params.template_storage_id}`,
      privilege: "Datastore.AllocateTemplate",
      check_name: "permission_template_allocate",
    });
  }
  if (params.required_pool_id !== undefined) {
    checks.push({
      path: `/pool/${params.required_pool_id}`,
      privilege: "Pool.Allocate",
      check_name: "permission_pool_allocate",
    });
  }
  return checks;
}

function BuildVmPlacementPermissionChecks(params: {
  required_storage_id: string;
  required_pool_id?: string;
}): placement_permission_check_t[] {
  const checks: placement_permission_check_t[] = [
    {
      path: "/vms",
      privilege: "VM.Allocate",
      check_name: "permission_vm_allocate",
    },
    {
      path: `/storage/${params.required_storage_id}`,
      privilege: "Datastore.AllocateSpace",
      check_name: "permission_storage_allocate_space",
    },
  ];
  if (params.required_pool_id !== undefined) {
    checks.push({
      path: `/pool/${params.required_pool_id}`,
      privilege: "Pool.Allocate",
      check_name: "permission_pool_allocate",
    });
  }
  return checks;
}

function CalculatePlacementScore(params: {
  checks: proxmox_cluster_placement_check_t[];
  scoring_mode: proxmox_cluster_placement_scoring_mode_t;
  metrics: proxmox_cluster_placement_candidate_t["metrics"];
}): number {
  let score = 0;
  for (const check_record of params.checks) {
    if (check_record.passed) {
      score += check_record.required ? 15 : 5;
    } else {
      score -= check_record.required ? 20 : 5;
    }
  }

  if (params.metrics.available_cores !== undefined) {
    score += params.scoring_mode === "capacity_first"
      ? Math.min(params.metrics.available_cores, 100)
      : Math.min(params.metrics.available_cores, 40);
  }
  if (params.metrics.available_memory_bytes !== undefined) {
    const memory_gib = Math.floor(params.metrics.available_memory_bytes / (1024 * 1024 * 1024));
    score += params.scoring_mode === "capacity_first"
      ? Math.min(memory_gib, 100)
      : Math.min(memory_gib, 40);
  }

  if (params.scoring_mode === "strict") {
    const failed_required = params.checks.filter(
      (check_record) => check_record.required && !check_record.passed,
    ).length;
    if (failed_required > 0) {
      score -= failed_required * 30;
    }
  }
  return score;
}

function ResolveMigrationPreflightReason(params: {
  target_candidate: proxmox_cluster_placement_candidate_t | undefined;
  migration_privilege_allowed: boolean;
}): string {
  if (params.target_candidate === undefined) {
    return "target_not_evaluated";
  }
  if (!params.target_candidate.allowed) {
    return "target_preflight_denied";
  }
  if (!params.migration_privilege_allowed) {
    return "permission_vm_migrate_denied";
  }
  return "within_limit";
}

function ValidateScoringMode(
  scoring_mode: proxmox_cluster_placement_scoring_mode_t | undefined,
): proxmox_cluster_placement_scoring_mode_t {
  if (scoring_mode === undefined) {
    return DEFAULT_SCORING_MODE;
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

function ValidateResourceId(params: {
  value: string | number;
  field_name: string;
}): string {
  if (typeof params.value === "number") {
    if (!Number.isInteger(params.value) || params.value <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} must be a positive integer.`,
        details: {
          field: params.field_name,
        },
      });
    }
    return String(params.value);
  }
  const normalized_value = params.value.trim();
  if (!/^[1-9][0-9]*$/.test(normalized_value)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a positive integer.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized_value;
}

function ValidateStorageId(params: {
  value: string;
  field_name: string;
}): string {
  const normalized_value = params.value.trim();
  if (!normalized_value) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} is required and cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized_value;
}

function ValidatePoolId(pool_id: string): string {
  const normalized_pool_id = pool_id.trim();
  if (!normalized_pool_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "required_pool_id cannot be empty.",
      details: {
        field: "required_pool_id",
      },
    });
  }
  return normalized_pool_id;
}

function ValidateOptionalBridge(raw_bridge: string | undefined): string | undefined {
  if (raw_bridge === undefined) {
    return undefined;
  }
  const bridge = raw_bridge.trim();
  if (!bridge) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "required_bridge cannot be empty.",
      details: {
        field: "required_bridge",
      },
    });
  }
  return bridge;
}

function ValidateOptionalRequestedCores(raw_requested_cores: number | undefined): number | undefined {
  if (raw_requested_cores === undefined) {
    return undefined;
  }
  if (!Number.isInteger(raw_requested_cores) || raw_requested_cores <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "requested_cores must be a positive integer when provided.",
      details: {
        field: "requested_cores",
      },
    });
  }
  return raw_requested_cores;
}

function ValidateOptionalRequestedMemoryBytes(
  raw_requested_memory_bytes: number | undefined,
): number | undefined {
  if (raw_requested_memory_bytes === undefined) {
    return undefined;
  }
  if (!Number.isInteger(raw_requested_memory_bytes) || raw_requested_memory_bytes <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "requested_memory_bytes must be a positive integer when provided.",
      details: {
        field: "requested_memory_bytes",
      },
    });
  }
  return raw_requested_memory_bytes;
}

function ValidateOptionalNodeIdList(params: {
  node_ids: string[] | undefined;
  field_name: string;
}): string[] {
  if (params.node_ids === undefined) {
    return [];
  }
  return ValidateNodeIds({
    node_ids: params.node_ids,
    field_name: params.field_name,
  });
}

function ValidateNodeIds(params: {
  node_ids: string[];
  field_name: string;
}): string[] {
  if (!Array.isArray(params.node_ids) || params.node_ids.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must include at least one node id.`,
      details: {
        field: params.field_name,
      },
    });
  }
  const dedupe_set = new Set<string>();
  const normalized_node_ids: string[] = [];
  for (const raw_node_id of params.node_ids) {
    const node_id = ValidateNodeId({
      value: raw_node_id,
      field_name: params.field_name,
    });
    const dedupe_key = node_id.toLowerCase();
    if (dedupe_set.has(dedupe_key)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} must not include duplicates.`,
        details: {
          field: params.field_name,
        },
      });
    }
    dedupe_set.add(dedupe_key);
    normalized_node_ids.push(node_id);
  }
  return normalized_node_ids;
}

function ValidateNodeId(params: {
  value: string;
  field_name: string;
}): string {
  const node_id = params.value.trim();
  if (!node_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} is required and cannot be empty.`,
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

function ResolveNodeId(raw_node: unknown): string | undefined {
  if (!IsRecord(raw_node)) {
    return undefined;
  }
  const candidates = [raw_node.node, raw_node.name, raw_node.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function ResolveStorageRecordId(record: proxmox_datacenter_storage_record_i): string | undefined {
  const candidates = [record.storage];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function NormalizeStorageContent(
  raw_content: unknown,
): Set<string> {
  const content = new Set<string>();
  if (Array.isArray(raw_content)) {
    for (const item of raw_content) {
      if (typeof item === "string" && item.trim().length > 0) {
        content.add(item.trim().toLowerCase());
      }
    }
    return content;
  }
  if (typeof raw_content === "string") {
    for (const token of raw_content.split(",")) {
      const normalized_token = token.trim().toLowerCase();
      if (normalized_token.length > 0) {
        content.add(normalized_token);
      }
    }
  }
  return content;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ShouldFallbackStorageNodeQuery(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (!("status_code" in error)) {
    return false;
  }
  const status_code = (error as { status_code?: number }).status_code;
  return status_code === 400 || status_code === 501;
}
