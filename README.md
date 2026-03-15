# Proxmox SDK

TypeScript SDK for interacting with Proxmox VE clusters with typed service contracts, runtime config validation, and secure-by-default transport/auth behavior.

## What changed

- LXC shell operations are now SSH-only via backend mode `ssh_pct`.
- One-off command execution runs through `pct exec`.
- Interactive shell sessions run through `pct enter` with PTY lifecycle methods.
- Legacy `termproxy`/`vncwebsocket` terminal paths are removed.
- Legacy `privileged_fallback` / `node_execute` fallback config is removed from active SDK flow.
- API auth for non-shell SDK services remains unchanged (token/session providers).

## Architecture overview

This SDK provides typed clients for common Proxmox domains:

- datacenter
- cluster
- pool
- node
- storage
- virtual machines (QEMU)
- containers (LXC)
- access/privilege introspection
- HA resource management
- multi-task orchestration
- replication/backup readiness discovery

Design goals:

- typed request/response contracts in TypeScript
- strict config parsing and validation at startup
- secure defaults (`verify_tls` enabled, explicit auth providers, redaction-oriented diagnostics)
- high-level helper composition for common workflows (for example, cluster preflight/placement, LXC create/destroy, maintenance planning)

Runtime layers:

- config layer: schema parsing, profile/cluster/node resolution, secret-source wiring
- transport layer: typed request execution, timeout/retry policy, typed error mapping
- domain service layer: datacenter/cluster/node/vm/lxc/access/storage/ha/task/dr APIs
- shell layer: SSH-only `ssh_pct` backend for LXC command/session control (`pct exec`, `pct enter`)
- expect layer: deterministic send/wait/branch workflows over interactive terminal sessions

## Feature/capability matrix

### `datacenter_service` (`DatacenterService`)

- `getSummary`
- `getVersion`
- `listStorage`

### `cluster_service` (`ClusterService`)

- `getStatus`
- `getMembership`
- `listNodes`
- `allocateNextId`
- `checkStorageCompatibility`
- `checkBridgeCompatibility`

### `pool_service` (`PoolService`)

- `listPools`
- `getPool`
- `listPoolResources`

### `ha_service` (`HaService`)

- `listResources`
- `addResource`
- `updateResource`
- `removeResource`
- `listGroups`

### `task_service` (`TaskService`)

- `waitForTasks`

### `dr_service` (`DrService`)

- `discoverReplicationCapabilities`
- `discoverBackupCapabilities`
- `checkDrReadiness`

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
- `runCommand` (SSH `pct exec`)
- `openTerminalSession` (SSH `pct enter`)
- `sendTerminalInput`
- `resizeTerminal`
- `readTerminalEvents`
- `getTerminalSession`
- `closeTerminalSession`
- `waitForTask`

### LXC shell capabilities (SSH-only)

- one-off command execution: `runCommand`
- interactive terminal lifecycle:
  - `openTerminalSession`
  - `sendTerminalInput`
  - `resizeTerminal`
  - `readTerminalEvents`
  - `getTerminalSession`
  - `closeTerminalSession`

LXC shell methods require node config with `shell_backend: "ssh_pct"` and valid `ssh_shell`.

### `helpers` (`ProxmoxHelpers`)

- `createLxcContainer` (high-level create/start orchestration with optional dry-run + preflight checks)
- `teardownAndDestroyLxcContainer` (high-level stop/delete orchestration with optional dry-run + preflight checks)
- `createLxcContainersBulk` (high-level bulk create orchestration with deterministic ID/hostname generation)
- `teardownAndDestroyLxcContainersBulk` (high-level bulk destroy orchestration with stop/delete flow)
- `preflightLxcCreateCluster` (cluster candidate analysis/ranking for LXC placement)
- `planLxcPlacement` (cluster-aware LXC placement ranking across candidate nodes)
- `planVmPlacement` (cluster-aware VM placement ranking across candidate nodes)
- `migrateLxcWithPreflight` (compatibility/permission preflight + LXC migrate orchestration)
- `migrateVmWithPreflight` (compatibility/permission preflight + VM migrate orchestration)
- `prepareNodeMaintenance` (read-only maintenance planning for node drain workflows)
- `drainNode` (guarded node drain execution with dry-run default)

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

### SSH shell backend node configuration

Use this under each node that should support LXC command/shell control:

