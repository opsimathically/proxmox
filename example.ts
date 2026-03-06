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
  proxmox_datacenter_storage_record_i,
  proxmox_lxc_record_i,
  proxmox_node_record_i,
  proxmox_pool_record_i,
  proxmox_pool_resource_record_i,
  proxmox_storage_content_record_i,
  proxmox_storage_template_catalog_record_i,
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

function ResolveRequestedCores(raw_requested_cores: string | undefined): number {
  const default_requested_cores = 2;
  if (
    raw_requested_cores === undefined ||
    raw_requested_cores.trim().length === 0
  ) {
    return default_requested_cores;
  }

  const parsed_requested_cores = Number.parseInt(raw_requested_cores.trim(), 10);
  if (!Number.isInteger(parsed_requested_cores) || parsed_requested_cores <= 0) {
    throw new Error(
      'PROXMOX_EXAMPLE_REQUESTED_CORES must be a positive integer.'
    );
  }
  return parsed_requested_cores;
}

function ResolveRequestedMemoryBytes(
  raw_requested_memory_bytes: string | undefined
): number {
  const default_requested_memory_bytes = 2147483648;
  if (
    raw_requested_memory_bytes === undefined ||
    raw_requested_memory_bytes.trim().length === 0
  ) {
    return default_requested_memory_bytes;
  }

  const parsed_requested_memory_bytes = Number.parseInt(
    raw_requested_memory_bytes.trim(),
    10
  );
  if (
    !Number.isInteger(parsed_requested_memory_bytes) ||
    parsed_requested_memory_bytes <= 0
  ) {
    throw new Error(
      'PROXMOX_EXAMPLE_REQUESTED_MEMORY_BYTES must be a positive integer.'
    );
  }
  return parsed_requested_memory_bytes;
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

function ResolveOptionalPositiveInteger(params: {
  raw_value: string | undefined;
  field_name: string;
}): number | undefined {
  if (params.raw_value === undefined || params.raw_value.trim().length === 0) {
    return undefined;
  }

  const parsed_value = Number.parseInt(params.raw_value.trim(), 10);
  if (!Number.isInteger(parsed_value) || parsed_value <= 0) {
    throw new Error(`${params.field_name} must be a positive integer.`);
  }

  return parsed_value;
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

function ResolvePoolId(record: proxmox_pool_record_i): string {
  if (typeof record.pool_id === 'string' && record.pool_id.trim().length > 0) {
    return record.pool_id.trim();
  }
  return 'unknown';
}

function ResolvePoolComment(record: proxmox_pool_record_i): string {
  if (typeof record.comment === 'string' && record.comment.trim().length > 0) {
    return record.comment.trim();
  }
  return 'none';
}

function ResolvePoolResourceId(record: proxmox_pool_resource_record_i): string {
  if (typeof record.id === 'string' && record.id.trim().length > 0) {
    return record.id.trim();
  }
  if (typeof record.vmid === 'string' && record.vmid.trim().length > 0) {
    return record.vmid.trim();
  }
  if (typeof record.vmid === 'number' && Number.isFinite(record.vmid)) {
    return String(record.vmid);
  }
  return 'unknown';
}

function ResolvePoolResourceType(record: proxmox_pool_resource_record_i): string {
  if (typeof record.type === 'string' && record.type.trim().length > 0) {
    return record.type.trim();
  }
  return 'unknown';
}

function NormalizeStorageContentList(
  content: proxmox_datacenter_storage_record_i['content']
): string[] {
  if (Array.isArray(content)) {
    return content
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0);
  }
  if (typeof content === 'string') {
    return content
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function ResolveStorageLabel(storage: proxmox_datacenter_storage_record_i): string {
  if (typeof storage.storage === 'string' && storage.storage.trim().length > 0) {
    return storage.storage.trim();
  }
  return 'unknown';
}

function ResolveStorageType(storage: proxmox_datacenter_storage_record_i): string {
  if (typeof storage.type === 'string' && storage.type.trim().length > 0) {
    return storage.type.trim();
  }
  return 'unknown';
}

function ResolveStorageEnabled(storage: proxmox_datacenter_storage_record_i): string {
  if (typeof storage.enabled === 'boolean') {
    return storage.enabled ? 'true' : 'false';
  }
  if (typeof storage.enabled === 'number') {
    return storage.enabled > 0 ? 'true' : 'false';
  }
  return 'unknown';
}

function ResolveStorageShared(storage: proxmox_datacenter_storage_record_i): string {
  if (typeof storage.shared === 'number') {
    return storage.shared > 0 ? 'true' : 'false';
  }
  return 'unknown';
}

function ResolveStorageContentLabel(
  storage: proxmox_datacenter_storage_record_i
): string {
  const normalized_content = NormalizeStorageContentList(storage.content);
  if (normalized_content.length === 0) {
    return 'unknown';
  }
  return normalized_content.join(',');
}

function IsLxcDiskEligibleStorage(
  storage: proxmox_datacenter_storage_record_i
): boolean {
  const normalized_content = NormalizeStorageContentList(storage.content);
  return normalized_content.includes('rootdir');
}

function IsVmDiskEligibleStorage(
  storage: proxmox_datacenter_storage_record_i
): boolean {
  const normalized_content = NormalizeStorageContentList(storage.content);
  return normalized_content.includes('images');
}

function LogStorageOptionRecord(params: {
  label: 'all' | 'lxc_disk' | 'vm_disk';
  record: proxmox_datacenter_storage_record_i;
}): void {
  console.info(
    `[example] storage_${params.label} storage=${ResolveStorageLabel(
      params.record
    )} type=${ResolveStorageType(params.record)} enabled=${ResolveStorageEnabled(
      params.record
    )} shared=${ResolveStorageShared(params.record)} content=${ResolveStorageContentLabel(
      params.record
    )}`
  );
}

function ResolveStorageId(raw_storage_id: string | undefined): string {
  if (raw_storage_id === undefined || raw_storage_id.trim().length === 0) {
    return 'local';
  }
  return raw_storage_id.trim();
}

function ResolveStorageSizeLabel(size: number | undefined): string {
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0) {
    return String(size);
  }
  return 'unknown';
}

function ResolveStorageVmidLabel(vmid: string | number | undefined): string {
  if (typeof vmid === 'number' && Number.isFinite(vmid)) {
    return String(vmid);
  }
  if (typeof vmid === 'string' && vmid.trim().length > 0) {
    return vmid.trim();
  }
  return 'unknown';
}

function ResolveMemoryBytesLabel(value: number | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return String(value);
  }
  return 'unknown';
}

function LogStorageContentInventory(params: {
  label: 'backups' | 'iso_images' | 'ct_templates';
  records: proxmox_storage_content_record_i[];
}): void {
  console.info(`[example] storage_${params.label}_count=${params.records.length}`);
  for (const record of params.records) {
    const vmid_suffix =
      record.vmid === undefined
        ? ''
        : ` vmid=${ResolveStorageVmidLabel(record.vmid)}`;
    console.info(
      `[example] storage_${params.label} volume_id=${record.volume_id} content=${record.normalized_content} size=${ResolveStorageSizeLabel(record.size)}${vmid_suffix}`
    );
  }
}

function ResolveStorageUploadContentType(params: {
  raw_content_type: string | undefined;
  upload_file_path: string;
}): 'iso' | 'vztmpl' {
  const explicit_content_type = params.raw_content_type?.trim().toLowerCase();
  if (explicit_content_type === 'iso' || explicit_content_type === 'vztmpl') {
    return explicit_content_type;
  }
  if (explicit_content_type !== undefined && explicit_content_type.length > 0) {
    throw new Error(
      'PROXMOX_EXAMPLE_STORAGE_UPLOAD_CONTENT_TYPE must be iso or vztmpl.'
    );
  }

  const normalized_path = params.upload_file_path.trim().toLowerCase();
  const template_suffixes = [
    '.tar.gz',
    '.tar.xz',
    '.tar.zst',
    '.tgz',
    '.txz'
  ];
  if (
    template_suffixes.some((template_suffix) =>
      normalized_path.endsWith(template_suffix)
    )
  ) {
    return 'vztmpl';
  }

  return 'iso';
}

function ResolveStorageAclPath(storage: string): string {
  return `/storage/${storage}`;
}

function ResolveTemplateCatalogLabel(value: string | undefined): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return 'unknown';
}

