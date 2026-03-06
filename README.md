# Proxmox SDK

TypeScript SDK for interacting with Proxmox VE clusters with typed service contracts, runtime config validation, and secure-by-default transport/auth behavior.

## What this library is

This SDK provides typed clients for common Proxmox domains:

- datacenter
- cluster
- pool
- node
- storage
- virtual machines (QEMU)
- containers (LXC)
- access/privilege introspection

Design goals:

- typed request/response contracts in TypeScript
- strict config parsing and validation at startup
- secure defaults (`verify_tls` enabled, explicit auth providers, redaction-oriented diagnostics)
- high-level helper composition for common workflows (for example, LXC create preflight + submit)

## Feature/capability matrix

### `datacenter_service` (`DatacenterService`)

- `getSummary`
- `getVersion`
- `listStorage`

### `cluster_service` (`ClusterService`)

- `getStatus`
- `getMembership`
- `listNodes`

### `pool_service` (`PoolService`)

- `listPools`
- `getPool`
- `listPoolResources`

### `node_service` (`NodeService`)

- `listNodes`
- `getNodeStatus`
- `listNetworkInterfaces`
- `listBridges`
- `getNetworkInterface`
- `getNodeCpuCapacity`
- `canAllocateCores`
- `getNodeMemoryCapacity`
- `getNodeMemoryAllocations`
- `canAllocateMemory`
- `getServices`
- `getNodeMetrics`
- `rebootNode` (with optional task polling)

### `vm_service` (`VmService`)

- `listVms`
- `getVm`
- `createVm`
- `updateVm`
- `cloneVm`
- `deleteVm`
- `startVm`
- `stopVm`
- `restartVm`
- `migrateVm`
- `waitForTask`

### `lxc_service` (`LxcService`)

- `listContainers`
- `getContainer`
- `createContainer`
- `updateContainer`
- `deleteContainer`
- `startContainer`
- `stopContainer`
- `migrateContainer`
- `snapshotContainer`
- `restoreContainer`
- `waitForTask`

### `helpers` (`ProxmoxHelpers`)

- `createLxcContainer` (high-level create/start orchestration with optional dry-run + preflight checks)

### `access_service` (`AccessService`)

- `getCurrentPermissions`
- `getIdentityPermissions`
- `hasCurrentPrivilege`
- `hasIdentityPrivilege`

### `storage_service` (`StorageService`)

- `listStorageContent`
- `listBackups`
- `listIsoImages`
- `listCtTemplates`
- `listTemplateCatalog`
- `deleteContent`
- `uploadContent`
- `downloadContent`
- `canAuditStorage`
- `canAllocateTemplate`
- `canAllocateSpace`
- `canModifyPermissions`

## Installation and requirements

Requirements:

- Node.js 18+ (Node.js 20 LTS recommended)
- TypeScript project (or Node runtime for JS usage)
- Network reachability to Proxmox hosts
- Proxmox API token with required ACLs
- CA trust configured for HTTPS (`ca_bundle_path` or system trust store)

Install:

```bash
npm install @opsimathically/proxmox
```

## Configuration model (`proxmoxlib.json`)

The client is built from:

- `profiles`: runtime behavior and selected cluster
- `clusters`: node inventory and auth definitions
- optional global blocks: `defaults`, `logging`, `security`

Transport/auth precedence:

1. runtime defaults (`defaults`)
2. profile overrides (`profiles[].transport_overrides`)
3. node-level overrides (`clusters[].nodes[].verify_tls`, `clusters[].nodes[].ca_bundle_path`)

`ResolveConfigPath` behavior:

- explicit `config_path` argument wins
- otherwise `PROXMOXLIB_CONFIG_PATH`
- otherwise fallback `~/environment_files/proxmoxlib.json`

Minimal realistic config:

```json
{
  "schema_version": 1,
  "active_profile": "default",
  "defaults": {
    "request_timeout_ms": 30000,
    "connect_timeout_ms": 8000,
    "keep_alive_ms": 30000,
    "user_agent": "proxmoxlib-sdk/1.0"
  },
  "profiles": [
    {
      "name": "default",
      "description": "Primary production profile",
      "cluster_id": "cluster-g75",
      "transport_overrides": {
        "verify_tls": true,
        "ca_bundle_path": "/home/tourist/environment_files/proxmoxlib/crypto/proxmox-internal-ca.pem"
      }
    }
  ],
  "clusters": [
    {
      "id": "cluster-g75",
      "name": "g75-cluster",
      "environment": "prod",
      "default_node": "g75",
      "nodes": [
        {
          "id": "g75",
          "hostname": "g75.domain",
          "host": "192.168.11.14",
          "protocol": "https",
          "port": 8006,
          "token_id": "root@pam!roottoken",
          "auth": {
            "provider": "env",
            "env_var": "PROXMOX_API_TOKEN"
          }
        }
      ]
    }
  ]
}
```

