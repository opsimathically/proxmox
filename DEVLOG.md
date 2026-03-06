## Proxmox SDK Development Log

Purpose: concise milestone record for tracking implementation progress and referencing work by point number.

1. **Core Configuration and Client Wiring**  
Status: `done`  
Implemented profile/cluster/node-driven configuration loading and client initialization with typed validation and startup diagnostics.

2. **Auth Provider Foundation (`env`, `file`)**  
Status: `done`  
Implemented token resolution for environment and filesystem providers with typed auth errors and secure handling.

3. **SOPS Auth Provider Support**  
Status: `done`  
Implemented SOPS-backed token decryption via safe process execution, shared resolution flow, config integration, and unit coverage.

4. **Vault Auth Provider Support**  
Status: `done`  
Implemented Vault token retrieval over HTTP with env-driven connection settings, TLS options, typed errors, and test coverage.

5. **Transport TLS and Error Observability**  
Status: `done`  
Implemented native CA bundle handling in transport, secure TLS defaults, improved error parsing/sanitization, and actionable non-2xx diagnostics.

6. **Access/Permission Introspection Service**  
Status: `done`  
Added `access_service` for current/target identity permission lookup and boolean privilege preflight helpers.

7. **Storage Service Expansion**  
Status: `done`  
Added storage content workflows (list/upload/download/delete), storage permission helpers, and CT template catalog retrieval.

8. **Pool Discovery Service**  
Status: `done`  
Added `pool_service` for listing pools, retrieving pool details, and listing pool resources for provisioning workflows.

9. **Node Capacity and Network Preflight Helpers**  
Status: `done`  
Added node CPU and memory introspection/preflight helpers plus node network interface and bridge discovery methods.

10. **High-Level LXC Helper Workflow**  
Status: `done`  
Added `helpers.createLxcContainer(...)` with GUI-aligned input mapping, preflight checks, and optional start/HA flow handling.

11. **Example and Safety-Oriented Operational Flow**  
Status: `done`  
Expanded `example.ts` to demonstrate diagnostics, inventories, permission checks, storage/network discovery, and guarded mutation patterns.

12. **Test and Documentation Expansion**  
Status: `done`  
Expanded contract/core/helper tests and README coverage for capabilities, auth/TLS behavior, and practical usage examples.
