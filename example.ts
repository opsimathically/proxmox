import {
  EmitStartupDiagnostics,
  LoadConfig,
  ProxmoxAuthError,
  ProxmoxClient,
  ProxmoxError,
  ProxmoxHttpError,
  ProxmoxRateLimitError,
  ProxmoxTimeoutError,
  ProxmoxValidationError,
  ResolveProfile
} from './src/index';
import type {
  proxmox_lxc_record_i,
  proxmox_node_record_i,
  proxmox_vm_record_i
} from './src/index';

function BuildSafeDiagnosticsPayload(
  raw_payload: unknown
): Record<string, unknown> | undefined {
  if (
    raw_payload === undefined ||
    raw_payload === null ||
    typeof raw_payload !== 'object' ||
    Array.isArray(raw_payload)
  ) {
    return undefined;
  }

  const payload = raw_payload as Record<string, unknown>;
  return {
    event: payload.event,
    config_path: payload.config_path,
    active_profile: payload.active_profile,
    selected_profile: payload.selected_profile,
    selected_cluster: payload.selected_cluster,
    profile_count: payload.profile_count,
    cluster_count: payload.cluster_count,
    node_count: payload.node_count
  };
}

function ResolvePreferredNodeId(params: {
  provided_node_id?: string;
  node_records: proxmox_node_record_i[];
}): string {
  if (params.provided_node_id && params.provided_node_id.trim().length > 0) {
    return params.provided_node_id.trim();
  }

  for (const node_record of params.node_records) {
    if (
      typeof node_record.node === 'string' &&
      node_record.node.trim().length > 0
    ) {
      return node_record.node.trim();
    }
    if (
      typeof node_record.name === 'string' &&
      node_record.name.trim().length > 0
    ) {
      return node_record.name.trim();
    }
    if (
      typeof node_record.id === 'string' &&
      node_record.id.trim().length > 0
    ) {
      return node_record.id.trim();
    }
  }

  throw new Error(
    'Could not resolve a usable node_id from listNodes response.'
  );
}

function NormalizeBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function ResolveVmId(raw_vm_id: string | undefined): number {
  const default_vm_id = 9000;
  if (raw_vm_id === undefined || raw_vm_id.trim().length === 0) {
    return default_vm_id;
  }

  const parsed_vm_id = Number.parseInt(raw_vm_id.trim(), 10);
  if (!Number.isInteger(parsed_vm_id) || parsed_vm_id <= 0) {
    throw new Error('PROXMOX_EXAMPLE_VM_ID must be a positive integer.');
  }

  return parsed_vm_id;
}

function LogTaskMetadata(params: {
  label: string;
  task_id: string;
  status?: string;
  exit_status?: string;
  percent?: number;
  message?: string;
}): void {
  console.info(`[example] ${params.label}: task_id=${params.task_id}`);
  if (params.status !== undefined) {
    console.info(`[example] ${params.label}: status=${params.status}`);
  }
  if (params.exit_status !== undefined) {
    console.info(
      `[example] ${params.label}: exit_status=${params.exit_status}`
    );
  }
  if (params.percent !== undefined) {
    console.info(`[example] ${params.label}: percent=${params.percent}`);
  }
  if (params.message !== undefined && params.message.trim().length > 0) {
    console.info(`[example] ${params.label}: message=${params.message}`);
  }
}

function IsTaskFailed(params: {
  status?: string;
  exit_status?: string;
}): boolean {
  const normalized_status = params.status?.toLowerCase();
  if (normalized_status === 'error') {
    return true;
  }
  return params.exit_status === 'ERROR';
}

function RenderUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function LogErrorCauseChain(error: unknown): void {
  let current_error = error;
  let depth = 1;
  const max_depth = 6;

  while (
    depth <= max_depth &&
    current_error instanceof Error &&
    'cause' in current_error &&
    current_error.cause !== undefined
  ) {
    const cause = current_error.cause;
    console.error(`[example] cause_${depth}=${RenderUnknown(cause)}`);
    current_error = cause;
    depth += 1;
  }
}

function ResolveResourceId(record: {
  vmid?: string | number;
  id?: string;
}): string {
  if (typeof record.vmid === 'number' && Number.isFinite(record.vmid)) {
    return String(record.vmid);
  }
  if (typeof record.vmid === 'string' && record.vmid.trim().length > 0) {
    return record.vmid.trim();
  }
  if (typeof record.id === 'string' && record.id.trim().length > 0) {
    return record.id.trim();
  }
  return 'unknown';
}