## Auth providers

Supported providers:

- `env`
- `file`
- `sops`
- `vault`

No other auth providers are currently supported.

### `env` provider

Required field:

- `auth.env_var`

Example:

```json
{
  "auth": {
    "provider": "env",
    "env_var": "PROXMOX_API_TOKEN"
  }
}
```

Security note:

- keep environment scopes minimal and avoid printing env values in logs.

### `file` provider

Required field:

- `auth.file_path`

Example:

```json
{
  "auth": {
    "provider": "file",
    "file_path": "/etc/proxmox/secrets/pve-api-token"
  }
}
```

Security note:

- keep token files least-privileged (for example `0600`) and never commit them.

### `sops` provider

Required field:

- `auth.secret_ref` (filesystem path to SOPS-encrypted token file)

Example:

```json
{
  "auth": {
    "provider": "sops",
    "secret_ref": "/etc/proxmox/secrets/pve-api-token.enc"
  }
}
```

Security note:

- ensure only trusted principals can decrypt the SOPS file.

### `vault` provider

Required field:

- `auth.secret_ref` in `kv/data/<path>#<field>` format

Example:

```json
{
  "auth": {
    "provider": "vault",
    "secret_ref": "kv/data/proxmox/node-a#token"
  }
}
```

Vault environment requirements:

- `VAULT_ADDR` (required)
- `VAULT_TOKEN` (required)
- `VAULT_NAMESPACE` (optional)
- `VAULT_CACERT` (optional)
- `VAULT_SKIP_VERIFY` (optional, dev-only)

## TLS and certificate behavior

- `verify_tls` defaults to `true`.
- `ca_bundle_path` is applied directly by SDK transport for HTTPS requests.
- if `ca_bundle_path` is unset, the system trust store is used.
- `NODE_EXTRA_CA_CERTS` is optional process-level fallback and is not required when `ca_bundle_path` is configured correctly.

Troubleshooting checklist:

1. confirm node `host`/`port` and network reachability.
2. verify cert chain with `openssl s_client ... -CAfile <bundle>`.
3. ensure `ca_bundle_path` points to a readable PEM file.
4. if hostname validation fails, check certificate SAN/CN vs requested host.
5. only for trusted local debugging, temporarily set `verify_tls: false`.

## Usage examples

### Initialize client with explicit config path

```ts
import { ProxmoxClient } from '@opsimathically/proxmox';

const client = ProxmoxClient.fromPath({
  config_path: '/home/tourist/environment_files/proxmoxlib.json',
  profile_name: 'default'
});
```

### Startup diagnostics

```ts
const client = ProxmoxClient.fromPath({
  config_path: '/home/tourist/environment_files/proxmoxlib.json',
  emit_startup_diagnostics: true
});
```

You can also set:

```bash
PROXMOXLIB_STARTUP_DIAGNOSTICS=true
```

### List nodes

```ts
const nodes = await client.node_service.listNodes();
for (const node of nodes.data) {
  console.log(node.node, node.status);
}
```

### Node network interfaces and bridge discovery

```ts
const interfaces = await client.node_service.listNetworkInterfaces({
  node_id: 'g75'
});

const bridges = await client.node_service.listBridges({
  node_id: 'g75'
});

for (const iface of interfaces.data) {
  console.log(iface.interface_id, iface.type, iface.active, iface.is_bridge);
}

for (const bridge of bridges.data) {
  console.log(bridge.interface_id, bridge.type, bridge.bridge_ports);
}

const vmbr0 = await client.node_service.getNetworkInterface({
  node_id: 'g75',
  interface_id: 'vmbr0'
});
console.log(vmbr0.data.interface_id, vmbr0.data.cidr);
```

Note:

- bridge availability is node-scoped; query the node where VM/LXC creation will occur.
- `listBridges` includes Linux bridges (`bridge`) and OVS bridges (`OVSBridge`) when present.

### Node CPU capacity and core preflight

```ts
const cpu_capacity = await client.node_service.getNodeCpuCapacity({
  node_id: 'g75'
});

const core_preflight = await client.node_service.canAllocateCores({
  node_id: 'g75',
  requested_cores: 4,
  mode: 'logical'
});

console.log(cpu_capacity.data.logical_cpu_count);
console.log(cpu_capacity.data.physical_core_count);
console.log(core_preflight.data.allowed, core_preflight.data.reason);
```