```json
{
  "id": "g75",
  "host": "192.168.11.252",
  "protocol": "https",
  "port": 8006,
  "token_id": "root@pam!roottoken",
  "auth": {
    "provider": "file",
    "file_path": "/home/tourist/environment_files/proxmoxlib/api.key"
  },
  "shell_backend": "ssh_pct",
  "ssh_shell": {
    "host": "192.168.11.252",
    "port": 22,
    "username": "root",
    "password_auth": {
      "provider": "env",
      "env_var": "PROXMOX_NODE_SSH_PASSWORD"
    },
    "connect_timeout_ms": 10000,
    "command_timeout_ms": 60000,
    "idle_timeout_ms": 180000,
    "strict_host_key": true
  }
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

### Cluster compatibility and candidate preflight

```ts
const candidate_nodes = ['node-a', 'node-b', 'node-c'];

const next_lxc_id = await client.cluster_service.allocateNextId({
  resource_type: 'lxc'
});

const storage_compat = await client.cluster_service.checkStorageCompatibility({
  node_ids: candidate_nodes,
  required_content: 'rootdir',
  storage_id: 'local-lvm'
});

const bridge_compat = await client.cluster_service.checkBridgeCompatibility({
  node_ids: candidate_nodes,
  bridge: 'vmbr0'
});

const lxc_cluster_preflight = await client.helpers.preflightLxcCreateCluster({
  create_input: {
    general: {
      node_id: 'node-a',
      container_id: 9100,
      hostname: 'cluster-lxc-9100.local'
    },
    template: {
      storage: 'local',
      template: 'local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst'
    },
    disks: {
      storage: 'local-lvm',
      disk_size_gib: 8
    },
    network: {
      bridge: 'vmbr0',
      ipv4_mode: 'dhcp',
      ipv6_mode: 'dhcp'
    }
  },
  candidate_node_ids: candidate_nodes,
  strict_permissions: false
});

console.log(next_lxc_id.data.next_id, next_lxc_id.data.source);
console.log(storage_compat.data.compatible_nodes);
console.log(bridge_compat.data.compatible_nodes);
console.log(lxc_cluster_preflight.data.recommended_node_id);
```

Notes:

- `allocateNextId` first tries `/cluster/nextid`, then falls back to scanning `/cluster/resources` when next-id is unavailable.
- next-id allocation is advisory and can race under concurrent creates; always handle create-time conflicts.
- compatibility checks are node-scoped and evaluate only the `node_ids` you provide.
- if your runtime config contains only a subset of cluster nodes, helper workflows that derive candidate nodes from config/discovery can be similarly scoped.
- `preflightLxcCreateCluster` is read-only and performs no mutation calls.

### Cluster placement planners (read-only)

```ts
const lxc_plan = await client.helpers.planLxcPlacement({
  required_storage_id: 'local-lvm',
  template_storage_id: 'local',
  required_bridge: 'vmbr0',
  requested_cores: 2,
  requested_memory_bytes: 2 * 1024 * 1024 * 1024,
  candidate_node_ids: ['node-a', 'node-b', 'node-c'],
  scoring_mode: 'balanced',
  strict_permissions: false
});

const vm_plan = await client.helpers.planVmPlacement({
  required_storage_id: 'local-lvm',
  required_bridge: 'vmbr0',
  requested_cores: 4,
  requested_memory_bytes: 4 * 1024 * 1024 * 1024,
  candidate_node_ids: ['node-a', 'node-b', 'node-c'],
  scoring_mode: 'capacity_first'
});

console.log(lxc_plan.data.recommended_node_id, lxc_plan.data.candidates.length);
console.log(vm_plan.data.recommended_node_id, vm_plan.data.candidates.length);
```

### Cluster migration helpers with preflight

```ts
const lxc_migration = await client.helpers.migrateLxcWithPreflight({
  node_id: 'node-a',
  container_id: 200,
  target_node_id: 'node-b',
  required_storage_id: 'local-lvm',
  required_bridge: 'vmbr0',
  migrate_volumes: true,
  wait_for_task: true,
  scoring_mode: 'balanced'
});

const vm_migration = await client.helpers.migrateVmWithPreflight({
  node_id: 'node-a',
  vm_id: 9000,
  target_node_id: 'node-c',
  required_storage_id: 'local-lvm',
  required_bridge: 'vmbr0',
  online: true,
  wait_for_task: true,
  scoring_mode: 'balanced'
});

