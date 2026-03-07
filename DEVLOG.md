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

13. **Explicit LXC Destroy Helper Naming**  
Status: `done`  
Renamed teardown helper surface to explicit destructive naming (`teardownAndDestroyLxcContainer`) to make stop+delete intent unambiguous.

14. **High-Level LXC Destroy Helper Flow**  
Status: `done`  
Implemented helper-driven LXC stop/halt + delete workflow with typed responses, dry-run support, not-found handling, and sanitized error context.

15. **Bulk LXC Helper Operations**  
Status: `done`  
Added bulk create/destroy helper methods (`createLxcContainersBulk`, `teardownAndDestroyLxcContainersBulk`) with deterministic ID/hostname strategies, concurrency control, and aggregate per-item reporting.

16. **Live Bulk Create/Destroy Verification (`example.ts`)**  
Status: `done`  
Validated end-to-end against throwaway Proxmox config: bulk create of 10 containers, existence verification, bulk destroy of same 10, and post-delete verification.

17. **README Professionalization and Risk Notice**  
Status: `done`  
Updated README capability and example coverage to match implementation and added final `Project Status and Risk Notice` section for personal-use / own-risk clarity.