Note:

- Proxmox can allow oversubscription depending on workload and policy.
- `canAllocateCores` is a caller-side preflight helper; it does not enforce server-side limits automatically.

### Node memory capacity, allocations, and memory preflight

```ts
const memory_capacity = await client.node_service.getNodeMemoryCapacity({
  node_id: 'g75'
});

const memory_allocations = await client.node_service.getNodeMemoryAllocations({
  node_id: 'g75',
  include_stopped: false
});

const memory_preflight = await client.node_service.canAllocateMemory({
  node_id: 'g75',
  requested_memory_bytes: 2 * 1024 * 1024 * 1024,
  mode: 'free_headroom'
});

console.log(memory_capacity.data.total_memory_bytes);
console.log(memory_capacity.data.used_memory_bytes);
console.log(memory_capacity.data.free_memory_bytes);
console.log(memory_allocations.data.allocated_memory_bytes_total);
console.log(memory_preflight.data.allowed, memory_preflight.data.reason);
```

Note:

- `mode: "free_headroom"` compares requested bytes against node free memory telemetry.
- `mode: "allocated_headroom"` compares requested bytes against `(node_total - summed_resource_limits)`.
- If telemetry is incomplete, `canAllocateMemory` returns `reason: "capacity_unknown"` so callers can apply their own policy.

### List/read resource pools

```ts
const pools = await client.pool_service.listPools();

for (const pool of pools.data) {
  console.log(pool.pool_id, pool.comment);
}

if (pools.data.length > 0) {
  const pool_id = pools.data[0].pool_id;
  const pool_detail = await client.pool_service.getPool({ pool_id });
  const pool_resources = await client.pool_service.listPoolResources({ pool_id });
  console.log(pool_detail.data.pool_id, pool_resources.data.length);
}
```

### List/read VMs

```ts
const vm_list = await client.vm_service.listVms({ node_id: 'g75' });

if (vm_list.data.length > 0) {
  const vm_id = vm_list.data[0].vmid as string | number;
  const vm = await client.vm_service.getVm({
    node_id: 'g75',
    vm_id
  });
  console.log(vm.data);
}
```

### List/read containers

```ts
const container_list = await client.lxc_service.listContainers({
  node_id: 'g75'
});

if (container_list.data.length > 0) {
  const container_id = container_list.data[0].vmid as string | number;
  const container = await client.lxc_service.getContainer({
    node_id: 'g75',
    container_id
  });
  console.log(container.data);
}
```

### High-level LXC creation helper

```ts
const helper_preview = await client.helpers.createLxcContainer({
  general: {
    node_id: 'g75',
    container_id: 9100,
    hostname: 'app-lxc-9100.local',
    resource_pool: 'default',
    unprivileged_container: true,
    nesting: true,
    add_to_ha: false,
    tags: ['app', 'preview']
  },
  template: {
    storage: 'local',
    template: 'local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst'
  },
  disks: {
    storage: 'local-lvm',
    disk_size_gib: 8
  },
  cpu: {
    cores: 2,
    cpu_limit: 'unlimited',
    cpu_units: 100
  },
  memory: {
    memory_mib: 1024,
    swap_mib: 512
  },
  network: {
    name: 'eth0',
    bridge: 'vmbr0',
    ipv4_mode: 'dhcp',
    ipv6_mode: 'dhcp'
  },
  dns: {
    dns_domain: 'domain.local',
    dns_servers: ['1.1.1.1', '8.8.8.8']
  },
  preflight: {
    enabled: true,
    enforce: false,
    check_cpu: true,
    check_memory: true
  },
  dry_run: true,
  start_after_created: false
});

console.log(helper_preview.data.preflight);
console.log(helper_preview.data.config);
```

To actually create and optionally start the container, set `dry_run: false`.
`start_after_created: true` triggers a follow-up `startContainer` call after create succeeds.
If `general.add_to_ha: true`, the helper attempts HA registration via `/cluster/ha/resources` and returns a typed validation error when HA is unavailable in the current cluster context.

### Storage content operations (backups/ISO/templates)

`listCtTemplates` returns template files already present on the selected storage.
`listTemplateCatalog` returns the available CT template catalog metadata from Proxmox appliance sources.