console.log(lxc_migration.data.preflight.reason, lxc_migration.data.migration_task?.task_id);
console.log(vm_migration.data.preflight.reason, vm_migration.data.migration_task?.task_id);
```

Notes:

- migration helpers are mutation operations and should be guarded behind explicit runtime toggles.
- preflight failures return typed validation errors before migration is submitted.
- no hidden migration retries are applied by these helper wrappers.

### HA management service

```ts
const ha_resources = await client.ha_service.listResources();
const ha_groups = await client.ha_service.listGroups();

const add_result = await client.ha_service.addResource({
  sid: 'ct:9100'
});

const update_result = await client.ha_service.updateResource({
  sid: 'ct:9100',
  state: 'started'
});

const remove_result = await client.ha_service.removeResource({
  sid: 'ct:9100'
});

console.log(ha_resources.data.length, ha_groups.data.length);
console.log(add_result.data.task_id, update_result.data.task_id, remove_result.data.task_id);
```

HA caveat:

- HA endpoints can be unavailable in non-HA cluster contexts; `ha_service` maps those cases to typed validation errors with actionable context.

### Multi-task orchestration

```ts
const task_wait = await client.task_service.waitForTasks({
  tasks: [
    { node_id: 'node-a', task_id: 'UPID:node-a:...' },
    { node_id: 'node-b', task_id: 'UPID:node-b:...' }
  ],
  fail_fast: false,
  timeout_ms: 600000,
  poll_interval_ms: 1500,
  max_parallel_tasks: 3
});

console.log(task_wait.data.summary);
```

Notes:

- this helper waits across many tasks and returns both per-task records and aggregate summary.
- `fail_fast: true` marks remaining tasks as skipped after the first failed poll result.
- `waitForTasks` requires task polling to be enabled in profile/runtime configuration.

### Node maintenance planning and drain helper

```ts
const maintenance_plan = await client.helpers.prepareNodeMaintenance({
  node_id: 'node-a',
  target_node_ids: ['node-b', 'node-c'],
  include_stopped: false,
  scoring_mode: 'balanced'
});

console.log(maintenance_plan.data.migration_candidate_count);
```

```ts
const drain_preview = await client.helpers.drainNode({
  node_id: 'node-a',
  target_node_ids: ['node-b', 'node-c'],
  dry_run: true,
  max_parallel_migrations: 2,
  fail_fast: false
});

console.log(drain_preview.data.summary);
```

Drain safety notes:

- `dry_run` defaults to `true` and should be used first.
- mutating drains require explicit `dry_run: false`.
- node reboot is never automatic unless `reboot_after_drain: true` and `allow_reboot: true` are both provided.

### Replication / DR discovery foundations

```ts
const replication = await client.dr_service.discoverReplicationCapabilities({
  node_id: 'node-a'
});

const backup = await client.dr_service.discoverBackupCapabilities({
  node_id: 'node-a'
});

const dr_readiness = await client.dr_service.checkDrReadiness({
  node_id: 'node-a',
  require_backup_storage: true,
  minimum_backup_storage_count: 1
});

console.log(replication.data.supported, backup.data.supported, dr_readiness.data.allowed);
```

DR caveat:

- replication/backup endpoints can vary by Proxmox version/context; capability checks report typed unsupported results instead of brittle hard failures.

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

Mutation guard pattern:

```ts
const execute_mutations = ['1', 'true', 'yes', 'on'].includes(
  (process.env.PROXMOX_EXAMPLE_EXECUTE_MUTATIONS ?? '').toLowerCase()
);

if (!execute_mutations) {
  console.log('LXC helper mutation skipped');
} else {
  await client.helpers.createLxcContainer({
    /* real create input */
    dry_run: false
  });
}
```

### High-level LXC teardown-and-destroy helper

```ts
const destroy_operation = await client.helpers.teardownAndDestroyLxcContainer({
  node_id: 'g75',
  container_id: 9100,
  stop_first: true,
  wait_for_tasks: true,
  ignore_not_found: true,
  dry_run: false
});

