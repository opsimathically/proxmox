import {
  ProxmoxHttpError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import {
  proxmox_cluster_bridge_compatibility_response_t,
  proxmox_cluster_nodes_response_t,
  proxmox_cluster_storage_compatibility_response_t,
  proxmox_datacenter_storage_record_i,
  proxmox_lxc_cluster_preflight_check_t,
  proxmox_lxc_cluster_preflight_input_i,
  proxmox_lxc_cluster_preflight_permission_t,
  proxmox_lxc_cluster_preflight_response_t,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_preflight_check_t,
  proxmox_lxc_helper_preflight_result_t,
  proxmox_node_record_i,
} from "../types/proxmox_service_types";

interface cluster_service_preflight_i {
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

interface datacenter_service_preflight_i {
  listStorage(params?: {
    node?: string;
  }): Promise<{
    data: proxmox_datacenter_storage_record_i[];
  }>;
}

interface access_service_preflight_i {
  hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }): Promise<{
    data: {
      allowed: boolean;
    };
  }>;
}

interface lxc_helper_preflight_i {
  createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t>;
}

export interface lxc_cluster_preflight_helper_input_i {
  cluster_service: cluster_service_preflight_i;
  datacenter_service: datacenter_service_preflight_i;
  access_service: access_service_preflight_i;
  lxc_helper: lxc_helper_preflight_i;
}

type template_storage_support_result_t = {
  node_id: string;
  supports_vztmpl: boolean;
  reason: string;
};

export class LxcClusterPreflightHelper {
  public readonly cluster_service: cluster_service_preflight_i;
  public readonly datacenter_service: datacenter_service_preflight_i;
  public readonly access_service: access_service_preflight_i;
  public readonly lxc_helper: lxc_helper_preflight_i;

  constructor(params: lxc_cluster_preflight_helper_input_i) {
    this.cluster_service = params.cluster_service;
    this.datacenter_service = params.datacenter_service;
    this.access_service = params.access_service;
    this.lxc_helper = params.lxc_helper;
  }