function ResolveResourceName(record: { name?: string }): string {
  if (typeof record.name === 'string' && record.name.trim().length > 0) {
    return record.name.trim();
  }
  return 'unknown';
}

function ResolveResourceStatus(record: { status?: string }): string {
  if (typeof record.status === 'string' && record.status.trim().length > 0) {
    return record.status.trim();
  }
  return 'unknown';
}

function ResolveResourceNode(record: { node?: string }): string {
  if (typeof record.node === 'string' && record.node.trim().length > 0) {
    return record.node.trim();
  }
  return 'unknown';
}

function ResolvePreflightVmPath(params: {
  vm_records: proxmox_vm_record_i[];
  raw_vm_id: string | undefined;
}): { path: string; source: string } {
  if (params.vm_records.length > 0) {
    const selected_vm_id = ResolveResourceId(params.vm_records[0]);
    if (selected_vm_id !== 'unknown') {
      return {
        path: `/vms/${selected_vm_id}`,
        source: 'inventory_first_vm'
      };
    }
  }

  if (
    typeof params.raw_vm_id === 'string' &&
    params.raw_vm_id.trim().length > 0
  ) {
    const candidate_vm_id = Number.parseInt(params.raw_vm_id.trim(), 10);
    if (Number.isInteger(candidate_vm_id) && candidate_vm_id > 0) {
      return {
        path: `/vms/${candidate_vm_id}`,
        source: 'env_vm_id'
      };
    }
  }

  return {
    path: '/vms/9000',
    source: 'placeholder_vm_id'
  };
}

function LogPermissionSnapshot(params: {
  identity_label: string;
  path: string;
  auth_id?: string;
  privileges: Record<string, boolean>;
}): void {
  const privilege_names = Object.keys(params.privileges);
  const enabled_count = privilege_names.filter(
    (privilege_name) => params.privileges[privilege_name] === true
  ).length;
  const auth_id_suffix =
    params.auth_id === undefined ? '' : ` auth_id=${params.auth_id}`;
  console.info(
    `[example] permissions_${params.identity_label} path=${params.path}${auth_id_suffix} privileges=${privilege_names.length} allowed=${enabled_count}`
  );
}

function LogPrivilegeCheck(params: {
  identity_label: string;
  path: string;
  privilege: string;
  allowed: boolean;
  auth_id?: string;
}): void {
  const auth_id_suffix =
    params.auth_id === undefined ? '' : ` auth_id=${params.auth_id}`;
  console.info(
    `[example] privilege_${params.identity_label} path=${params.path}${auth_id_suffix} privilege=${params.privilege} allowed=${params.allowed}`
  );
}