console.log(
  destroy_operation.data.stopped,
  destroy_operation.data.deleted,
  destroy_operation.data.ignored_not_found
);
```

Notes:

- `ignore_not_found: true` makes repeated destroy calls idempotent for already-absent containers.
- `dry_run: true` returns planned destroy metadata without mutating state.
- when `stop_first` is enabled, running containers are stopped before delete.
- This operation is destructive and permanently removes the container.

### High-level bulk LXC helpers

```ts
const bulk_create = await client.helpers.createLxcContainersBulk({
  base_input: {
    general: {
      node_id: 'g75',
      container_id: 9400,
      hostname: 'sdk-bulk.local'
    },
    template: {
      storage: 'local',
      template: 'local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst'
    },
    disks: {
      storage: 'local-lvm',
      disk_size_gib: 8
    },
    network: {
      bridge: 'vmbr0',
      ipv4_mode: 'dhcp',
      ipv6_mode: 'dhcp'
    }
  },
  count: 10,
  container_id_start: 9400,
  hostname_strategy: {
    template: 'sdk-bulk-{container_id}.local'
  },
  wait_for_tasks: true,
  continue_on_error: true,
  dry_run: false
});

console.log(bulk_create.data.summary);
```

```ts
const bulk_destroy = await client.helpers.teardownAndDestroyLxcContainersBulk({
  node_id: 'g75',
  container_id_list: [9400, 9401, 9402, 9403],
  count: 4,
  stop_first: true,
  ignore_not_found: true,
  wait_for_tasks: true,
  continue_on_error: true,
  dry_run: false
});

console.log(bulk_destroy.data.summary);
```

Bulk caution:

- Bulk create/destroy operations can mutate many resources quickly. Use `dry_run: true` first and scope IDs carefully.

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
- `PROXMOX_EXAMPLE_LXC_CLUSTER_PREFLIGHT_STRICT_PERMISSIONS` (optional boolean to enforce permission-denied as hard preflight failures)
- `PROXMOX_EXAMPLE_PLANNER_SCORING_MODE` (optional `balanced`, `capacity_first`, or `strict`)
- `PROXMOX_EXAMPLE_CLUSTER_MIGRATION_TARGET_NODE_ID` (required for migration demos)
- `PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_RUN` (set true to run LXC migration helper demo)
- `PROXMOX_EXAMPLE_CLUSTER_MIGRATION_LXC_ID` (optional LXC ID for migration; falls back to first discovered LXC)
- `PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_RUN` (set true to run VM migration helper demo)
- `PROXMOX_EXAMPLE_CLUSTER_MIGRATION_VM_ID` (optional VM ID for migration; falls back to first discovered VM)
- `PROXMOX_EXAMPLE_CLUSTER_HA_RUN` (set true to run HA service demo block)
- `PROXMOX_EXAMPLE_CLUSTER_HA_ADD_SID` (optional HA resource SID for add demo, example `ct:9100`)
- `PROXMOX_EXAMPLE_CLUSTER_HA_UPDATE_SID` (optional HA resource SID for update demo)
- `PROXMOX_EXAMPLE_CLUSTER_HA_UPDATE_STATE` (optional HA update state, default: `started`)
- `PROXMOX_EXAMPLE_CLUSTER_HA_REMOVE_SID` (optional HA resource SID for remove demo)
- `PROXMOX_EXAMPLE_NODE_DRAIN_RUN` (set true to run `helpers.drainNode` demo block)
- `PROXMOX_EXAMPLE_NODE_DRAIN_DRY_RUN` (optional boolean, default: `true`)
- `PROXMOX_EXAMPLE_NODE_DRAIN_TARGET_NODE_IDS` (optional comma-separated target nodes for drain, e.g. `node-b,node-c`)
- `PROXMOX_EXAMPLE_NODE_DRAIN_MAX_PARALLEL` (optional positive integer migration concurrency)
- `PROXMOX_EXAMPLE_NODE_DRAIN_FAIL_FAST` (optional boolean)
- `PROXMOX_EXAMPLE_TASK_WAIT_TARGETS` (optional comma-separated task targets; `task_id` or `node_id:task_id`)
- `PROXMOX_EXAMPLE_TASK_WAIT_TIMEOUT_MS` (optional positive integer timeout for `task_service.waitForTasks`)
- `PROXMOX_EXAMPLE_TASK_WAIT_POLL_INTERVAL_MS` (optional positive integer poll interval for `task_service.waitForTasks`)
- `PROXMOX_EXAMPLE_TASK_WAIT_FAIL_FAST` (optional boolean)
- `PROXMOX_EXAMPLE_LXC_DESTROY_RUN` (set true to run helper destroy demo)
- `PROXMOX_EXAMPLE_LXC_DESTROY_CONTAINER_ID` (optional destroy target; falls back to helper-created container when available)
- `PROXMOX_EXAMPLE_LXC_DESTROY_DRY_RUN` (optional destroy dry-run toggle)
- `PROXMOX_EXAMPLE_LXC_EXPECT_SMOKE_RUN` (set true to run `lxc_expect_service.runScript` smoke flow against the configured LXC smoke target)
- `PROXMOX_EXAMPLE_LXC_SMOKE_RUN` (optional boolean, default: `true`, enables non-destructive LXC shell smoke flow)
- `PROXMOX_EXAMPLE_LXC_SMOKE_NODE_ID` (optional smoke node override, default: `g75`)
- `PROXMOX_EXAMPLE_LXC_SMOKE_CONTAINER_ID` (optional smoke container override, default: `100`)
- `PROXMOX_EXAMPLE_LXC_SMOKE_TIMEOUT_MS` (optional positive integer timeout for smoke operations, default: `30000`)
- `PROXMOX_NODE_SSH_PASSWORD` (required when `ssh_shell.password_auth.provider` is `env`)
- `PROXMOX_EXAMPLE_LXC_BULK_RUN` (set true to run bulk helper demo)
- `PROXMOX_EXAMPLE_LXC_BULK_COUNT` (bulk batch size, default: `10`)
- `PROXMOX_EXAMPLE_LXC_BULK_START_ID` (bulk start container ID, default: `9400`)
- `PROXMOX_EXAMPLE_LXC_BULK_DRY_RUN` (optional bulk create/destroy dry-run toggle)
- `PROXMOX_EXAMPLE_LXC_BULK_DESTROY_RUN` (set true to run bulk destroy after bulk create)
- `PROXMOX_EXAMPLE_SKIP_VM_CREATE_START` (optional skip for VM create/start mutation demo)

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

## LXC command execution and interactive terminal usage (SSH `ssh_pct`)

One-off command execution with typed result:

```ts
import { ProxmoxClient, ProxmoxCommandExitError } from '@opsimathically/proxmox';