```ts
const backups = await client.storage_service.listBackups({
  node_id: 'g75',
  storage: 'local'
});

const iso_images = await client.storage_service.listIsoImages({
  node_id: 'g75',
  storage: 'local'
});

const ct_templates = await client.storage_service.listCtTemplates({
  node_id: 'g75',
  storage: 'local'
});

const template_catalog = await client.storage_service.listTemplateCatalog({
  node_id: 'g75',
  section: 'system'
});

for (const item of template_catalog.data) {
  console.log(
    item.package,
    item.version,
    item.type,
    item.section,
    item.description
  );
}
```

```ts
const uploaded = await client.storage_service.uploadContent({
  node_id: 'g75',
  storage: 'local',
  content_type: 'iso',
  file_path: '/tmp/debian-12.iso'
});

const downloaded = await client.storage_service.downloadContent({
  node_id: 'g75',
  storage: 'local',
  volume_id: 'local:iso/debian-12.iso',
  destination_path: '/tmp/debian-12-downloaded.iso',
  overwrite: false
});

const deleted = await client.storage_service.deleteContent({
  node_id: 'g75',
  storage: 'local',
  volume_id: 'local:iso/debian-12.iso'
});
```

```ts
const can_template = await client.storage_service.canAllocateTemplate({
  node_id: 'g75',
  storage: 'local'
});

const can_modify_storage_perms =
  await client.storage_service.canModifyPermissions({
    node_id: 'g75',
    storage: 'local',
    auth_id: 'root@pam!audited-token'
  });
```

Storage endpoint caveat (v1):

- `downloadContent` uses `GET /nodes/<node>/storage/<storage>/download?volume=<volid>`.
- `listTemplateCatalog` uses `GET /nodes/<node>/aplinfo` (optional `section` query).
- Proxmox behavior can vary by version/plugin; validate compatibility in your environment.

### Safe mutation flow behind explicit guard

```ts
const execute_mutations = ['1', 'true', 'yes', 'on'].includes(
  (process.env.PROXMOX_EXAMPLE_EXECUTE_MUTATIONS ?? '').toLowerCase()
);

if (execute_mutations) {
  const can_power = await client.access_service.hasCurrentPrivilege({
    path: '/vms/200',
    privilege: 'VM.PowerMgmt'
  });

  if (!can_power.data.allowed) {
    throw new Error('Missing VM.PowerMgmt on /vms/200');
  }

  await client.vm_service.startVm({
    node_id: 'g75',
    vm_id: 200
  });
}
```

`example.ts` env vars:

- `PROXMOXLIB_PROFILE` (optional profile override)
- `PROXMOX_EXAMPLE_NODE_ID` (optional preferred node override)
- `PROXMOX_EXAMPLE_POOL_ID` (optional pool ID for `getPool`/`listPoolResources` example)
- `PROXMOX_EXAMPLE_VM_ID` (optional VM ID for VM path selection/create flow)
- `PROXMOX_EXAMPLE_VM_NAME` (optional VM name for create flow)
- `PROXMOX_EXAMPLE_PERMISSION_TARGET_AUTH_ID` (optional auth ID for target identity permission checks)
- `PROXMOX_EXAMPLE_EXECUTE_MUTATIONS` (set true to enable mutation examples)
- `PROXMOX_EXAMPLE_STORAGE_ID` (default: `local`)
- `PROXMOX_EXAMPLE_REQUESTED_CORES` (optional positive integer for `canAllocateCores` preflight example)
- `PROXMOX_EXAMPLE_REQUESTED_MEMORY_BYTES` (optional positive integer for `canAllocateMemory` preflight examples)
- `PROXMOX_EXAMPLE_STORAGE_BACKUP_VMID` (optional `listBackups` filter)
- `PROXMOX_EXAMPLE_TEMPLATE_CATALOG_SECTION` (optional `listTemplateCatalog` section filter)
- `PROXMOX_EXAMPLE_STORAGE_UPLOAD_FILE_PATH` (enables upload example when mutations enabled)
- `PROXMOX_EXAMPLE_STORAGE_UPLOAD_CONTENT_TYPE` (`iso` or `vztmpl`, optional)
- `PROXMOX_EXAMPLE_STORAGE_UPLOAD_FILENAME` (optional)
- `PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_VOLUME_ID` + `PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_DESTINATION_PATH` (both required to enable download example)
- `PROXMOX_EXAMPLE_STORAGE_DOWNLOAD_OVERWRITE` (optional boolean)
- `PROXMOX_EXAMPLE_STORAGE_DELETE_VOLUME_ID` + `PROXMOX_EXAMPLE_STORAGE_ALLOW_DELETE=true` (both required to enable delete example)
- `PROXMOX_EXAMPLE_LXC_HELPER_CONTAINER_ID` (optional container ID for helper dry-run preview, default: `9100`)
- `PROXMOX_EXAMPLE_LXC_HELPER_HOSTNAME` (optional hostname for helper dry-run preview)

