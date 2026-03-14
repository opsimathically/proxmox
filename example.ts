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
  proxmox_node_network_interface_record_i,
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

function ResolveNodeRecordId(node_record: proxmox_node_record_i): string | undefined {
  const candidates = [
    node_record.node,
    node_record.name,
    node_record.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function ResolveClusterNodeIds(node_records: proxmox_node_record_i[]): string[] {
  const node_ids = new Set<string>();
  for (const node_record of node_records) {
    const node_id = ResolveNodeRecordId(node_record);
    if (node_id !== undefined) {
      node_ids.add(node_id);
    }
  }
  return Array.from(node_ids.values());
}

function NormalizeBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function ResolveRequestedCores(
  raw_requested_cores: string | undefined
): number {
  const default_requested_cores = 2;
  if (
    raw_requested_cores === undefined ||
    raw_requested_cores.trim().length === 0
  ) {
    return default_requested_cores;
  }

  const parsed_requested_cores = Number.parseInt(
    raw_requested_cores.trim(),
    10
  );
  if (
    !Number.isInteger(parsed_requested_cores) ||
    parsed_requested_cores <= 0
  ) {
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

function ResolvePlannerScoringMode(
  raw_scoring_mode: string | undefined
): 'balanced' | 'capacity_first' | 'strict' {
  if (raw_scoring_mode === undefined || raw_scoring_mode.trim().length === 0) {
    return 'balanced';
  }
  const normalized_scoring_mode = raw_scoring_mode.trim().toLowerCase();
  if (
    normalized_scoring_mode !== 'balanced' &&
    normalized_scoring_mode !== 'capacity_first' &&
    normalized_scoring_mode !== 'strict'
  ) {
    throw new Error(
      'PROXMOX_EXAMPLE_PLANNER_SCORING_MODE must be balanced, capacity_first, or strict.'
    );
  }
  return normalized_scoring_mode;
}

function ResolveOptionalNodeId(params: {
  raw_value: string | undefined;
  field_name: string;
}): string | undefined {
  if (params.raw_value === undefined || params.raw_value.trim().length === 0) {
    return undefined;
  }
  const node_id = params.raw_value.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(node_id)) {
    throw new Error(`${params.field_name} contains unsupported characters.`);
  }
  return node_id;
}

function ResolveOptionalNodeIdList(params: {
  raw_value: string | undefined;
  field_name: string;
}): string[] | undefined {
  if (params.raw_value === undefined || params.raw_value.trim().length === 0) {
    return undefined;
  }

  const node_ids: string[] = [];
  const dedupe_set = new Set<string>();
  for (const raw_node_id of params.raw_value.split(',')) {
    const node_id = ResolveOptionalNodeId({
      raw_value: raw_node_id,
      field_name: params.field_name
    });
    if (node_id === undefined) {
      continue;
    }
    const dedupe_key = node_id.toLowerCase();
    if (dedupe_set.has(dedupe_key)) {
      continue;
    }
    dedupe_set.add(dedupe_key);
    node_ids.push(node_id);
  }
  return node_ids.length > 0 ? node_ids : undefined;
}

function ResolveTaskWaitTargets(params: {
  raw_value: string | undefined;
  fallback_node_id: string;
}): Array<{ node_id: string; task_id: string }> {
  if (params.raw_value === undefined || params.raw_value.trim().length === 0) {
    return [];
  }

  const targets: Array<{ node_id: string; task_id: string }> = [];
  const dedupe_set = new Set<string>();
  for (const raw_target of params.raw_value.split(',')) {
    const trimmed_target = raw_target.trim();
    if (trimmed_target.length === 0) {
      continue;
    }
    const separator_index = trimmed_target.indexOf(':');
    let node_id = params.fallback_node_id;
    let task_id = trimmed_target;
    if (separator_index > 0) {
      const candidate_node_id = trimmed_target.slice(0, separator_index).trim();
      const candidate_task_id = trimmed_target.slice(separator_index + 1).trim();
      if (candidate_node_id.length > 0) {
        node_id = candidate_node_id;
      }
      task_id = candidate_task_id;
    }

    if (!/^[A-Za-z0-9._-]+$/.test(node_id)) {
      throw new Error(
        'PROXMOX_EXAMPLE_TASK_WAIT_TARGETS node_id values contain unsupported characters.'
      );
    }
    if (task_id.length === 0) {
      throw new Error(
        'PROXMOX_EXAMPLE_TASK_WAIT_TARGETS entries must include a task id.'
      );
    }

    const dedupe_key = `${node_id.toLowerCase()}::${task_id}`;
    if (dedupe_set.has(dedupe_key)) {
      continue;
    }
    dedupe_set.add(dedupe_key);
    targets.push({
      node_id,
      task_id
    });
  }

  return targets;
}

function ResolveTemplateStorageIdFromReference(
  template_reference: string | undefined
): string | undefined {
  if (
    template_reference === undefined ||
    template_reference.trim().length === 0
  ) {
    return undefined;
  }
  const separator_index = template_reference.indexOf(':');
  if (separator_index <= 0) {
    return undefined;
  }
  const storage_id = template_reference.slice(0, separator_index).trim();
  return storage_id.length > 0 ? storage_id : undefined;
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

function ResolveOptionalResourceNumericId(raw_resource_id: string): number | undefined {
  if (!/^[1-9][0-9]*$/.test(raw_resource_id.trim())) {
    return undefined;
  }
  return Number.parseInt(raw_resource_id.trim(), 10);
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

function ResolveNetworkInterfaceId(
  record: proxmox_node_network_interface_record_i
): string {
  if (
    typeof record.interface_id === 'string' &&
    record.interface_id.trim().length > 0
  ) {
    return record.interface_id.trim();
  }
  return 'unknown';
}

function ResolveNetworkInterfaceType(
  record: proxmox_node_network_interface_record_i
): string {
  if (typeof record.type === 'string' && record.type.trim().length > 0) {
    return record.type.trim();
  }
  return 'unknown';
}

function ResolveNetworkBooleanLabel(value: boolean | undefined): string {
  if (typeof value !== 'boolean') {
    return 'unknown';
  }
  return value ? 'true' : 'false';
}

function ResolveBridgePortsLabel(
  record: proxmox_node_network_interface_record_i
): string {
  if (Array.isArray(record.bridge_ports) && record.bridge_ports.length > 0) {
    return record.bridge_ports.join(',');
  }
  return 'none';
}

function LogNetworkInterfaceRecord(params: {
  label: 'all' | 'bridge';
  record: proxmox_node_network_interface_record_i;
}): void {
  console.info(
    `[example] network_${params.label} interface=${ResolveNetworkInterfaceId(
      params.record
    )} type=${ResolveNetworkInterfaceType(
      params.record
    )} is_bridge=${ResolveNetworkBooleanLabel(
      params.record.is_bridge
    )} active=${ResolveNetworkBooleanLabel(
      params.record.active
    )} autostart=${ResolveNetworkBooleanLabel(
      params.record.autostart
    )} bridge_ports=${ResolveBridgePortsLabel(params.record)}`
  );
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

function ResolvePoolResourceType(
  record: proxmox_pool_resource_record_i
): string {
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

function ResolveStorageLabel(
  storage: proxmox_datacenter_storage_record_i
): string {
  if (
    typeof storage.storage === 'string' &&
    storage.storage.trim().length > 0
  ) {
    return storage.storage.trim();
  }
  return 'unknown';
}

function ResolveStorageType(
  storage: proxmox_datacenter_storage_record_i
): string {
  if (typeof storage.type === 'string' && storage.type.trim().length > 0) {
    return storage.type.trim();
  }
  return 'unknown';
}

function ResolveStorageEnabled(
  storage: proxmox_datacenter_storage_record_i
): string {
  if (typeof storage.enabled === 'boolean') {
    return storage.enabled ? 'true' : 'false';
  }
  if (typeof storage.enabled === 'number') {
    return storage.enabled > 0 ? 'true' : 'false';
  }
  return 'unknown';
}

function ResolveStorageShared(
  storage: proxmox_datacenter_storage_record_i
): string {
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
  console.info(
    `[example] storage_${params.label}_count=${params.records.length}`
  );
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
  const template_suffixes = ['.tar.gz', '.tar.xz', '.tar.zst', '.tgz', '.txz'];
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

function ResolveLxcHelperContainerId(
  raw_container_id: string | undefined
): number {
  const default_container_id = 9100;
  if (raw_container_id === undefined || raw_container_id.trim().length === 0) {
    return default_container_id;
  }
  const parsed_container_id = Number.parseInt(raw_container_id.trim(), 10);
  if (!Number.isInteger(parsed_container_id) || parsed_container_id <= 0) {
    throw new Error(
      'PROXMOX_EXAMPLE_LXC_HELPER_CONTAINER_ID must be a positive integer.'
    );
  }
  return parsed_container_id;
}

function ResolveLxcHelperHostname(params: {
  raw_hostname: string | undefined;
  container_id: number;
}): string {
  if (
    typeof params.raw_hostname === 'string' &&
    params.raw_hostname.trim().length > 0
  ) {
    return params.raw_hostname.trim();
  }
  return `sdk-lxc-${params.container_id}.local`;
}

function ResolveLxcHelperBridge(
  bridge_interfaces: proxmox_node_network_interface_record_i[]
): string | undefined {
  if (bridge_interfaces.length === 0) {
    return undefined;
  }
  const candidate_bridge = ResolveNetworkInterfaceId(bridge_interfaces[0]);
  return candidate_bridge === 'unknown' ? undefined : candidate_bridge;
}

function ResolveLxcHelperDiskStorage(params: {
  lxc_disk_storage_options: proxmox_datacenter_storage_record_i[];
  fallback_storage: string;
}): string {
  if (params.lxc_disk_storage_options.length > 0) {
    const preferred_storage = ResolveStorageLabel(
      params.lxc_disk_storage_options[0]
    );
    if (preferred_storage !== 'unknown') {
      return preferred_storage;
    }
  }
  return params.fallback_storage;
}

function ResolveLxcHelperTemplateReference(params: {
  local_templates: proxmox_storage_content_record_i[];
  catalog_templates: proxmox_storage_template_catalog_record_i[];
  fallback_storage: string;
}): string | undefined {
  if (params.local_templates.length > 0) {
    const volume_id = params.local_templates[0].volume_id?.trim();
    if (typeof volume_id === 'string' && volume_id.length > 0) {
      return volume_id;
    }
  }

  for (const catalog_record of params.catalog_templates) {
    const template_candidate_fields = [
      catalog_record.file,
      catalog_record.filename,
      catalog_record.template_id,
      catalog_record.package
    ];
    for (const field_value of template_candidate_fields) {
      if (typeof field_value !== 'string') {
        continue;
      }
      const normalized_value = field_value.trim();
      if (!normalized_value) {
        continue;
      }
      if (normalized_value.includes(':')) {
        return normalized_value;
      }
      if (normalized_value.startsWith('vztmpl/')) {
        return `${params.fallback_storage}:${normalized_value}`;
      }
      return `${params.fallback_storage}:vztmpl/${normalized_value}`;
    }
  }

  return undefined;
}

function ResolveOptionalLxcDestroyContainerId(
  raw_container_id: string | undefined
): number | undefined {
  return ResolveOptionalPositiveInteger({
    raw_value: raw_container_id,
    field_name: 'PROXMOX_EXAMPLE_LXC_DESTROY_CONTAINER_ID'
  });
}

function ResolveLxcBulkCount(raw_count: string | undefined): number {
  const default_bulk_count = 10;
  if (raw_count === undefined || raw_count.trim().length === 0) {
    return default_bulk_count;
  }
  const parsed_count = Number.parseInt(raw_count.trim(), 10);
  if (!Number.isInteger(parsed_count) || parsed_count <= 0) {
    throw new Error(
      'PROXMOX_EXAMPLE_LXC_BULK_COUNT must be a positive integer.'
    );
  }
  return parsed_count;
}

function ResolveLxcBulkStartId(raw_start_id: string | undefined): number {
  const default_bulk_start_id = 9400;
  if (raw_start_id === undefined || raw_start_id.trim().length === 0) {
    return default_bulk_start_id;
  }
  const parsed_start_id = Number.parseInt(raw_start_id.trim(), 10);
  if (!Number.isInteger(parsed_start_id) || parsed_start_id <= 0) {
    throw new Error(
      'PROXMOX_EXAMPLE_LXC_BULK_START_ID must be a positive integer.'
    );
  }
  return parsed_start_id;
}

function BuildLxcBulkContainerIds(params: {
  start_id: number;
  count: number;
}): number[] {
  const container_ids: number[] = [];
  for (let index = 0; index < params.count; index += 1) {
    container_ids.push(params.start_id + index);
  }
  return container_ids;
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

  const configured_node_ids = new Set(
    proxmox_client.cluster.nodes.map((cluster_node) => cluster_node.id)
  );
  let node_id = ResolvePreferredNodeId({
    provided_node_id: process.env.PROXMOX_EXAMPLE_NODE_ID,
    node_records
  });
  if (!configured_node_ids.has(node_id)) {
    const fallback_configured_node_id =
      proxmox_client.cluster.default_node ?? proxmox_client.cluster.nodes[0]?.id;
    if (fallback_configured_node_id !== undefined) {
      console.info(
        `[example] selected_node_override source=configured_cluster_nodes previous=${node_id} selected=${fallback_configured_node_id}`
      );
      node_id = fallback_configured_node_id;
    }
  }
  console.info(`[example] selected_node=${node_id}`);
  const discovered_cluster_node_ids = ResolveClusterNodeIds(node_records);
  const configured_cluster_node_ids = Array.from(configured_node_ids.values());
  const cluster_candidate_node_ids =
    configured_cluster_node_ids.length > 0
      ? configured_cluster_node_ids
      : discovered_cluster_node_ids;
  console.info(
    `[example] cluster_discovered_nodes=${discovered_cluster_node_ids.length} ids=${discovered_cluster_node_ids.join(',')}`
  );
  console.info(
    `[example] cluster_configured_nodes=${configured_cluster_node_ids.length} ids=${configured_cluster_node_ids.join(',')}`
  );
  console.info(
    `[example] cluster_candidate_nodes=${cluster_candidate_node_ids.length} ids=${cluster_candidate_node_ids.join(',')}`
  );

  const next_lxc_id_response = await proxmox_client.cluster_service.allocateNextId({
    resource_type: 'lxc'
  });
  console.info(
    `[example] cluster_next_lxc_id value=${next_lxc_id_response.data.next_id} source=${next_lxc_id_response.data.source}`
  );

  const network_interfaces_response =
    await proxmox_client.node_service.listNetworkInterfaces({
      node_id
    });
  const network_interfaces =
    network_interfaces_response.data as proxmox_node_network_interface_record_i[];
  console.info(
    `[example] network_interface_count=${network_interfaces.length}`
  );
  for (const interface_record of network_interfaces) {
    LogNetworkInterfaceRecord({
      label: 'all',
      record: interface_record
    });
  }

  const bridge_interfaces_response =
    await proxmox_client.node_service.listBridges({
      node_id
    });
  const bridge_interfaces =
    bridge_interfaces_response.data as proxmox_node_network_interface_record_i[];
  console.info(`[example] network_bridge_count=${bridge_interfaces.length}`);
  for (const bridge_record of bridge_interfaces) {
    LogNetworkInterfaceRecord({
      label: 'bridge',
      record: bridge_record
    });
  }

  const node_cpu_capacity =
    await proxmox_client.node_service.getNodeCpuCapacity({
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
  console.info(
    `[example] storage_vm_disk_count=${vm_disk_storage_options.length}`
  );
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
  const execute_mutations = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_EXECUTE_MUTATIONS
  );

  const lxc_helper_template_reference = ResolveLxcHelperTemplateReference({
    local_templates: ct_template_inventory.data,
    catalog_templates: template_catalog_inventory.data,
    fallback_storage: storage_id
  });
  let lxc_helper_live_container_id: number | undefined;
  const lxc_helper_bridge = ResolveLxcHelperBridge(bridge_interfaces);
  const lxc_helper_disk_storage = ResolveLxcHelperDiskStorage({
    lxc_disk_storage_options,
    fallback_storage: storage_id
  });
  const vm_helper_disk_storage = ResolveLxcHelperDiskStorage({
    lxc_disk_storage_options: vm_disk_storage_options,
    fallback_storage: storage_id
  });
  const planner_scoring_mode = ResolvePlannerScoringMode(
    process.env.PROXMOX_EXAMPLE_PLANNER_SCORING_MODE
  );
  const planner_required_pool_id =
    selected_pool_id !== undefined && selected_pool_id !== 'unknown'
      ? selected_pool_id
      : undefined;
  const planner_template_storage_id = ResolveTemplateStorageIdFromReference(
    lxc_helper_template_reference
  );

  try {
    const lxc_placement_plan = await proxmox_client.helpers.planLxcPlacement({
      required_storage_id: lxc_helper_disk_storage,
      template_storage_id: planner_template_storage_id,
      required_bridge: lxc_helper_bridge,
      requested_cores: requested_cores_for_preflight,
      requested_memory_bytes: requested_memory_bytes_for_preflight,
      candidate_node_ids: cluster_candidate_node_ids,
      required_pool_id: planner_required_pool_id,
      scoring_mode: planner_scoring_mode,
      strict_permissions: false
    });
    console.info(
      `[example] placement_lxc_plan scoring=${lxc_placement_plan.data.scoring_mode} checked=${lxc_placement_plan.data.checked_node_count} allowed=${lxc_placement_plan.data.allowed_node_count} denied=${lxc_placement_plan.data.denied_node_count} recommended_node=${lxc_placement_plan.data.recommended_node_id ?? 'none'}`
    );
    for (const candidate of lxc_placement_plan.data.candidates) {
      console.info(
        `[example] placement_lxc_candidate node=${candidate.node_id} allowed=${candidate.allowed} score=${candidate.score} failed_required_checks=${candidate.failed_required_checks}`
      );
    }
  } catch (error) {
    if (error instanceof ProxmoxError) {
      console.error(
        `[example] placement_lxc_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
    } else {
      throw error;
    }
  }

  try {
    const vm_placement_plan = await proxmox_client.helpers.planVmPlacement({
      required_storage_id: vm_helper_disk_storage,
      required_bridge: lxc_helper_bridge,
      requested_cores: requested_cores_for_preflight,
      requested_memory_bytes: requested_memory_bytes_for_preflight,
      candidate_node_ids: cluster_candidate_node_ids,
      required_pool_id: planner_required_pool_id,
      scoring_mode: planner_scoring_mode,
      strict_permissions: false
    });
    console.info(
      `[example] placement_vm_plan scoring=${vm_placement_plan.data.scoring_mode} checked=${vm_placement_plan.data.checked_node_count} allowed=${vm_placement_plan.data.allowed_node_count} denied=${vm_placement_plan.data.denied_node_count} recommended_node=${vm_placement_plan.data.recommended_node_id ?? 'none'}`
    );
    for (const candidate of vm_placement_plan.data.candidates) {
      console.info(
        `[example] placement_vm_candidate node=${candidate.node_id} allowed=${candidate.allowed} score=${candidate.score} failed_required_checks=${candidate.failed_required_checks}`
      );
    }
  } catch (error) {
    if (error instanceof ProxmoxError) {
      console.error(
        `[example] placement_vm_error code=${error.code} message=${error.message}`
      );
      LogErrorCauseChain(error);
    } else {
      throw error;
    }
  }

  if (lxc_helper_template_reference === undefined) {
    console.info(
      '[example] lxc_helper_preview_skipped reason=no_ct_template_reference_available'
    );
  } else if (lxc_helper_bridge === undefined) {
    console.info(
      '[example] lxc_helper_preview_skipped reason=no_bridge_available'
    );
  } else {
    const lxc_helper_container_id = ResolveLxcHelperContainerId(
      process.env.PROXMOX_EXAMPLE_LXC_HELPER_CONTAINER_ID
    );
    const lxc_helper_dry_run = !execute_mutations;
    const cluster_preflight_strict_permissions = NormalizeBoolean(
      process.env.PROXMOX_EXAMPLE_LXC_CLUSTER_PREFLIGHT_STRICT_PERMISSIONS
    );
    const lxc_helper_hostname = ResolveLxcHelperHostname({
      raw_hostname: process.env.PROXMOX_EXAMPLE_LXC_HELPER_HOSTNAME,
      container_id: lxc_helper_container_id
    });
    const lxc_cluster_preflight_input = {
      general: {
        node_id,
        container_id: lxc_helper_container_id,
        hostname: lxc_helper_hostname,
        resource_pool:
          selected_pool_id !== undefined && selected_pool_id !== 'unknown'
            ? selected_pool_id
            : undefined,
        unprivileged_container: true,
        nesting: true,
        add_to_ha: false,
        tags: ['example', 'helper']
      },
      template: {
        storage: storage_id,
        template: lxc_helper_template_reference
      },
      disks: {
        storage: lxc_helper_disk_storage,
        disk_size_gib: 8
      },
      cpu: {
        cores: 1,
        cpu_units: 100
      },
      memory: {
        memory_mib: 512,
        swap_mib: 512
      },
      network: {
        name: 'eth0',
        bridge: lxc_helper_bridge,
        ipv4_mode: 'dhcp',
        ipv6_mode: 'dhcp'
      },
      preflight: {
        enabled: true,
        enforce: false,
        check_cpu: true,
        check_memory: true
      }
    };
    console.info(
      `[example] lxc_helper_request node=${node_id} container_id=${lxc_helper_container_id} template=${lxc_helper_template_reference} disk_storage=${lxc_helper_disk_storage} bridge=${lxc_helper_bridge} dry_run=${lxc_helper_dry_run} start_after_created=false`
    );
    try {
      const cluster_storage_compatibility =
        await proxmox_client.cluster_service.checkStorageCompatibility({
          node_ids: cluster_candidate_node_ids,
          required_content: 'rootdir',
          storage_id: lxc_helper_disk_storage
        });
      console.info(
        `[example] cluster_storage_rootdir_compatibility checked=${cluster_storage_compatibility.data.checked_node_count} compatible=${cluster_storage_compatibility.data.compatible_nodes.length} incompatible=${cluster_storage_compatibility.data.incompatible_nodes.length}`
      );
      for (const node_compatibility of cluster_storage_compatibility.data.nodes) {
        console.info(
          `[example] cluster_storage_rootdir_node node=${node_compatibility.node_id} compatible=${node_compatibility.compatible} reason=${node_compatibility.reason}`
        );
      }

      const cluster_bridge_compatibility =
        await proxmox_client.cluster_service.checkBridgeCompatibility({
          node_ids: cluster_candidate_node_ids,
          bridge: lxc_helper_bridge
        });
      console.info(
        `[example] cluster_bridge_compatibility checked=${cluster_bridge_compatibility.data.checked_node_count} compatible=${cluster_bridge_compatibility.data.compatible_nodes.length} incompatible=${cluster_bridge_compatibility.data.incompatible_nodes.length}`
      );
      for (const node_bridge of cluster_bridge_compatibility.data.nodes) {
        console.info(
          `[example] cluster_bridge_node node=${node_bridge.node_id} compatible=${node_bridge.compatible} reason=${node_bridge.reason} bridge_found=${node_bridge.bridge_found}`
        );
      }

      const cluster_lxc_preflight =
        await proxmox_client.helpers.preflightLxcCreateCluster({
          create_input: lxc_cluster_preflight_input,
          candidate_node_ids: cluster_candidate_node_ids,
          strict_permissions: cluster_preflight_strict_permissions
        });
      console.info(
        `[example] cluster_lxc_preflight checked=${cluster_lxc_preflight.data.checked_node_count} allowed=${cluster_lxc_preflight.data.allowed_node_count} denied=${cluster_lxc_preflight.data.denied_node_count} strict_permissions=${cluster_lxc_preflight.data.strict_permissions} recommended_node=${cluster_lxc_preflight.data.recommended_node_id ?? 'none'}`
      );
      for (const candidate of cluster_lxc_preflight.data.candidates) {
        console.info(
          `[example] cluster_lxc_preflight_candidate node=${candidate.node_id} allowed=${candidate.allowed} score=${candidate.score} failed_required_checks=${candidate.failed_required_checks}`
        );
      }

      const lxc_helper_preview =
        await proxmox_client.helpers.createLxcContainer({
          ...lxc_cluster_preflight_input,
          wait_for_task: true,
          dry_run: lxc_helper_dry_run,
          start_after_created: false
        });
      console.info(
        `[example] lxc_helper_preview dry_run=${lxc_helper_preview.data.dry_run} preflight_checks=${lxc_helper_preview.data.preflight.checks.length} preflight_failed=${lxc_helper_preview.data.preflight.failed_checks}`
      );
      console.info(
        `[example] lxc_helper_preview node=${lxc_helper_preview.data.node_id} container_id=${lxc_helper_preview.data.container_id} template=${lxc_helper_template_reference} disk_storage=${lxc_helper_disk_storage} bridge=${lxc_helper_bridge}`
      );
      if (lxc_helper_preview.data.dry_run !== true) {
        lxc_helper_live_container_id = lxc_helper_container_id;
      }
    } catch (error) {
      if (error instanceof ProxmoxError) {
        const status_code_suffix =
          typeof error.status_code === 'number'
            ? ` status_code=${error.status_code}`
            : '';
        const path_suffix =
          typeof error.details?.path === 'string'
            ? ` path=${error.details.path}`
            : '';
        console.error(
          `[example] lxc_helper_error code=${error.code} message=${error.message}${status_code_suffix}${path_suffix}`
        );
        if (error.details !== undefined) {
          console.error(
            `[example] lxc_helper_error_details=${RenderUnknown(error.details)}`
          );
        }
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
  }

  const run_lxc_destroy_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_LXC_DESTROY_RUN
  );
  if (!run_lxc_destroy_demo) {
    console.info(
      '[example] lxc_destroy_demo_skipped reason=PROXMOX_EXAMPLE_LXC_DESTROY_RUN_not_enabled'
    );
  } else if (!execute_mutations) {
    console.info(
      '[example] lxc_destroy_demo_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else {
    const configured_destroy_container_id =
      ResolveOptionalLxcDestroyContainerId(
        process.env.PROXMOX_EXAMPLE_LXC_DESTROY_CONTAINER_ID
      );
    const destroy_container_id =
      configured_destroy_container_id ?? lxc_helper_live_container_id;
    if (destroy_container_id === undefined) {
      console.info(
        '[example] lxc_destroy_demo_skipped reason=no_destroy_container_id_available'
      );
    } else {
      const destroy_dry_run = NormalizeBoolean(
        process.env.PROXMOX_EXAMPLE_LXC_DESTROY_DRY_RUN
      );
      console.info(
        `[example] lxc_destroy_request container_id=${destroy_container_id} dry_run=${destroy_dry_run} ignore_not_found=true`
      );
      try {
        const destroy_result =
          await proxmox_client.helpers.teardownAndDestroyLxcContainer({
            node_id,
            container_id: destroy_container_id,
            dry_run: destroy_dry_run,
            ignore_not_found: true,
            wait_for_tasks: true
          });
        console.info(
          `[example] lxc_destroy_result container_id=${destroy_result.data.container_id} stopped=${destroy_result.data.stopped} deleted=${destroy_result.data.deleted} ignored_not_found=${destroy_result.data.ignored_not_found} dry_run=${destroy_result.data.dry_run}`
        );
        if (destroy_result.data.stop_task?.task_id !== undefined) {
          console.info(
            `[example] lxc_destroy_stop_task task_id=${destroy_result.data.stop_task.task_id}`
          );
        }
        if (destroy_result.data.delete_task?.task_id !== undefined) {
          console.info(
            `[example] lxc_destroy_delete_task task_id=${destroy_result.data.delete_task.task_id}`
          );
        }
      } catch (error) {
        if (error instanceof ProxmoxError) {
          const status_code_suffix =
            typeof error.status_code === 'number'
              ? ` status_code=${error.status_code}`
              : '';
          const path_suffix =
            typeof error.details?.path === 'string'
              ? ` path=${error.details.path}`
              : '';
          console.error(
            `[example] lxc_destroy_error code=${error.code} message=${error.message}${status_code_suffix}${path_suffix}`
          );
          if (error.details !== undefined) {
            console.error(
              `[example] lxc_destroy_error_details=${RenderUnknown(error.details)}`
            );
          }
          LogErrorCauseChain(error);
        } else {
          throw error;
        }
      }
    }
  }

  const run_lxc_bulk_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_LXC_BULK_RUN
  );
  if (!run_lxc_bulk_demo) {
    console.info(
      '[example] lxc_bulk_demo_skipped reason=PROXMOX_EXAMPLE_LXC_BULK_RUN_not_enabled'
    );
  } else if (!execute_mutations) {
    console.info(
      '[example] lxc_bulk_demo_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else if (lxc_helper_template_reference === undefined) {
    console.info(
      '[example] lxc_bulk_demo_skipped reason=no_ct_template_reference_available'
    );
  } else if (lxc_helper_bridge === undefined) {
    console.info('[example] lxc_bulk_demo_skipped reason=no_bridge_available');
  } else {
    const lxc_bulk_count = ResolveLxcBulkCount(
      process.env.PROXMOX_EXAMPLE_LXC_BULK_COUNT
    );
    const lxc_bulk_start_id = ResolveLxcBulkStartId(
      process.env.PROXMOX_EXAMPLE_LXC_BULK_START_ID
    );
    const lxc_bulk_dry_run = NormalizeBoolean(
      process.env.PROXMOX_EXAMPLE_LXC_BULK_DRY_RUN
    );
    const lxc_bulk_destroy_run = NormalizeBoolean(
      process.env.PROXMOX_EXAMPLE_LXC_BULK_DESTROY_RUN
    );
    const lxc_bulk_container_ids = BuildLxcBulkContainerIds({
      start_id: lxc_bulk_start_id,
      count: lxc_bulk_count
    });

    console.info(
      `[example] lxc_bulk_create_request count=${lxc_bulk_count} start_id=${lxc_bulk_start_id} dry_run=${lxc_bulk_dry_run}`
    );
    try {
      const bulk_create_result =
        await proxmox_client.helpers.createLxcContainersBulk({
          base_input: {
            general: {
              node_id,
              container_id: lxc_bulk_container_ids[0],
              hostname: `sdk-bulk-${lxc_bulk_container_ids[0]}.local`,
              resource_pool:
                selected_pool_id !== undefined && selected_pool_id !== 'unknown'
                  ? selected_pool_id
                  : undefined,
              unprivileged_container: true,
              nesting: true,
              add_to_ha: false,
              tags: ['example', 'bulk']
            },
            template: {
              storage: storage_id,
              template: lxc_helper_template_reference
            },
            disks: {
              storage: lxc_helper_disk_storage,
              disk_size_gib: 8
            },
            cpu: {
              cores: 1,
              cpu_units: 100
            },
            memory: {
              memory_mib: 512,
              swap_mib: 512
            },
            network: {
              name: 'eth0',
              bridge: lxc_helper_bridge,
              ipv4_mode: 'dhcp',
              ipv6_mode: 'dhcp'
            },
            preflight: {
              enabled: true,
              enforce: false,
              check_cpu: true,
              check_memory: true
            },
            start_after_created: false,
            wait_for_task: true,
            dry_run: lxc_bulk_dry_run
          },
          count: lxc_bulk_count,
          container_id_list: lxc_bulk_container_ids,
          hostname_strategy: {
            template: 'sdk-bulk-{container_id}.local'
          },
          wait_for_tasks: true,
          dry_run: lxc_bulk_dry_run,
          continue_on_error: true,
          concurrency_limit: 2
        });
      console.info(
        `[example] lxc_bulk_create_summary requested=${bulk_create_result.data.summary.requested} attempted=${bulk_create_result.data.summary.attempted} succeeded=${bulk_create_result.data.summary.succeeded} failed=${bulk_create_result.data.summary.failed} skipped=${bulk_create_result.data.summary.skipped}`
      );
      for (const item of bulk_create_result.data.items) {
        const create_task_id = item.create_task?.task_id ?? 'none';
        const status_label = item.success ? 'ok' : 'error';
        console.info(
          `[example] lxc_bulk_create_item index=${item.index} container_id=${item.container_id} hostname=${item.hostname} status=${status_label} attempted=${item.attempted} skipped=${item.skipped} create_task_id=${create_task_id}`
        );
      }

      if (!lxc_bulk_dry_run) {
        const bulk_post_create_inventory =
          await proxmox_client.lxc_service.listContainers({
            node_id
          });
        const discovered_container_ids = new Set(
          bulk_post_create_inventory.data
            .map((record) => ResolveResourceId(record))
            .filter((id) => id !== 'unknown')
        );
        const existing_count = lxc_bulk_container_ids.filter((container_id) =>
          discovered_container_ids.has(String(container_id))
        ).length;
        console.info(
          `[example] lxc_bulk_create_verify expected=${lxc_bulk_container_ids.length} found=${existing_count}`
        );
      } else {
        console.info(
          '[example] lxc_bulk_create_verify_skipped reason=dry_run_enabled'
        );
      }

      if (!lxc_bulk_destroy_run) {
        console.info(
          '[example] lxc_bulk_destroy_skipped reason=PROXMOX_EXAMPLE_LXC_BULK_DESTROY_RUN_not_enabled'
        );
      } else {
        console.info(
          `[example] lxc_bulk_destroy_request count=${lxc_bulk_count} dry_run=${lxc_bulk_dry_run}`
        );
        const bulk_destroy_result =
          await proxmox_client.helpers.teardownAndDestroyLxcContainersBulk({
            node_id,
            count: lxc_bulk_count,
            container_id_list: lxc_bulk_container_ids,
            stop_first: true,
            ignore_not_found: true,
            wait_for_tasks: true,
            dry_run: lxc_bulk_dry_run,
            continue_on_error: true,
            concurrency_limit: 2
          });
        console.info(
          `[example] lxc_bulk_destroy_summary requested=${bulk_destroy_result.data.summary.requested} attempted=${bulk_destroy_result.data.summary.attempted} succeeded=${bulk_destroy_result.data.summary.succeeded} failed=${bulk_destroy_result.data.summary.failed} skipped=${bulk_destroy_result.data.summary.skipped}`
        );
        for (const item of bulk_destroy_result.data.items) {
          const delete_task_id = item.delete_task?.task_id ?? 'none';
          const status_label = item.success ? 'ok' : 'error';
          console.info(
            `[example] lxc_bulk_destroy_item index=${item.index} container_id=${item.container_id} status=${status_label} attempted=${item.attempted} skipped=${item.skipped} deleted=${item.deleted ?? false} ignored_not_found=${item.ignored_not_found ?? false} delete_task_id=${delete_task_id}`
          );
        }

        if (!lxc_bulk_dry_run) {
          const bulk_post_destroy_inventory =
            await proxmox_client.lxc_service.listContainers({
              node_id
            });
          const remaining_container_ids = new Set(
            bulk_post_destroy_inventory.data
              .map((record) => ResolveResourceId(record))
              .filter((id) => id !== 'unknown')
          );
          const remaining_count = lxc_bulk_container_ids.filter(
            (container_id) => remaining_container_ids.has(String(container_id))
          ).length;
          console.info(
            `[example] lxc_bulk_destroy_verify expected_removed=${lxc_bulk_container_ids.length} remaining=${remaining_count}`
          );
        } else {
          console.info(
            '[example] lxc_bulk_destroy_verify_skipped reason=dry_run_enabled'
          );
        }
      }
    } catch (error) {
      if (error instanceof ProxmoxError) {
        const status_code_suffix =
          typeof error.status_code === 'number'
            ? ` status_code=${error.status_code}`
            : '';
        const path_suffix =
          typeof error.details?.path === 'string'
            ? ` path=${error.details.path}`
            : '';
        console.error(
          `[example] lxc_bulk_error code=${error.code} message=${error.message}${status_code_suffix}${path_suffix}`
        );
        if (error.details !== undefined) {
          console.error(
            `[example] lxc_bulk_error_details=${RenderUnknown(error.details)}`
          );
        }
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
  }

  const run_cluster_lxc_migration_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_RUN
  );
  const run_cluster_vm_migration_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_RUN
  );
  const migration_target_node_id = ResolveOptionalNodeId({
    raw_value: process.env.PROXMOX_EXAMPLE_CLUSTER_MIGRATION_TARGET_NODE_ID,
    field_name: 'PROXMOX_EXAMPLE_CLUSTER_MIGRATION_TARGET_NODE_ID'
  });

  if (!run_cluster_lxc_migration_demo) {
    console.info(
      '[example] cluster_lxc_migration_skipped reason=PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_RUN_not_enabled'
    );
  } else if (!execute_mutations) {
    console.info(
      '[example] cluster_lxc_migration_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else if (migration_target_node_id === undefined) {
    console.info(
      '[example] cluster_lxc_migration_skipped reason=PROXMOX_EXAMPLE_CLUSTER_MIGRATION_TARGET_NODE_ID_not_set'
    );
  } else {
    const configured_lxc_migration_id = ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_ID,
      field_name: 'PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_ID'
    });
    const discovered_lxc_migration_id =
      lxc_records.length > 0
        ? ResolveOptionalResourceNumericId(ResolveResourceId(lxc_records[0]))
        : undefined;
    const lxc_migration_id =
      configured_lxc_migration_id ?? discovered_lxc_migration_id;
    if (lxc_migration_id === undefined) {
      console.info(
        '[example] cluster_lxc_migration_skipped reason=no_lxc_id_available'
      );
    } else {
      console.info(
        `[example] cluster_lxc_migration_request container_id=${lxc_migration_id} source_node=${node_id} target_node=${migration_target_node_id} required_storage=${lxc_helper_disk_storage} required_bridge=${lxc_helper_bridge ?? 'none'}`
      );
      try {
        const migration_result =
          await proxmox_client.helpers.migrateLxcWithPreflight({
            node_id,
            container_id: lxc_migration_id,
            target_node_id: migration_target_node_id,
            required_storage_id: lxc_helper_disk_storage,
            required_bridge: lxc_helper_bridge,
            requested_cores: requested_cores_for_preflight,
            requested_memory_bytes: requested_memory_bytes_for_preflight,
            migrate_volumes: true,
            wait_for_task: true,
            scoring_mode: planner_scoring_mode
          });
        console.info(
          `[example] cluster_lxc_migration_result container_id=${migration_result.data.container_id} allowed=${migration_result.data.preflight.allowed} reason=${migration_result.data.preflight.reason} task_id=${migration_result.data.migration_task?.task_id ?? 'none'}`
        );
      } catch (error) {
        if (error instanceof ProxmoxError) {
          console.error(
            `[example] cluster_lxc_migration_error code=${error.code} message=${error.message}`
          );
          if (error.details !== undefined) {
            console.error(
              `[example] cluster_lxc_migration_error_details=${RenderUnknown(error.details)}`
            );
          }
          LogErrorCauseChain(error);
        } else {
          throw error;
        }
      }
    }
  }

  if (!run_cluster_vm_migration_demo) {
    console.info(
      '[example] cluster_vm_migration_skipped reason=PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_RUN_not_enabled'
    );
  } else if (!execute_mutations) {
    console.info(
      '[example] cluster_vm_migration_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else if (migration_target_node_id === undefined) {
    console.info(
      '[example] cluster_vm_migration_skipped reason=PROXMOX_EXAMPLE_CLUSTER_MIGRATION_TARGET_NODE_ID_not_set'
    );
  } else {
    const configured_vm_migration_id = ResolveOptionalPositiveInteger({
      raw_value: process.env.PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_ID,
      field_name: 'PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_ID'
    });
    const discovered_vm_migration_id =
      vm_records.length > 0
        ? ResolveOptionalResourceNumericId(ResolveResourceId(vm_records[0]))
        : undefined;
    const vm_migration_id = configured_vm_migration_id ?? discovered_vm_migration_id;
    if (vm_migration_id === undefined) {
      console.info(
        '[example] cluster_vm_migration_skipped reason=no_vm_id_available'
      );
    } else {
      console.info(
        `[example] cluster_vm_migration_request vm_id=${vm_migration_id} source_node=${node_id} target_node=${migration_target_node_id} required_storage=${vm_helper_disk_storage} required_bridge=${lxc_helper_bridge ?? 'none'}`
      );
      try {
        const migration_result =
          await proxmox_client.helpers.migrateVmWithPreflight({
            node_id,
            vm_id: vm_migration_id,
            target_node_id: migration_target_node_id,
            required_storage_id: vm_helper_disk_storage,
            required_bridge: lxc_helper_bridge,
            requested_cores: requested_cores_for_preflight,
            requested_memory_bytes: requested_memory_bytes_for_preflight,
            online: true,
            force: false,
            wait_for_task: true,
            scoring_mode: planner_scoring_mode
          });
        console.info(
          `[example] cluster_vm_migration_result vm_id=${migration_result.data.vm_id} allowed=${migration_result.data.preflight.allowed} reason=${migration_result.data.preflight.reason} task_id=${migration_result.data.migration_task?.task_id ?? 'none'}`
        );
      } catch (error) {
        if (error instanceof ProxmoxError) {
          console.error(
            `[example] cluster_vm_migration_error code=${error.code} message=${error.message}`
          );
          if (error.details !== undefined) {
            console.error(
              `[example] cluster_vm_migration_error_details=${RenderUnknown(error.details)}`
            );
          }
          LogErrorCauseChain(error);
        } else {
          throw error;
        }
      }
    }
  }

  const run_ha_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_CLUSTER_HA_RUN
  );
  if (!run_ha_demo) {
    console.info(
      '[example] cluster_ha_demo_skipped reason=PROXMOX_EXAMPLE_CLUSTER_HA_RUN_not_enabled'
    );
  } else if (!execute_mutations) {
    console.info(
      '[example] cluster_ha_demo_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else {
    try {
      const ha_resources = await proxmox_client.ha_service.listResources();
      console.info(`[example] ha_resources_count=${ha_resources.data.length}`);
      for (const resource of ha_resources.data) {
        console.info(
          `[example] ha_resource sid=${resource.sid} state=${resource.state ?? 'unknown'} group=${resource.group ?? 'unknown'} status=${resource.status ?? 'unknown'}`
        );
      }

      const ha_groups = await proxmox_client.ha_service.listGroups();
      console.info(`[example] ha_groups_count=${ha_groups.data.length}`);
      for (const group of ha_groups.data) {
        console.info(
          `[example] ha_group group=${group.group} nodes=${group.nodes ?? 'unknown'} restricted=${group.restricted ?? false}`
        );
      }

      const ha_add_sid =
        process.env.PROXMOX_EXAMPLE_CLUSTER_HA_ADD_SID?.trim() || undefined;
      if (ha_add_sid === undefined) {
        console.info(
          '[example] ha_add_skipped reason=PROXMOX_EXAMPLE_CLUSTER_HA_ADD_SID_not_set'
        );
      } else {
        const add_result = await proxmox_client.ha_service.addResource({
          sid: ha_add_sid
        });
        console.info(
          `[example] ha_add_result sid=${ha_add_sid} task_id=${add_result.data.task_id}`
        );
      }

      const ha_update_sid =
        process.env.PROXMOX_EXAMPLE_CLUSTER_HA_UPDATE_SID?.trim() || undefined;
      if (ha_update_sid === undefined) {
        console.info(
          '[example] ha_update_skipped reason=PROXMOX_EXAMPLE_CLUSTER_HA_UPDATE_SID_not_set'
        );
      } else {
        const update_result = await proxmox_client.ha_service.updateResource({
          sid: ha_update_sid,
          state: process.env.PROXMOX_EXAMPLE_CLUSTER_HA_UPDATE_STATE?.trim() || 'started'
        });
        console.info(
          `[example] ha_update_result sid=${ha_update_sid} task_id=${update_result.data.task_id}`
        );
      }

      const ha_remove_sid =
        process.env.PROXMOX_EXAMPLE_CLUSTER_HA_REMOVE_SID?.trim() || undefined;
      if (ha_remove_sid === undefined) {
        console.info(
          '[example] ha_remove_skipped reason=PROXMOX_EXAMPLE_CLUSTER_HA_REMOVE_SID_not_set'
        );
      } else {
        const remove_result = await proxmox_client.ha_service.removeResource({
          sid: ha_remove_sid
        });
        console.info(
          `[example] ha_remove_result sid=${ha_remove_sid} task_id=${remove_result.data.task_id}`
        );
      }
    } catch (error) {
      if (error instanceof ProxmoxError) {
        console.error(
          `[example] cluster_ha_error code=${error.code} message=${error.message}`
        );
        if (error.details !== undefined) {
          console.error(
            `[example] cluster_ha_error_details=${RenderUnknown(error.details)}`
          );
        }
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
  }

  const dr_replication = await proxmox_client.dr_service.discoverReplicationCapabilities({
    node_id
  });
  console.info(
    `[example] dr_replication_supported=${dr_replication.data.supported} cluster_jobs=${dr_replication.data.cluster_jobs_count} node_jobs=${dr_replication.data.node_jobs_count}`
  );
  for (const check_record of dr_replication.data.checks) {
    console.info(
      `[example] dr_replication_check capability=${check_record.capability} supported=${check_record.supported} reason=${check_record.reason} status_code=${check_record.status_code ?? 'unknown'}`
    );
  }

  const dr_backup = await proxmox_client.dr_service.discoverBackupCapabilities({
    node_id
  });
  console.info(
    `[example] dr_backup_supported=${dr_backup.data.supported} schedule_count=${dr_backup.data.backup_schedule_count} backup_storage_count=${dr_backup.data.backup_storage_count} backup_storage_ids=${dr_backup.data.backup_storage_ids.join(',')}`
  );
  for (const check_record of dr_backup.data.checks) {
    console.info(
      `[example] dr_backup_check capability=${check_record.capability} supported=${check_record.supported} reason=${check_record.reason} status_code=${check_record.status_code ?? 'unknown'}`
    );
  }

  const dr_readiness = await proxmox_client.dr_service.checkDrReadiness({
    node_id,
    require_backup_storage: true,
    minimum_backup_storage_count: 1
  });
  console.info(
    `[example] dr_readiness_allowed=${dr_readiness.data.allowed} failed_checks=${dr_readiness.data.failed_checks}`
  );
  for (const check_record of dr_readiness.data.checks) {
    console.info(
      `[example] dr_readiness_check check=${check_record.check} passed=${check_record.passed} reason=${check_record.reason}`
    );
  }

  const maintenance_target_node_ids = cluster_candidate_node_ids.filter(
    (cluster_node_id) => cluster_node_id.toLowerCase() !== node_id.toLowerCase()
  );
  if (maintenance_target_node_ids.length === 0) {
    console.info(
      '[example] node_maintenance_plan_skipped reason=no_target_nodes_available'
    );
  } else {
    const maintenance_plan =
      await proxmox_client.helpers.prepareNodeMaintenance({
        node_id,
        target_node_ids: maintenance_target_node_ids,
        include_stopped: false,
        scoring_mode: planner_scoring_mode
      });
    console.info(
      `[example] node_maintenance_plan source_node=${maintenance_plan.data.source_node_id} targets=${maintenance_plan.data.target_node_ids.join(',')} checked=${maintenance_plan.data.checked_resource_count} selected=${maintenance_plan.data.selected_resource_count} blocked=${maintenance_plan.data.blocked_resource_count} candidates=${maintenance_plan.data.migration_candidate_count}`
    );
    for (const resource_record of maintenance_plan.data.resources) {
      console.info(
        `[example] node_maintenance_resource type=${resource_record.resource_type} id=${resource_record.resource_id} selected=${resource_record.selected_for_drain} blocked=${resource_record.blocked} reason=${resource_record.reason} target=${resource_record.target_node_id ?? 'none'}`
      );
    }
  }

  const run_node_drain_demo = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_NODE_DRAIN_RUN
  );
  const node_drain_dry_run =
    process.env.PROXMOX_EXAMPLE_NODE_DRAIN_DRY_RUN === undefined
      ? true
      : NormalizeBoolean(process.env.PROXMOX_EXAMPLE_NODE_DRAIN_DRY_RUN);
  const node_drain_target_node_ids =
    ResolveOptionalNodeIdList({
      raw_value: process.env.PROXMOX_EXAMPLE_NODE_DRAIN_TARGET_NODE_IDS,
      field_name: 'PROXMOX_EXAMPLE_NODE_DRAIN_TARGET_NODE_IDS'
    }) ?? maintenance_target_node_ids;
  if (!run_node_drain_demo) {
    console.info(
      '[example] node_drain_demo_skipped reason=PROXMOX_EXAMPLE_NODE_DRAIN_RUN_not_enabled'
    );
  } else if (!node_drain_dry_run && !execute_mutations) {
    console.info(
      '[example] node_drain_demo_skipped reason=PROXMOX_EXAMPLE_EXECUTE_MUTATIONS_not_enabled'
    );
  } else if (node_drain_target_node_ids.length === 0) {
    console.info(
      '[example] node_drain_demo_skipped reason=no_target_nodes_available'
    );
  } else {
    try {
      const node_drain_max_parallel =
        ResolveOptionalPositiveInteger({
          raw_value: process.env.PROXMOX_EXAMPLE_NODE_DRAIN_MAX_PARALLEL,
          field_name: 'PROXMOX_EXAMPLE_NODE_DRAIN_MAX_PARALLEL'
        }) ?? 2;
      const drain_result = await proxmox_client.helpers.drainNode({
        node_id,
        target_node_ids: node_drain_target_node_ids,
        include_stopped: false,
        dry_run: node_drain_dry_run,
        fail_fast: NormalizeBoolean(process.env.PROXMOX_EXAMPLE_NODE_DRAIN_FAIL_FAST),
        max_parallel_migrations: node_drain_max_parallel,
        wait_for_tasks: true,
        scoring_mode: planner_scoring_mode
      });
      console.info(
        `[example] node_drain_result dry_run=${drain_result.data.dry_run} requested=${drain_result.data.summary.requested} attempted=${drain_result.data.summary.attempted} succeeded=${drain_result.data.summary.succeeded} failed=${drain_result.data.summary.failed} skipped=${drain_result.data.summary.skipped}`
      );
      for (const migration_record of drain_result.data.migrations) {
        console.info(
          `[example] node_drain_migration type=${migration_record.resource_type} id=${migration_record.resource_id} source=${migration_record.source_node_id} target=${migration_record.target_node_id} submitted=${migration_record.submitted} success=${migration_record.success} task_id=${migration_record.task_id ?? 'none'}`
        );
      }
    } catch (error) {
      if (error instanceof ProxmoxError) {
        console.error(
          `[example] node_drain_error code=${error.code} message=${error.message}`
        );
        if (error.details !== undefined) {
          console.error(
            `[example] node_drain_error_details=${RenderUnknown(error.details)}`
          );
        }
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
  }

  const task_wait_targets = ResolveTaskWaitTargets({
    raw_value: process.env.PROXMOX_EXAMPLE_TASK_WAIT_TARGETS,
    fallback_node_id: node_id
  });
  if (task_wait_targets.length === 0) {
    console.info(
      '[example] task_wait_skipped reason=PROXMOX_EXAMPLE_TASK_WAIT_TARGETS_not_set'
    );
  } else {
    try {
      const task_wait_timeout_ms = ResolveOptionalPositiveInteger({
        raw_value: process.env.PROXMOX_EXAMPLE_TASK_WAIT_TIMEOUT_MS,
        field_name: 'PROXMOX_EXAMPLE_TASK_WAIT_TIMEOUT_MS'
      });
      const task_wait_poll_interval_ms = ResolveOptionalPositiveInteger({
        raw_value: process.env.PROXMOX_EXAMPLE_TASK_WAIT_POLL_INTERVAL_MS,
        field_name: 'PROXMOX_EXAMPLE_TASK_WAIT_POLL_INTERVAL_MS'
      });
      const task_wait_result = await proxmox_client.task_service.waitForTasks({
        tasks: task_wait_targets,
        fail_fast: NormalizeBoolean(process.env.PROXMOX_EXAMPLE_TASK_WAIT_FAIL_FAST),
        timeout_ms: task_wait_timeout_ms,
        poll_interval_ms: task_wait_poll_interval_ms
      });
      console.info(
        `[example] task_wait_summary requested=${task_wait_result.data.summary.requested} completed=${task_wait_result.data.summary.completed} succeeded=${task_wait_result.data.summary.succeeded} failed=${task_wait_result.data.summary.failed} pending=${task_wait_result.data.summary.pending}`
      );
      for (const task_record of task_wait_result.data.tasks) {
        console.info(
          `[example] task_wait_result node=${task_record.node_id} task_id=${task_record.task_id} completed=${task_record.completed} status=${task_record.status ?? 'unknown'} exit_status=${task_record.exit_status ?? 'unknown'} error=${task_record.error?.message ?? 'none'}`
        );
      }
    } catch (error) {
      if (error instanceof ProxmoxError) {
        console.error(
          `[example] task_wait_error code=${error.code} message=${error.message}`
        );
        if (error.details !== undefined) {
          console.error(
            `[example] task_wait_error_details=${RenderUnknown(error.details)}`
          );
        }
        LogErrorCauseChain(error);
      } else {
        throw error;
      }
    }
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
  if (
    download_volume_id === undefined ||
    download_destination_path === undefined
  ) {
    console.info(
      '[example] storage_download_skipped reason=PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_VOLUME_ID_or_PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_DESTINATION_PATH_not_set'
    );
  } else {
    const download_overwrite = NormalizeBoolean(
      process.env.PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_OVERWRITE
    );
    const download_result =
      await proxmox_client.storage_service.downloadContent({
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

  const skip_vm_create_start = NormalizeBoolean(
    process.env.PROXMOX_EXAMPLE_SKIP_VM_CREATE_START
  );
  if (skip_vm_create_start) {
    console.info(
      '[example] vm_create_start_skipped reason=PROXMOX_EXAMPLE_SKIP_VM_CREATE_START_enabled'
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