const client = ProxmoxClient.fromPath();

try {
  const command_result = await client.lxc_service.runCommand({
    node_id: 'pve1',
    container_id: 101,
    command_argv: ['uname', '-a'],
    timeout_ms: 30000,
    max_output_bytes: 512 * 1024
  });

  console.log(command_result.exit_code, command_result.stdout);
} catch (error) {
  if (error instanceof ProxmoxCommandExitError) {
    console.error('Command failed with non-zero exit:', error.details);
  }
}
```

Interactive terminal lifecycle:

```ts
const session = await client.lxc_service.openTerminalSession({
  node_id: 'pve1',
  container_id: 101,
  shell_mode: true,
  shell_command: '/bin/bash -il',
  columns: 140,
  rows: 40
});

await client.lxc_service.sendTerminalInput({
  session_id: session.session_id,
  input_text: 'ls -la\\n'
});

const terminal_events = await client.lxc_service.readTerminalEvents({
  session_id: session.session_id,
  max_events: 100
});

for (const event_record of terminal_events) {
  if (event_record.event_type === 'output') {
    process.stdout.write(event_record.output_chunk ?? '');
  }
}

await client.lxc_service.resizeTerminal({
  session_id: session.session_id,
  columns: 180,
  rows: 48
});

await client.lxc_service.closeTerminalSession({
  session_id: session.session_id,
  reason: 'operator_complete'
});
```

## Expect-style interactive scripting

`LxcExpectService` provides deterministic send/wait/branch scripting over SSH-backed LXC terminal sessions.

### Simple `sendAndExpect`

```ts
const session = await client.lxc_service.openTerminalSession({
  node_id: 'g75',
  container_id: 100,
  shell_mode: true,
  shell_command: '/bin/sh -il'
});

const wait_result = await client.lxc_expect_service.sendAndExpect({
  session_id: session.session_id,
  send_input: 'echo SDK_EXPECT_OK\\n',
  expect: {
    kind: 'string',
    value: 'SDK_EXPECT_OK'
  },
  timeout_ms: 15000
});