### Permission introspection (current identity)

```ts
const root_permissions = await client.access_service.getCurrentPermissions({
  path: '/'
});

const can_audit_vms = await client.access_service.hasCurrentPrivilege({
  path: '/vms',
  privilege: 'VM.Audit'
});

console.log(root_permissions.data.privileges);
console.log(can_audit_vms.data.allowed);
```

### Permission introspection (target identity, admin scenario)

```ts
import { ProxmoxAuthError } from '@opsimathically/proxmox';

const target_auth_id = process.env.PROXMOX_EXAMPLE_PERMISSION_TARGET_AUTH_ID;
if (target_auth_id) {
  try {
    const target_permissions =
      await client.access_service.getIdentityPermissions({
        path: '/vms',
        auth_id: target_auth_id
      });

    const target_can_power = await client.access_service.hasIdentityPrivilege({
      path: '/vms/200',
      auth_id: target_auth_id,
      privilege: 'VM.PowerMgmt'
    });

    console.log(target_permissions.data.privileges);
    console.log(target_can_power.data.allowed);
  } catch (error) {
    if (error instanceof ProxmoxAuthError && error.status_code === 403) {
      console.warn('Not authorized to inspect target identity permissions.');
    } else {
      throw error;
    }
  }
}
```

## Error handling guide

Primary error types:

- `ProxmoxValidationError`: invalid inputs/config shape or missing required fields
- `ProxmoxAuthError`: auth failures, missing tokens, unauthorized responses (401/403)
- `ProxmoxTimeoutError`: request timeout
- `ProxmoxTransportError`: connection/certificate/network-level failures
- `ProxmoxHttpError`: non-auth HTTP API failures (4xx/5xx mapping)
- `ProxmoxNotFoundError`, `ProxmoxConflictError`, `ProxmoxRateLimitError`, `ProxmoxTaskError`: specialized HTTP/task classes
- `ProxmoxError`: base class (includes `.code`, `.details`, optional `.cause`)

Concise safe handling pattern:

```ts
import {
  ProxmoxClient,
  ProxmoxError,
  ProxmoxAuthError,
  ProxmoxTimeoutError
} from '@opsimathically/proxmox';

try {
  const client = ProxmoxClient.fromPath({
    config_path: '/home/tourist/environment_files/proxmoxlib.json'
  });
  await client.node_service.listNodes();
} catch (error) {
  if (error instanceof ProxmoxAuthError) {
    console.error('Auth failed:', error.code);
  } else if (error instanceof ProxmoxTimeoutError) {
    console.error('Request timeout:', error.code);
  } else if (error instanceof ProxmoxError) {
    console.error('Proxmox error:', error.code, error.details);
  } else {
    console.error('Unexpected error');
  }
}
```

## Testing and development workflow

Run tests:

```bash
npm test
```

Build/package:

```bash
npm run build
```

Schema generation:

```bash
npm run ts-to-zod
```

Docs:

```bash
npm run docs
```

Test coverage structure (high level):

- `test/config/*`: config validation, diagnostics, secret resolution
- `test/core/*`: transport, retry, auth factory, request construction
- `test/services/*`: VM/LXC/access/storage/pool service contracts and request behavior
- `test/errors/*`: HTTP-to-typed-error mapping

## Security best practices

- use least-privilege Proxmox roles for routine automation tokens.
- separate read-only tokens from mutation-capable tokens.
- rotate API tokens on a defined schedule.
- store tokens in external secret sources (`env`, `file`, `sops`, `vault`), not source code.
- keep file-based secrets permissioned to least privilege (`0600` recommended).
- do not log raw authorization headers or token values.
- use `ca_bundle_path` for private/internal CAs instead of disabling TLS verification.

## Public package surface

Exports include:

- config helpers: `LoadConfig`, `ValidateConfig`, `ResolveProfile`, `ResolveSecrets`, `BuildConfigDiagnostics`, `EmitStartupDiagnostics`, `ResolveConfigPath`
- client: `ProxmoxClient`
- services: `DatacenterService`, `ClusterService`, `PoolService`, `NodeService`, `VmService`, `LxcService`, `AccessService`, `StorageService`
- helpers: `LxcHelper`, `ProxmoxHelpers`
- shared config/http/service types
- typed error classes and HTTP error mapper

## Project Status and Risk Notice

This repository is maintained primarily for the author’s own operational and development needs.
Stability is not guaranteed, and interfaces/behavior may change at any time without notice.
If you choose to use this code, you do so at your own risk.