function ResolveTemplateCatalogDescription(value: string | undefined): string {
  const normalized_description = ResolveTemplateCatalogLabel(value);
  if (normalized_description.length <= 120) {
    return normalized_description;
  }
  return `${normalized_description.slice(0, 117)}...`;
}

function LogTemplateCatalogInventory(params: {
  records: proxmox_storage_template_catalog_record_i[];
  section?: string;
}): void {
  const section_suffix =
    params.section === undefined ? '' : ` section=${params.section}`;
  console.info(
    `[example] template_catalog_count=${params.records.length}${section_suffix}`
  );
  for (const record of params.records) {
    console.info(
      `[example] template_catalog template_id=${ResolveTemplateCatalogLabel(record.template_id)} package=${ResolveTemplateCatalogLabel(record.package)} version=${ResolveTemplateCatalogLabel(record.version)} type=${ResolveTemplateCatalogLabel(record.type)} section=${ResolveTemplateCatalogLabel(record.section)} description=${ResolveTemplateCatalogDescription(record.description)}`
    );
  }
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

  const node_cpu_capacity = await proxmox_client.node_service.getNodeCpuCapacity({
    node_id
  });
  const logical_cpu_count =
    node_cpu_capacity.data.logical_cpu_count ?? 'unknown';
  const physical_core_count =
    node_cpu_capacity.data.physical_core_count ?? 'unknown';
  const socket_count = node_cpu_capacity.data.sockets ?? 'unknown';
  const cpu_model = node_cpu_capacity.data.model ?? 'unknown';
  console.info(
    `[example] node_cpu_capacity node=${node_id} logical=${logical_cpu_count} physical=${physical_core_count} sockets=${socket_count} model=${cpu_model}`
  );
  console.info(
    `[example] node_cpu_capacity_sources logical=${node_cpu_capacity.data.source_fields.logical_cpu_count ?? 'unknown'} physical=${node_cpu_capacity.data.source_fields.physical_core_count ?? 'unknown'}`
  );

  const requested_cores_for_preflight = ResolveRequestedCores(
    process.env.PROXMOX_EXAMPLE_REQUESTED_CORES
  );
  const core_preflight = await proxmox_client.node_service.canAllocateCores({
    node_id,
    requested_cores: requested_cores_for_preflight,
    mode: 'logical'
  });
  console.info(
    `[example] core_preflight mode=${core_preflight.data.mode} requested=${core_preflight.data.requested_cores} available=${core_preflight.data.available_cores ?? 'unknown'} allowed=${core_preflight.data.allowed} reason=${core_preflight.data.reason}`
  );

  const node_memory_capacity =
    await proxmox_client.node_service.getNodeMemoryCapacity({
      node_id
    });
  console.info(
    `[example] node_memory_capacity node=${node_id} total=${ResolveMemoryBytesLabel(node_memory_capacity.data.total_memory_bytes)} used=${ResolveMemoryBytesLabel(node_memory_capacity.data.used_memory_bytes)} free=${ResolveMemoryBytesLabel(node_memory_capacity.data.free_memory_bytes)}`
  );
  console.info(
    `[example] node_memory_capacity_sources total=${node_memory_capacity.data.source_fields.total_memory_bytes ?? 'unknown'} used=${node_memory_capacity.data.source_fields.used_memory_bytes ?? 'unknown'} free=${node_memory_capacity.data.source_fields.free_memory_bytes ?? 'unknown'}`
  );

  const node_memory_allocations =
    await proxmox_client.node_service.getNodeMemoryAllocations({
      node_id
    });
  const vm_memory_allocations = node_memory_allocations.data.resources.filter(
    (resource_record) => resource_record.resource_type === 'qemu'
  );
  const lxc_memory_allocations = node_memory_allocations.data.resources.filter(
    (resource_record) => resource_record.resource_type === 'lxc'
  );
  console.info(
    `[example] node_memory_allocations include_stopped=${node_memory_allocations.data.include_stopped} resources=${node_memory_allocations.data.resource_count} vm_resources=${vm_memory_allocations.length} lxc_resources=${lxc_memory_allocations.length} allocated_total=${node_memory_allocations.data.allocated_memory_bytes_total} used_total=${node_memory_allocations.data.used_memory_bytes_total}`
  );
  for (const resource_record of node_memory_allocations.data.resources) {
    console.info(
      `[example] node_memory_allocation resource_type=${resource_record.resource_type} resource_id=${resource_record.resource_id} name=${resource_record.name ?? 'unknown'} status=${resource_record.status ?? 'unknown'} used=${ResolveMemoryBytesLabel(resource_record.memory_used_bytes)} limit=${ResolveMemoryBytesLabel(resource_record.memory_limit_bytes)}`
    );
  }

  const requested_memory_bytes_for_preflight = ResolveRequestedMemoryBytes(
    process.env.PROXMOX_EXAMPLE_REQUESTED_MEMORY_BYTES
  );
  const memory_preflight_free_headroom =
    await proxmox_client.node_service.canAllocateMemory({
      node_id,
      requested_memory_bytes: requested_memory_bytes_for_preflight,
      mode: 'free_headroom'
    });
  console.info(
    `[example] memory_preflight mode=${memory_preflight_free_headroom.data.mode} requested=${memory_preflight_free_headroom.data.requested_memory_bytes} available=${ResolveMemoryBytesLabel(memory_preflight_free_headroom.data.available_memory_bytes)} allowed=${memory_preflight_free_headroom.data.allowed} reason=${memory_preflight_free_headroom.data.reason}`
  );

  const memory_preflight_allocated_headroom =
    await proxmox_client.node_service.canAllocateMemory({
      node_id,
      requested_memory_bytes: requested_memory_bytes_for_preflight,
      mode: 'allocated_headroom'
    });
  console.info(
    `[example] memory_preflight mode=${memory_preflight_allocated_headroom.data.mode} requested=${memory_preflight_allocated_headroom.data.requested_memory_bytes} available=${ResolveMemoryBytesLabel(memory_preflight_allocated_headroom.data.available_memory_bytes)} allowed=${memory_preflight_allocated_headroom.data.allowed} reason=${memory_preflight_allocated_headroom.data.reason}`
  );

  const pool_inventory = await proxmox_client.pool_service.listPools();
  const pool_records = pool_inventory.data as proxmox_pool_record_i[];
  console.info(`[example] pool_count=${pool_records.length}`);
  for (const pool_record of pool_records) {
    console.info(
      `[example] pool id=${ResolvePoolId(pool_record)} comment=${ResolvePoolComment(pool_record)}`
    );
  }

  const selected_pool_id_from_env =
    process.env.PROXMOX_EXAMPLE_POOL_ID?.trim() || undefined;
  const selected_pool_id =
    selected_pool_id_from_env ||
    (pool_records.length > 0 ? ResolvePoolId(pool_records[0]) : undefined);
  if (selected_pool_id !== undefined && selected_pool_id !== 'unknown') {
    const selected_pool = await proxmox_client.pool_service.getPool({
      pool_id: selected_pool_id
    });
    console.info(
      `[example] selected_pool id=${selected_pool.data.pool_id} members=${selected_pool.data.members.length}`
    );

    const selected_pool_resources =
      await proxmox_client.pool_service.listPoolResources({
        pool_id: selected_pool_id
      });
    console.info(
      `[example] selected_pool_resources_count=${selected_pool_resources.data.length}`
    );
    for (const resource_record of selected_pool_resources.data) {
      console.info(
        `[example] selected_pool_resource id=${ResolvePoolResourceId(resource_record)} type=${ResolvePoolResourceType(resource_record)}`
      );
    }
  } else {
    console.info('[example] selected_pool_skipped reason=no_pools_found');
  }

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

  const storage_options_response = await (async () => {
    try {
      return await proxmox_client.datacenter_service.listStorage({
        node: node_id
      });
    } catch (error) {
      if (error instanceof ProxmoxHttpError) {
        console.info(
          '[example] storage_scope_fallback reason=node_query_not_supported_using_unfiltered_listStorage'
        );
        return proxmox_client.datacenter_service.listStorage();
      }
      throw error;
    }
  })();
  const storage_options =
    storage_options_response.data as proxmox_datacenter_storage_record_i[];
  console.info(`[example] storage_all_count=${storage_options.length}`);
  for (const storage_record of storage_options) {
    LogStorageOptionRecord({
      label: 'all',
      record: storage_record
    });
  }

  const lxc_disk_storage_options = storage_options.filter((storage_record) =>
    IsLxcDiskEligibleStorage(storage_record)
  );
  console.info(
    `[example] storage_lxc_disk_count=${lxc_disk_storage_options.length}`
  );
  for (const storage_record of lxc_disk_storage_options) {
    LogStorageOptionRecord({
      label: 'lxc_disk',
      record: storage_record
    });
  }

  const vm_disk_storage_options = storage_options.filter((storage_record) =>
    IsVmDiskEligibleStorage(storage_record)
  );
  console.info(`[example] storage_vm_disk_count=${vm_disk_storage_options.length}`);
  for (const storage_record of vm_disk_storage_options) {
    LogStorageOptionRecord({
      label: 'vm_disk',
      record: storage_record
    });
  }

  const storage_id = ResolveStorageId(process.env.PROXMOX_EXAMPLE_STORAGE_ID);
  console.info(`[example] selected_storage=${storage_id}`);
  const backup_vmid_filter = ResolveOptionalPositiveInteger({
    raw_value: process.env.PROXMOX_EXAMPLE_STORAGE_BACKUP_VMID,
    field_name: 'PROXMOX_EXAMPLE_STORAGE_BACKUP_VMID'
  });

  const backup_inventory = await proxmox_client.storage_service.listBackups({
    node_id,
    storage: storage_id,
    vmid: backup_vmid_filter
  });
  LogStorageContentInventory({
    label: 'backups',
    records: backup_inventory.data
  });

  const iso_inventory = await proxmox_client.storage_service.listIsoImages({
    node_id,
    storage: storage_id
  });
  LogStorageContentInventory({
    label: 'iso_images',
    records: iso_inventory.data
  });

  const ct_template_inventory =
    await proxmox_client.storage_service.listCtTemplates({
      node_id,
      storage: storage_id
    });
  LogStorageContentInventory({
    label: 'ct_templates',
    records: ct_template_inventory.data
  });

  const template_catalog_section =
    process.env.PROXMOX_EXAMPLE_TEMPLATE_CATALOG_SECTION?.trim() || undefined;
  const template_catalog_inventory =
    await proxmox_client.storage_service.listTemplateCatalog({
      node_id,
      section: template_catalog_section
    });
  LogTemplateCatalogInventory({
    records: template_catalog_inventory.data,
    section: template_catalog_section
  });

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

  const storage_acl_path = ResolveStorageAclPath(storage_id);
  const current_storage_audit =
    await proxmox_client.storage_service.canAuditStorage({
      node_id,
      storage: storage_id
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: storage_acl_path,
    privilege: 'Datastore.Audit',
    allowed: current_storage_audit.data.allowed
  });

  const current_storage_template_allocate =
    await proxmox_client.storage_service.canAllocateTemplate({
      node_id,
      storage: storage_id
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: storage_acl_path,
    privilege: 'Datastore.AllocateTemplate',
    allowed: current_storage_template_allocate.data.allowed
  });

  const current_storage_space_allocate =
    await proxmox_client.storage_service.canAllocateSpace({
      node_id,
      storage: storage_id
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: storage_acl_path,
    privilege: 'Datastore.AllocateSpace',
    allowed: current_storage_space_allocate.data.allowed
  });

  const current_storage_permission_modify =
    await proxmox_client.storage_service.canModifyPermissions({
      node_id,
      storage: storage_id
    });
  LogPrivilegeCheck({
    identity_label: 'current',
    path: storage_acl_path,
    privilege: 'Permissions.Modify',
    allowed: current_storage_permission_modify.data.allowed
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

      const target_storage_audit_check =
        await proxmox_client.storage_service.canAuditStorage({
          node_id,
          storage: storage_id,
          auth_id: permission_target_auth_id
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: storage_acl_path,
        privilege: 'Datastore.Audit',
        allowed: target_storage_audit_check.data.allowed
      });

      const target_storage_template_allocate_check =
        await proxmox_client.storage_service.canAllocateTemplate({
          node_id,
          storage: storage_id,
          auth_id: permission_target_auth_id
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: storage_acl_path,
        privilege: 'Datastore.AllocateTemplate',
        allowed: target_storage_template_allocate_check.data.allowed
      });

      const target_storage_space_allocate_check =
        await proxmox_client.storage_service.canAllocateSpace({
          node_id,
          storage: storage_id,
          auth_id: permission_target_auth_id
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: storage_acl_path,
        privilege: 'Datastore.AllocateSpace',
        allowed: target_storage_space_allocate_check.data.allowed
      });

      const target_storage_permissions_modify_check =
        await proxmox_client.storage_service.canModifyPermissions({
          node_id,
          storage: storage_id,
          auth_id: permission_target_auth_id
        });
      LogPrivilegeCheck({
        identity_label: 'target',
        auth_id: permission_target_auth_id,
        path: storage_acl_path,
        privilege: 'Permissions.Modify',
        allowed: target_storage_permissions_modify_check.data.allowed
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
      '[example] storage_upload_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
    console.info(
      '[example] storage_download_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
    console.info(
      '[example] storage_delete_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
    console.info(
      '[example] VM create/start flow skipped. Set PROXMOX_EXAMPLE_EXECUTE_MUTATIONS=true to run it.'
    );
    return;
  }

  const upload_file_path =
    process.env.PROXMOX_EXAMPLE_STORAGE_UPLOAD_FILE_PATH?.trim() || undefined;
  if (upload_file_path === undefined) {
    console.info(
      '[example] storage_upload_skipped reason=PROXMOX_EXAMPLE_STORAGE_UPLOAD_FILE_PATH_not_set'
    );
  } else {
    const upload_content_type = ResolveStorageUploadContentType({
      raw_content_type: process.env.PROXMOX_EXAMPLE_STORAGE_UPLOAD_CONTENT_TYPE,
      upload_file_path: upload_file_path
    });
    const upload_filename =
      process.env.PROXMOX_EXAMPLE_STORAGE_UPLOAD_FILENAME?.trim() || undefined;
    const upload_result = await proxmox_client.storage_service.uploadContent({
      node_id,
      storage: storage_id,
      content_type: upload_content_type,
      file_path: upload_file_path,
      filename: upload_filename
    });
    console.info(
      `[example] storage_upload_submitted storage=${storage_id} content_type=${upload_content_type} task_id=${upload_result.data.task_id}`
    );
  }

  const download_volume_id =
    process.env.PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_VOLUME_ID?.trim() || undefined;
  const download_destination_path =
    process.env.PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_DESTINATION_PATH?.trim() ||
    undefined;
  if (download_volume_id === undefined || download_destination_path === undefined) {
    console.info(
      '[example] storage_download_skipped reason=PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_VOLUME_ID_or_PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_DESTINATION_PATH_not_set'
    );
  } else {
    const download_overwrite = NormalizeBoolean(
      process.env.PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_OVERWRITE
    );
    const download_result = await proxmox_client.storage_service.downloadContent({
      node_id,
      storage: storage_id,
      volume_id: download_volume_id,
      destination_path: download_destination_path,
      overwrite: download_overwrite
    });
    console.info(
      `[example] storage_download_completed storage=${storage_id} volume_id=${download_volume_id} bytes_written=${download_result.data.bytes_written} destination_path=${download_result.data.destination_path}`
    );
  }

  const delete_volume_id =
    process.env.PROXMOX_EXAMPLE_STORAGE_DELETE_VOLUME_ID?.trim() || undefined;
  const allow_storage_delete = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_STORAGE_ALLOW_DELETE
  );
  if (delete_volume_id === undefined) {
    console.info(
      '[example] storage_delete_skipped reason=PROXMOX_EXAMPLE_STORAGE_DELETE_VOLUME_ID_not_set'
    );
  } else if (!allow_storage_delete) {
    console.info(
      '[example] storage_delete_skipped reason=PROXMOX_EXAMPLE_STORAGE_ALLOW_DELETE_not_true'
    );
  } else {
    const delete_result = await proxmox_client.storage_service.deleteContent({
      node_id,
      storage: storage_id,
      volume_id: delete_volume_id
    });
    console.info(
      `[example] storage_delete_submitted storage=${storage_id} volume_id=${delete_volume_id} task_id=${delete_result.data.task_id}`
    );
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