console.log(wait_result.status, wait_result.match?.matched_text);
```

### Multi-step `runScript` with branching

```ts
const script_result = await client.lxc_expect_service.runScript({
  target: {
    open_terminal_input: {
      node_id: 'g75',
      container_id: 100,
      shell_mode: true,
      shell_command: '/bin/sh -il'
    },
    close_on_finish: true
  },
  script: {
    default_timeout_ms: 30000,
    default_poll_interval_ms: 100,
    steps: [
      {
        step_id: 'detect_mode',
        send_input: 'echo MODE=B\\n',
        expect: [
          { matcher_id: 'mode_a', kind: 'string', value: 'MODE=A' },
          { matcher_id: 'mode_b', kind: 'string', value: 'MODE=B' }
        ],
        next_step_by_matcher_id: {
          mode_a: 'branch_a',
          mode_b: 'branch_b'
        }
      },
      {
        step_id: 'branch_a',
        send_input: 'echo BRANCH_A\\n',
        expect: { kind: 'string', value: 'BRANCH_A' }
      },
      {
        step_id: 'branch_b',
        send_input: 'echo BRANCH_B\\n',
        expect: { kind: 'string', value: 'BRANCH_B' }
      }
    ]
  }
});

console.log(script_result.succeeded, script_result.failed_step_id);
```

### Timeout/failure handling

```ts
import {
  ProxmoxExpectTimeoutError,
  ProxmoxExpectSessionClosedError,
  ProxmoxExpectStepFailedError
} from '@opsimathically/proxmox';

try {
  const wait_result = await client.lxc_expect_service.waitFor({
    session_id: 'existing-session-id',
    expect: { kind: 'regex', pattern: 'ready>' },
    timeout_ms: 5000
  });

  if (wait_result.status !== 'matched') {
    throw new Error(`Expect failed with status: ${wait_result.status}`);
  }
} catch (error) {
  if (error instanceof ProxmoxExpectTimeoutError) {
    console.error('Expect timeout');
  } else if (error instanceof ProxmoxExpectSessionClosedError) {
    console.error('Session closed unexpectedly');
  } else if (error instanceof ProxmoxExpectStepFailedError) {
    console.error('Expect step failed');
  } else {
    throw error;
  }
}
```

Notes:

- use `sensitive_input: true` on script steps to redact input in transcript.
- limit transcript growth with `script.max_buffer_bytes`.
- `stream_target` currently supports `combined` only for SSH terminal events.

### Typical LXC SSH smoke pattern (`runCommand` + `runScript`)

```ts
import {
  ProxmoxClient,
  ProxmoxError,
  ProxmoxExpectSessionClosedError,
  ProxmoxExpectTimeoutError
} from '@opsimathically/proxmox';

async function Main(): Promise<void> {
  const client = ProxmoxClient.fromPath({
    profile_name: process.env.PROXMOXLIB_PROFILE ?? 'default'
  });

  const node_id = process.env.PROXMOX_EXAMPLE_LXC_SMOKE_NODE_ID ?? 'g75';
  const container_id = process.env.PROXMOX_EXAMPLE_LXC_SMOKE_CONTAINER_ID ?? '100';
  const timeout_ms = Number(process.env.PROXMOX_EXAMPLE_LXC_SMOKE_TIMEOUT_MS ?? '30000');

  const command_result = await client.lxc_service.runCommand({
    node_id,
    container_id,
    command_argv: ['hostname'],
    timeout_ms,
    fail_on_non_zero_exit: true
  });
  console.info('[example] command_result', {
    execution_mode: command_result.execution_mode,
    exit_code: command_result.exit_code,
    duration_ms: command_result.duration_ms
  });

  const script_result = await client.lxc_expect_service.runScript({
    target: {
      open_terminal_input: {
        node_id,
        container_id,
        shell_mode: false,
        columns: 120,
        rows: 32,
        timeout_ms
      },
      close_on_finish: true
    },
    script: {
      default_timeout_ms: timeout_ms,
      default_poll_interval_ms: 100,
      steps: [
        {
          step_id: 'prompt_ready',
          send_input: '\n',
          expect: { kind: 'string', value: '#' },
          fail_on_timeout: true
        },
        {
          step_id: 'uid_zero',
          send_input: 'id -u\n',
          expect: { kind: 'regex', pattern: '(?:^|\\s)0(?:\\s|$)' },
          fail_on_timeout: true
        }
      ]
    }
  });

  console.info('[example] expect_result', {
    succeeded: script_result.succeeded,
    step_count: script_result.step_results.length
  });
}

