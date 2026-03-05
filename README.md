# Proxmox SDK

TypeScript SDK for interacting with Proxmox VE clusters with typed service contracts, runtime config validation, and secure-by-default transport/auth behavior.

## What this library is

This SDK provides typed clients for common Proxmox domains:

- datacenter
- cluster
- node
- virtual machines (QEMU)
- containers (LXC)
- access/privilege introspection

Design goals:

- typed request/response contracts in TypeScript
- strict config parsing and validation at startup
- secure defaults (`verify_tls` enabled, explicit auth providers, redaction-oriented diagnostics)

## Feature/capability matrix

### `datacenter_service` (`DatacenterService`)

- `getSummary`
- `getVersion`
- `listStorage`

### `cluster_service` (`ClusterService`)

- `getStatus`
- `getMembership`
- `listNodes`

### `node_service` (`NodeService`)

- `listNodes`
- `getNodeStatus`
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

### `access_service` (`AccessService`)

- `getCurrentPermissions`
- `getIdentityPermissions`
- `hasCurrentPrivilege`
- `hasIdentityPrivilege`

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
- `test/services/*`: VM/LXC/access service contracts and request behavior
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
- services: `DatacenterService`, `ClusterService`, `NodeService`, `VmService`, `LxcService`, `AccessService`
- shared config/http/service types
- typed error classes and HTTP error mapper