  public async preflightLxcCreateCluster(
    params: proxmox_lxc_cluster_preflight_input_i,
  ): Promise<proxmox_lxc_cluster_preflight_response_t> {
    const strict_permissions = params.strict_permissions === true;
    const candidate_node_ids = await this.resolveCandidateNodeIds(
      params.candidate_node_ids,
    );
    const disk_storage = ValidateStorageId({
      value: params.create_input.disks.storage,
      field_name: "create_input.disks.storage",
    });
    const template_storage = ValidateStorageId({
      value: params.create_input.template.storage,
      field_name: "create_input.template.storage",
    });
    const bridge = params.create_input.network?.bridge?.trim();

    const [disk_storage_compatibility, bridge_compatibility, template_support_map] =
      await Promise.all([
        this.cluster_service.checkStorageCompatibility({
          node_ids: candidate_node_ids,
          required_content: "rootdir",
          storage_id: disk_storage,
        }),
        bridge === undefined || bridge.length === 0
          ? Promise.resolve(undefined)
          : this.cluster_service.checkBridgeCompatibility({
            node_ids: candidate_node_ids,
            bridge,
          }),
        this.resolveTemplateStorageSupport({
          node_ids: candidate_node_ids,
          template_storage,
        }),
      ]);

    const permission_checks = await this.resolvePermissionChecks({
      disk_storage,
      template_storage,
    });

    const candidate_records = [];
    for (const candidate_node_id of candidate_node_ids) {
      const helper_preflight = await this.runNodeHelperPreflight({
        create_input: params.create_input,
        node_id: candidate_node_id,
      });
      const checks = BuildCandidateChecks({
        node_id: candidate_node_id,
        helper_preflight,
        disk_storage_compatibility,
        bridge_compatibility,
        bridge,
        template_support_map,
        strict_permissions,
        permission_checks,
      });
      const scoring = CalculateCandidateScore({
        checks,
      });

      candidate_records.push({
        node_id: candidate_node_id,
        allowed: scoring.allowed,
        score: scoring.score,
        failed_required_checks: scoring.failed_required_checks,
        checks,
        permissions: permission_checks,
        helper_preflight,
      });
    }

    candidate_records.sort((left, right) => {
      if (left.allowed !== right.allowed) {
        return left.allowed ? -1 : 1;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.node_id.localeCompare(right.node_id);
    });

    const allowed_node_count = candidate_records.filter(
      (record) => record.allowed,
    ).length;
    const denied_node_count = candidate_records.length - allowed_node_count;
    const recommended_node_id = candidate_records.find(
      (record) => record.allowed,
    )?.node_id;

    return {
      success: true,
      status_code: 200,
      data: {
        strict_permissions,
        checked_node_count: candidate_records.length,
        allowed_node_count,
        denied_node_count,
        recommended_node_id,
        candidates: candidate_records,
      },
    };
  }

  private async resolveCandidateNodeIds(
    provided_candidate_node_ids: string[] | undefined,
  ): Promise<string[]> {
    if (provided_candidate_node_ids !== undefined) {
      return ValidateNodeIds(provided_candidate_node_ids);
    }

    const cluster_nodes_response = await this.cluster_service.listNodes();
    const discovered_node_ids = new Set<string>();
    for (const raw_node of cluster_nodes_response.data) {
      const node_id = ResolveNodeId(raw_node);
      if (node_id !== undefined) {
        discovered_node_ids.add(node_id);
      }
    }
    if (discovered_node_ids.size === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.missing_input",
        message: "No candidate cluster nodes were discovered for preflight.",
        details: {
          field: "candidate_node_ids",
        },
      });
    }
    return Array.from(discovered_node_ids);
  }

  private async resolveTemplateStorageSupport(params: {
    node_ids: string[];
    template_storage: string;
  }): Promise<Map<string, template_storage_support_result_t>> {
    const support_map = new Map<string, template_storage_support_result_t>();
    for (const node_id of params.node_ids) {
      const storage_records = await this.listStorageRecordsForNode({
        node_id,
      });
      const matching_record = storage_records.find((record) => {
        const storage_id = ResolveStorageRecordId(record);
        return (
          storage_id !== undefined
          && storage_id.toLowerCase() === params.template_storage.toLowerCase()
        );
      });
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

  private async resolvePermissionChecks(params: {
    disk_storage: string;
    template_storage: string;
  }): Promise<proxmox_lxc_cluster_preflight_permission_t[]> {
    const checks: Array<{ path: string; privilege: string }> = [
      {
        path: "/vms",
        privilege: "VM.Allocate",
      },
      {
        path: `/storage/${params.disk_storage}`,
        privilege: "Datastore.AllocateSpace",
      },
      {
        path: `/storage/${params.template_storage}`,
        privilege: "Datastore.AllocateTemplate",
      },
    ];

    const results: proxmox_lxc_cluster_preflight_permission_t[] = [];
    for (const check of checks) {
      const response = await this.access_service.hasCurrentPrivilege({
        path: check.path,
        privilege: check.privilege,
      });
      results.push({
        path: check.path,
        privilege: check.privilege,
        allowed: response.data.allowed === true,
      });
    }
    return results;
  }

  private async runNodeHelperPreflight(params: {
    create_input: proxmox_lxc_helper_create_input_i;
    node_id: string;
  }): Promise<proxmox_lxc_helper_preflight_result_t> {
    const requested_cores = params.create_input.cpu?.cores;
    const requested_memory_mib = params.create_input.memory?.memory_mib;
    const configured_preflight = params.create_input.preflight;
    const response = await this.lxc_helper.createLxcContainer({
      ...params.create_input,
      general: {
        ...params.create_input.general,
        node_id: params.node_id,
      },
      preflight: {
        enabled: true,
        enforce: false,
        check_node_exists: false,
        check_storage_rootdir: true,
        check_template_exists: true,
        check_bridge_exists: params.create_input.network !== undefined,
        check_container_id_available: true,
        check_cpu:
          configured_preflight?.check_cpu
          ?? (requested_cores !== undefined && requested_cores > 0),
        check_memory:
          configured_preflight?.check_memory
          ?? (requested_memory_mib !== undefined && requested_memory_mib > 0),
        cpu_mode: configured_preflight?.cpu_mode,
        memory_mode: configured_preflight?.memory_mode,
      },
      dry_run: true,
      start_after_created: false,
      wait_for_task: false,
    });
    return response.data.preflight;
  }
}

function BuildCandidateChecks(params: {
  node_id: string;
  helper_preflight: proxmox_lxc_helper_preflight_result_t;
  disk_storage_compatibility: proxmox_cluster_storage_compatibility_response_t;
  bridge_compatibility?: proxmox_cluster_bridge_compatibility_response_t;
  bridge?: string;
  template_support_map: Map<string, template_storage_support_result_t>;
  strict_permissions: boolean;
  permission_checks: proxmox_lxc_cluster_preflight_permission_t[];
}): proxmox_lxc_cluster_preflight_check_t[] {
  const checks: proxmox_lxc_cluster_preflight_check_t[] = [];
  const storage_node = params.disk_storage_compatibility.data.nodes.find(
    (node) => node.node_id === params.node_id,
  );
  checks.push({
    check: "disk_storage_rootdir_compatibility",
    passed: storage_node?.compatible === true,
    reason: storage_node?.reason ?? "storage_compatibility_missing",
    source: "cluster_service",
    required: true,
  });

  const template_support = params.template_support_map.get(params.node_id);
  checks.push({
    check: "template_storage_vztmpl_compatibility",
    passed: template_support?.supports_vztmpl === true,
    reason: template_support?.reason ?? "template_storage_check_missing",
    source: "cluster_service",
    required: true,
  });

  if (params.bridge !== undefined && params.bridge.length > 0) {
    const bridge_node = params.bridge_compatibility?.data.nodes.find(
      (node) => node.node_id === params.node_id,
    );
    checks.push({
      check: "bridge_compatibility",
      passed: bridge_node?.compatible === true,
      reason: bridge_node?.reason ?? "bridge_compatibility_missing",
      source: "cluster_service",
      required: true,
    });
  }

  for (const helper_check of params.helper_preflight.checks) {
    checks.push({
      check: helper_check.check,
      passed: helper_check.passed,
      reason: helper_check.reason,
      source: "helper_preflight",
      required: true,
    });
  }

  for (const permission_check of params.permission_checks) {
    checks.push({
      check: `permission_${permission_check.privilege}`,
      passed: permission_check.allowed,
      reason: permission_check.allowed ? "permission_granted" : "permission_denied",
      source: "access_service",
      required: params.strict_permissions,
    });
  }
  return checks;
}

function CalculateCandidateScore(params: {
  checks: proxmox_lxc_cluster_preflight_check_t[];
}): {
  score: number;
  failed_required_checks: number;
  allowed: boolean;
} {
  let score = 0;
  let failed_required_checks = 0;
  for (const check of params.checks) {
    if (check.passed) {
      score += 2;
      continue;
    }
    if (check.required) {
      failed_required_checks += 1;
      score -= 3;
      continue;
    }
    score -= 1;
  }
  return {
    score,
    failed_required_checks,
    allowed: failed_required_checks === 0,
  };
}

function ValidateNodeIds(raw_node_ids: string[]): string[] {
  if (!Array.isArray(raw_node_ids) || raw_node_ids.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "candidate_node_ids must include at least one node id.",
      details: {
        field: "candidate_node_ids",
      },
    });
  }
  const dedupe_set = new Set<string>();
  const normalized_node_ids: string[] = [];
  for (const raw_node_id of raw_node_ids) {
    const normalized_node_id = raw_node_id.trim();
    if (!normalized_node_id) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "candidate_node_ids cannot contain empty values.",
        details: {
          field: "candidate_node_ids",
        },
      });
    }
    const dedupe_key = normalized_node_id.toLowerCase();
    if (dedupe_set.has(dedupe_key)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "candidate_node_ids must be unique.",
        details: {
          field: "candidate_node_ids",
        },
      });
    }
    dedupe_set.add(dedupe_key);
    normalized_node_ids.push(normalized_node_id);
  }
  return normalized_node_ids;
}

function ResolveNodeId(raw_node: proxmox_node_record_i): string | undefined {
  const candidates = [raw_node.node, raw_node.name, raw_node.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function ValidateStorageId(params: {
  value: string;
  field_name: string;
}): string {
  const normalized_storage_id = params.value.trim();
  if (!normalized_storage_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must not be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized_storage_id;
}

function ResolveStorageRecordId(
  storage_record: proxmox_datacenter_storage_record_i,
): string | undefined {
  const candidates = [storage_record.storage];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function NormalizeStorageContent(raw_content: unknown): Set<string> {
  const content_set = new Set<string>();
  if (Array.isArray(raw_content)) {
    for (const item of raw_content) {
      if (typeof item === "string" && item.trim().length > 0) {
        content_set.add(item.trim().toLowerCase());
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

function ShouldFallbackStorageNodeQuery(error: unknown): boolean {
  if (!(error instanceof ProxmoxHttpError)) {
    return false;
  }
  return error.status_code === 400 || error.status_code === 501;
}