Main().catch((error: unknown) => {
  if (error instanceof ProxmoxExpectTimeoutError) {
    console.error('[example] expect_timeout');
    process.exit(1);
  }
  if (error instanceof ProxmoxExpectSessionClosedError) {
    console.error('[example] expect_session_closed');
    process.exit(1);
  }
  if (error instanceof ProxmoxError) {
    console.error('[example] proxmox_error', {
      code: error.code,
      message: error.message,
      details: error.details
    });
    process.exit(1);
  }
  console.error('[example] unexpected_error');
  process.exit(1);
});
```

## Migration notes (legacy terminal/fallback removal)

- remove legacy websocket/termproxy terminal assumptions from your app flow.
- remove `profiles[].privileged_fallback` from `proxmoxlib.json`.
- remove `clusters[].nodes[].privileged_auth` if it was only for old `node_execute` fallback.
- keep node `auth` (API token source) for non-shell APIs.
- add/keep node `shell_backend: "ssh_pct"` and `ssh_shell` for LXC shell methods.

## Operational prerequisites (SSH LXC shell)

- SDK runtime can SSH to target Proxmox node(s).
- `pct` is available on target nodes.
- SSH identity has permission to run `pct exec` / `pct enter` for target containers.
- LXC target node/container IDs are valid and reachable.
- secrets are sourced externally (`env`, `file`, `vault`, `sops`), never hardcoded.
- production deployments use strict host verification (`strict_host_key`, fingerprint or known-hosts).

## Known limitations / next steps

- interactive terminal events are currently consumed as a combined stream; do not assume strict stdout/stderr separation in interactive mode.
- prompt/echo behavior depends on PTY/shell state; expect matchers should target stable markers instead of strict line positions.
- keep expect transcript sizes bounded (`max_buffer_bytes`) for long sessions.
- enforce host verification (`strict_host_key: true` + maintained fingerprints) for non-lab usage.
- additional automated tests for expect branching/cancellation/long-session buffering are recommended.

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
- `test/services/*`: VM/LXC/access/storage/pool/cluster/HA/task/DR service contracts and request behavior
- `test/helpers/*`: LXC, cluster orchestration, and node maintenance helper contract coverage
- `test/errors/*`: HTTP-to-typed-error mapping

## Security best practices

- use least-privilege Proxmox roles for routine automation tokens.
- separate read-only tokens from mutation-capable tokens.
- rotate API tokens on a defined schedule.
- store tokens in external secret sources (`env`, `file`, `sops`, `vault`), not source code.
- keep file-based secrets permissioned to least privilege (`0600` recommended).
- do not log raw authorization headers or token values.
- use `ca_bundle_path` for private/internal CAs instead of disabling TLS verification.
- run destructive helper flows (`teardownAndDestroy*`, `drainNode`, bulk operations) with `dry_run` first.
- keep SSH credentials out of source control and CI logs.
- avoid logging full shell command payloads if they can include sensitive values.

## SSH LXC shell backend notes

- LXC shell execution is SSH-only; legacy `termproxy`/`vncwebsocket` paths are not supported.
- for true non-VNC LXC shell control, configure node `shell_backend` as `ssh_pct`.
- `ssh_pct` uses SSH to the Proxmox node and executes `pct exec`/`pct enter`.
- configure `ssh_shell` per node with `username` and at least one auth source (`password_auth` or `private_key_auth`).
- keep SSH credentials in secret sources (`env`, `file`, `sops`, `vault`), never in code.
- prefer strict host verification with `strict_host_key` and `host_fingerprint_sha256`.
- ensure target node allows the configured SSH auth method and has `pct` available in path.

## Public package surface

Exports include:

- config helpers: `LoadConfig`, `ValidateConfig`, `ResolveProfile`, `ResolveSecrets`, `BuildConfigDiagnostics`, `EmitStartupDiagnostics`, `ResolveConfigPath`
- client: `ProxmoxClient`
- services: `DatacenterService`, `ClusterService`, `PoolService`, `NodeService`, `VmService`, `LxcService`, `AccessService`, `StorageService`, `HaService`, `TaskService`, `DrService`
- helpers: `LxcHelper`, `LxcDestroyHelper`, `LxcBulkHelper`, `LxcClusterPreflightHelper`, `ClusterOrchestrationHelper`, `NodeMaintenanceHelper`, `ProxmoxHelpers`
- shared config/http/service types
- typed error classes and HTTP error mapper

## Project Status and Risk Notice

This repository is maintained primarily for the author’s own operational and development needs.
Stability is not guaranteed, and interfaces/behavior may change at any time without notice.
If you choose to use this code, you do so at your own risk.