async function Main(): Promise<void> {
  const resolved_config_path =
    '/home/tourist/environment_files/proxmoxlib/proxmoxlib.json';
  const selected_profile_name =
    process.env.PROXMOXLIB_PROFILE?.trim() || undefined;
  console.info(`[example] config_path=${resolved_config_path}`);
  if (selected_profile_name !== undefined) {
    console.info(`[example] requested_profile=${selected_profile_name}`);
  }

  const config = LoadConfig({ config_path: resolved_config_path });
  const selected_profile = ResolveProfile({
    config,
    profile_name: selected_profile_name
  });

  // Diagnostics logger intentionally keeps metadata-only fields.
  EmitStartupDiagnostics({
    config,
    profile_name: selected_profile.name,
    config_path: resolved_config_path,
    logger: {
      info: (message: string, payload?: Record<string, unknown>) => {
        const safe_payload = BuildSafeDiagnosticsPayload(payload);
        console.info(`[example] ${message}`, safe_payload ?? {});
      }
    }
  });

  const proxmox_client = ProxmoxClient.fromPath({
    config_path: '/home/tourist/environment_files/proxmoxlib/proxmoxlib.json',
    profile_name: selected_profile.name
  });

  const nodes_response = await proxmox_client.node_service.listNodes();
  const node_records = nodes_response.data;
  console.info(`[example] nodes_found=${node_records.length}`);
  for (const node_record of node_records) {
    const node_label =
      typeof node_record.node === 'string'
        ? node_record.node
        : typeof node_record.name === 'string'
          ? node_record.name
          : typeof node_record.id === 'string'
            ? node_record.id
            : 'unknown';
    const node_status =
      typeof node_record.status === 'string' ? node_record.status : 'unknown';
    console.info(`[example] node=${node_label} status=${node_status}`);
  }

  const node_id = ResolvePreferredNodeId({
    provided_node_id: process.env.PROXMOX_EXAMPLE_NODE_ID,
    node_records
  });
  console.info(`[example] selected_node=${node_id}`);

  const vm_inventory = await proxmox_client.vm_service.listVms({
    node_id
  });
  const vm_records = vm_inventory.data as proxmox_vm_record_i[];
  console.info(`[example] vm_count=${vm_records.length}`);
  for (const vm_record of vm_records) {
    console.info(
      `[example] vm id=${ResolveResourceId(vm_record)} name=${ResolveResourceName(vm_record)} status=${ResolveResourceStatus(vm_record)} node=${ResolveResourceNode(vm_record)}`
    );
  }

  const lxc_inventory = await proxmox_client.lxc_service.listContainers({
    node_id
  });
  const lxc_records = lxc_inventory.data as proxmox_lxc_record_i[];
  console.info(`[example] lxc_count=${lxc_records.length}`);
  for (const lxc_record of lxc_records) {
    console.info(
      `[example] lxc id=${ResolveResourceId(lxc_record)} name=${ResolveResourceName(lxc_record)} status=${ResolveResourceStatus(lxc_record)} node=${ResolveResourceNode(lxc_record)}`
    );
  }

  const preflight_vm_path = ResolvePreflightVmPath({
    vm_records,
    raw_vm_id: process.env.PROXMOX_EXAMPLE_VM_ID
  });
  if (preflight_vm_path.source === 'placeholder_vm_id') {
    console.info(
      '[example] privilege_preflight_vm_path_source=placeholder_vm_id (no VM found and PROXMOX_EXAMPLE_VM_ID unset/invalid)'
    );
  }
  console.info(
    `[example] privilege_preflight_vm_path=${preflight_vm_path.path} source=${preflight_vm_path.source}`
  );

  const current_root_permissions =
    await proxmox_client.access_service.getCurrentPermissions({
      path: '/'
    });
  LogPermissionSnapshot({
    identity_label: 'current',
    path: '/',
    privileges: current_root_permissions.data.privileges
  });

  const current_vm_collection_permissions =
    await proxmox_client.access_service.getCurrentPermissions({
      path: '/vms'
    });
  LogPermissionSnapshot({
    identity_label: 'current',
    path: '/vms',
    privileges: current_vm_collection_permissions.data.privileges
  });

  const current_vm_permissions =
    await proxmox_client.access_service.getCurrentPermissions({
      path: preflight_vm_path.path
    });
  LogPermissionSnapshot({
    identity_label: 'current',
    path: preflight_vm_path.path,
    privileges: current_vm_permissions.data.privileges
  });

  const current_sys_audit_check =
    await proxmox_client.access_service.hasCurrentPrivilege({
      path: '/',
      privilege: 'Sys.Audit'
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: '/',
    privilege: 'Sys.Audit',
    allowed: current_sys_audit_check.data.allowed
  });

  const current_vm_audit_check =
    await proxmox_client.access_service.hasCurrentPrivilege({
      path: '/vms',
      privilege: 'VM.Audit'
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: '/vms',
    privilege: 'VM.Audit',
    allowed: current_vm_audit_check.data.allowed
  });

  const current_vm_power_check =
    await proxmox_client.access_service.hasCurrentPrivilege({
      path: preflight_vm_path.path,
      privilege: 'VM.PowerMgmt'
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: preflight_vm_path.path,
    privilege: 'VM.PowerMgmt',
    allowed: current_vm_power_check.data.allowed
  });

  const permission_target_auth_id =
    process.env.PROXMOX_EXAMPLE_PERMISSION_TARGET_AUTH_ID?.trim() || undefined;
  if (permission_target_auth_id === undefined) {
    console.info(
      '[example] privilege_target_skipped reason=PROXMOX_EXAMPLE_PERMISSION_TARGET_AUTH_ID_not_set'
    );
  } else {
    console.info(
      `[example] privilege_target_auth_id=${permission_target_auth_id}`
    );
    try {
      const target_root_permissions =
        await proxmox_client.access_service.getIdentityPermissions({
          path: '/',
          auth_id: permission_target_auth_id
        });
      LogPermissionSnapshot({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: '/',
        privileges: target_root_permissions.data.privileges
      });

      const target_vm_permissions =
        await proxmox_client.access_service.getIdentityPermissions({
          path: '/vms',
          auth_id: permission_target_auth_id
        });
      LogPermissionSnapshot({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: '/vms',
        privileges: target_vm_permissions.data.privileges
      });

      const target_vm_audit_check =
        await proxmox_client.access_service.hasIdentityPrivilege({
          path: '/vms',
          auth_id: permission_target_auth_id,
          privilege: 'VM.Audit'
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: '/vms',
        privilege: 'VM.Audit',
        allowed: target_vm_audit_check.data.allowed
      });

      const target_vm_power_check =
        await proxmox_client.access_service.hasIdentityPrivilege({
          path: preflight_vm_path.path,
          auth_id: permission_target_auth_id,
          privilege: 'VM.PowerMgmt'
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: preflight_vm_path.path,
        privilege: 'VM.PowerMgmt',
        allowed: target_vm_power_check.data.allowed
      });
    } catch (error) {
      if (error instanceof ProxmoxAuthError) {
        const status_code_suffix =
          typeof error.status_code === 'number'
            ? ` status_code=${error.status_code}`
            : '';
        console.info(
          `[example] privilege_target_unauthorized auth_id=${permission_target_auth_id} code=${error.code}${status_code_suffix}`
        );
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
  }

  // Mutating operations are disabled by default to avoid accidental provisioning.
  const execute_mutations = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_EXECUTE_MUTATIONS
  );
  if (!execute_mutations) {
    console.info(
      '[example] VM create/start flow skipped. Set PROXMOX_EXAMPLE_EXECUTE_MUTATIONS=true to run it.'
    );
    return;
  }

  const vm_id = ResolveVmId(process.env.PROXMOX_EXAMPLE_VM_ID);
  const vm_name =
    process.env.PROXMOX_EXAMPLE_VM_NAME?.trim() || `sdk-example-${vm_id}`;

  const create_result = await proxmox_client.vm_service.createVm({
    node_id,
    vm_id,
    config: {
      name: vm_name,
      memory: 2048,
      cores: 2
    },
    retry_allowed: false
  });
  LogTaskMetadata({
    label: 'create_vm_submitted',
    task_id: create_result.task_id
  });

  const create_completion = await proxmox_client.vm_service.waitForTask({
    operation: 'create',
    node_id,
    task_id: create_result.task_id,
    timeout_ms: 10 * 60 * 1000
  });
  LogTaskMetadata({
    label: 'create_vm_completed',
    task_id: create_completion.task_id,
    status: create_completion.status,
    exit_status: create_completion.exit_status,
    percent: create_completion.percent,
    message: create_completion.message
  });
  if (
    IsTaskFailed({
      status: create_completion.status,
      exit_status: create_completion.exit_status
    })
  ) {
    throw new Error('VM create task completed with failure status.');
  }

  const start_result = await proxmox_client.vm_service.startVm({
    node_id,
    vm_id,
    retry_allowed: false
  });
  LogTaskMetadata({
    label: 'start_vm_submitted',
    task_id: start_result.task_id
  });

  const start_completion = await proxmox_client.vm_service.waitForTask({
    operation: 'start',
    node_id,
    task_id: start_result.task_id,
    timeout_ms: 5 * 60 * 1000
  });
  LogTaskMetadata({
    label: 'start_vm_completed',
    task_id: start_completion.task_id,
    status: start_completion.status,
    exit_status: start_completion.exit_status,
    percent: start_completion.percent,
    message: start_completion.message
  });
  if (
    IsTaskFailed({
      status: start_completion.status,
      exit_status: start_completion.exit_status
    })
  ) {
    throw new Error('VM start task completed with failure status.');
  }
}

if (require.main === module) {
  void Main().catch((error: unknown) => {
    if (error instanceof ProxmoxAuthError) {
      console.error(
        `[example] auth_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxValidationError) {
      console.error(
        `[example] validation_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxRateLimitError) {
      console.error(
        `[example] rate_limit_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxTimeoutError) {
      console.error(
        `[example] timeout_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxHttpError) {
      console.error(
        `[example] http_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof ProxmoxError) {
      console.error(
        `[example] proxmox_error code=${error.code} message=${error.message}`
      );
      if (error.details !== undefined) {
        console.error(`[example] details=${JSON.stringify(error.details)}`);
      }
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    if (error instanceof Error) {
      console.error(`[example] unexpected_error message=${error.message}`);
      LogErrorCauseChain(error);
      process.exitCode = 1;
      return;
    }

    console.error('[example] unexpected_non_error_throw');
    process.exitCode = 1;
  });
}
