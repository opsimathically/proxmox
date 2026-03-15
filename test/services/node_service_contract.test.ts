import assert from "node:assert";
import test from "node:test";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { ProxmoxAuthError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { NodeService } from "../../src/services/node_service";

class FakeAuthProvider {
  public async getAuthHeader(): Promise<string> {
    return "PVEAPIToken root@pam!builder=token-value";
  }

  public async getTokenFingerprint(): Promise<string> {
    return "fingerprint";
  }
}

class FakeRequestClient implements proxmox_request_client_i {
  public requests: proxmox_request_i[] = [];
  public response_data: unknown = {};
  public response_data_by_path: Record<string, unknown> = {};
  public error_to_throw?: Error;

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "pve-a",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
    };
  }

  public isPrivilegedOperationEnabled(_operation: string): boolean {
    return false;
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    if (this.error_to_throw !== undefined) {
      throw this.error_to_throw;
    }
    const mapped_response = this.response_data_by_path[params.path];
    const resolved_data = mapped_response !== undefined
      ? mapped_response
      : this.response_data;
    return {
      data: resolved_data as T,
      success: true,
      status_code: 200,
    };
  }
}

test("NodeService getNodeCpuCapacity parses cpuinfo logical/physical counts.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    status: "online",
    cpuinfo: {
      cpus: 16,
      cores: 8,
      sockets: 2,
      model: "AMD EPYC",
    },
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeCpuCapacity({
    node_id: "node-a",
  });

  const request = request_client.requests.at(-1) as proxmox_request_i;
  assert.equal(request.path, "/api2/json/nodes/node-a/status");
  assert.equal(response.data.node_id, "node-a");
  assert.equal(response.data.logical_cpu_count, 16);
  assert.equal(response.data.physical_core_count, 16);
  assert.equal(response.data.sockets, 2);
  assert.equal(response.data.model, "AMD EPYC");
  assert.equal(response.data.source_fields.logical_cpu_count, "cpuinfo.cpus");
  assert.equal(response.data.source_fields.physical_core_count, "cpuinfo.cores*cpuinfo.sockets");
});

test("NodeService getNodeCpuCapacity falls back to top-level cpus when cpuinfo.cpus is missing.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    cpus: "12",
    cpuinfo: {
      model: "Intel Xeon",
    },
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeCpuCapacity({
    node_id: "node-a",
  });

  assert.equal(response.data.logical_cpu_count, 12);
  assert.equal(response.data.source_fields.logical_cpu_count, "cpus");
  assert.equal(response.data.model, "Intel Xeon");
});

test("NodeService canAllocateCores reports capacity_unknown when counts are unavailable.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    status: "online",
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.canAllocateCores({
    node_id: "node-a",
    requested_cores: 2,
    mode: "physical",
  });

  assert.equal(response.data.allowed, false);
  assert.equal(response.data.reason, "capacity_unknown");
  assert.equal(response.data.available_cores, undefined);
});

test("NodeService canAllocateCores returns within/exceeds limit for logical and physical modes.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    cpuinfo: {
      cpus: 8,
      cores: 4,
      sockets: 1,
    },
  };
  const service = new NodeService({
    request_client,
  });

  const logical_ok = await service.canAllocateCores({
    node_id: "node-a",
    requested_cores: 6,
    mode: "logical",
  });
  const logical_too_high = await service.canAllocateCores({
    node_id: "node-a",
    requested_cores: 10,
    mode: "logical",
  });
  const physical_ok = await service.canAllocateCores({
    node_id: "node-a",
    requested_cores: 4,
    mode: "physical",
  });

  assert.equal(logical_ok.data.allowed, true);
  assert.equal(logical_ok.data.reason, "within_limit");
  assert.equal(logical_ok.data.available_cores, 8);
  assert.equal(logical_too_high.data.allowed, false);
  assert.equal(logical_too_high.data.reason, "exceeds_limit");
  assert.equal(physical_ok.data.allowed, true);
  assert.equal(physical_ok.data.available_cores, 4);
});

test("NodeService validates node_id and requested_cores input.", async () => {
  const request_client = new FakeRequestClient();
  const service = new NodeService({
    request_client,
  });

  await assert.rejects(
    async () => service.getNodeCpuCapacity({
      node_id: " ",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );

  await assert.rejects(
    async () => service.canAllocateCores({
      node_id: "node-a",
      requested_cores: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "requested_cores");
      return true;
    },
  );
});

test("NodeService propagates auth failures for cpu capacity calls.", async () => {
  const request_client = new FakeRequestClient();
  request_client.error_to_throw = new ProxmoxAuthError({
    code: "proxmox.auth.invalid_token",
    message: "Authorization failed for Proxmox request.",
    status_code: 403,
  });
  const service = new NodeService({
    request_client,
  });

  await assert.rejects(
    async () => service.getNodeCpuCapacity({
      node_id: "node-a",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});

test("NodeService listNetworkInterfaces normalizes node network records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/network"] = [
    {
      iface: "vmbr0",
      type: "bridge",
      active: 1,
      autostart: 1,
      bridge_ports: "eno1",
      bridge_vlan_aware: 1,
      address: "192.168.11.1",
      cidr: "192.168.11.1/24",
    },
    {
      iface: "vmbr1",
      type: "OVSBridge",
      active: "1",
      autostart: "0",
      bridge_ports: ["bond0"],
      bridge_vlan_aware: "true",
    },
    {
      iface: "bond0",
      type: "bond",
      active: 1,
    },
    {
      iface: "vlan100",
      type: "vlan",
      active: 1,
    },
    {
      iface: "eno1",
      type: "eth",
      active: 1,
      autostart: 1,
    },
    "invalid",
  ];
  const service = new NodeService({
    request_client,
  });

  const response = await service.listNetworkInterfaces({
    node_id: "node-a",
  });

  assert.equal(request_client.requests.length, 1);
  assert.equal(request_client.requests[0].path, "/api2/json/nodes/node-a/network");
  assert.equal(response.data.length, 5);
  assert.equal(response.data[0].interface_id, "vmbr0");
  assert.equal(response.data[0].is_bridge, true);
  assert.deepEqual(response.data[0].bridge_ports, ["eno1"]);
  assert.equal(response.data[0].bridge_vlan_aware, true);
  assert.equal(response.data[1].interface_id, "vmbr1");
  assert.equal(response.data[1].is_bridge, true);
  assert.equal(response.data[1].autostart, false);
  assert.equal(response.data[4].interface_id, "eno1");
  assert.equal(response.data[4].is_bridge, false);
});

test("NodeService listNetworkInterfaces applies supported type filters.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/network"] = [
    {
      iface: "vmbr0",
      type: "bridge",
    },
    {
      iface: "vmbr1",
      type: "OVSBridge",
    },
    {
      iface: "bond0",
      type: "bond",
    },
    {
      iface: "vlan100",
      type: "vlan",
    },
    {
      iface: "eno1",
      type: "eth",
    },
  ];
  const service = new NodeService({
    request_client,
  });

  const any_bridge_response = await service.listNetworkInterfaces({
    node_id: "node-a",
    type: "any_bridge",
  });
  const bridge_response = await service.listNetworkInterfaces({
    node_id: "node-a",
    type: "bridge",
  });
  const bond_response = await service.listNetworkInterfaces({
    node_id: "node-a",
    type: "bond",
  });
  const vlan_response = await service.listNetworkInterfaces({
    node_id: "node-a",
    type: "vlan",
  });
  const physical_response = await service.listNetworkInterfaces({
    node_id: "node-a",
    type: "physical",
  });

  assert.equal(any_bridge_response.data.length, 2);
  assert.equal(any_bridge_response.data[0].interface_id, "vmbr0");
  assert.equal(any_bridge_response.data[1].interface_id, "vmbr1");
  assert.equal(bridge_response.data.length, 1);
  assert.equal(bridge_response.data[0].interface_id, "vmbr0");
  assert.equal(bond_response.data.length, 1);
  assert.equal(bond_response.data[0].interface_id, "bond0");
  assert.equal(vlan_response.data.length, 1);
  assert.equal(vlan_response.data[0].interface_id, "vlan100");
  assert.equal(physical_response.data.length, 1);
  assert.equal(physical_response.data[0].interface_id, "eno1");
});

test("NodeService listBridges returns normalized bridge-only records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/network"] = [
    {
      iface: "vmbr0",
      type: "bridge",
    },
    {
      iface: "vmbr1",
      type: "OVSBridge",
    },
    {
      iface: "eno1",
      type: "eth",
    },
  ];
  const service = new NodeService({
    request_client,
  });

  const response = await service.listBridges({
    node_id: "node-a",
  });

  assert.equal(response.data.length, 2);
  assert.equal(response.data[0].interface_id, "vmbr0");
  assert.equal(response.data[0].is_bridge, true);
  assert.equal(response.data[1].interface_id, "vmbr1");
  assert.equal(response.data[1].is_bridge, true);
});

test("NodeService getNetworkInterface maps detail endpoint response.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/network/vmbr0"] = {
    iface: "vmbr0",
    type: "bridge",
    active: 1,
    autostart: 1,
    bridge_ports: "eno1,eno2",
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNetworkInterface({
    node_id: "node-a",
    interface_id: "vmbr0",
  });

  assert.equal(request_client.requests.length, 1);
  assert.equal(request_client.requests[0].path, "/api2/json/nodes/node-a/network/vmbr0");
  assert.equal(response.data.interface_id, "vmbr0");
  assert.equal(response.data.is_bridge, true);
  assert.deepEqual(response.data.bridge_ports, ["eno1", "eno2"]);
});

test("NodeService validates network interface input and propagates auth failures.", async () => {
  const request_client = new FakeRequestClient();
  const service = new NodeService({
    request_client,
  });

  await assert.rejects(
    async () => service.listNetworkInterfaces({
      node_id: " ",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );

  await assert.rejects(
    async () => service.getNetworkInterface({
      node_id: "node-a",
      interface_id: " ",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "interface_id");
      return true;
    },
  );

  const denied_request_client = new FakeRequestClient();
  denied_request_client.error_to_throw = new ProxmoxAuthError({
    code: "proxmox.auth.invalid_token",
    message: "Authorization failed for Proxmox request.",
    status_code: 403,
  });
  const denied_service = new NodeService({
    request_client: denied_request_client,
  });
  await assert.rejects(
    async () => denied_service.listBridges({
      node_id: "node-a",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxAuthError);
      assert.equal(error.code, "proxmox.auth.invalid_token");
      return true;
    },
  );
});

test("NodeService getNodeMemoryCapacity parses total/used/free memory from node status.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    memory: {
      total: 17179869184,
      used: 8589934592,
      free: 8589934592,
    },
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeMemoryCapacity({
    node_id: "node-a",
  });

  assert.equal(response.data.total_memory_bytes, 17179869184);
  assert.equal(response.data.used_memory_bytes, 8589934592);
  assert.equal(response.data.free_memory_bytes, 8589934592);
  assert.equal(response.data.source_fields.total_memory_bytes, "memory.total");
  assert.equal(response.data.source_fields.used_memory_bytes, "memory.used");
  assert.equal(response.data.source_fields.free_memory_bytes, "memory.free");
});

test("NodeService getNodeMemoryCapacity computes free memory when absent.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {
    memory: {
      total: "1000",
      used: "250",
    },
  };
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeMemoryCapacity({
    node_id: "node-a",
  });

  assert.equal(response.data.total_memory_bytes, 1000);
  assert.equal(response.data.used_memory_bytes, 250);
  assert.equal(response.data.free_memory_bytes, 750);
  assert.equal(response.data.source_fields.free_memory_bytes, "computed(total-used)");
});

test("NodeService getNodeMemoryAllocations maps qemu and lxc memory records.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/qemu"] = [
    {
      vmid: 100,
      name: "vm-100",
      status: "running",
      mem: 1073741824,
      maxmem: 2147483648,
    },
    {
      vmid: 101,
      name: "vm-101",
      status: "stopped",
      mem: 0,
      maxmem: 1073741824,
    },
  ];
  request_client.response_data_by_path["/api2/json/nodes/node-a/lxc"] = [
    {
      vmid: 200,
      name: "ct-200",
      status: "running",
      mem: 536870912,
      maxmem: 1073741824,
    },
    "invalid",
  ];
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeMemoryAllocations({
    node_id: "node-a",
  });
  assert.equal(request_client.requests.length, 2);
  assert.equal(request_client.requests[0].path, "/api2/json/nodes/node-a/qemu");
  assert.equal(request_client.requests[0].query, undefined);
  assert.equal(request_client.requests[1].path, "/api2/json/nodes/node-a/lxc");
  assert.equal(request_client.requests[1].query, undefined);

  assert.equal(response.data.include_stopped, false);
  assert.equal(response.data.resource_count, 2);
  assert.equal(response.data.allocated_memory_bytes_total, 3221225472);
  assert.equal(response.data.used_memory_bytes_total, 1610612736);
  assert.equal(response.data.resources[0].resource_type, "qemu");
  assert.equal(response.data.resources[0].resource_id, "100");
  assert.equal(response.data.resources[1].resource_type, "lxc");
  assert.equal(response.data.resources[1].resource_id, "200");
});

test("NodeService getNodeMemoryAllocations can include stopped resources.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/qemu"] = [
    {
      vmid: 101,
      status: "stopped",
      maxmem: 1024,
    },
  ];
  request_client.response_data_by_path["/api2/json/nodes/node-a/lxc"] = [];
  const service = new NodeService({
    request_client,
  });

  const response = await service.getNodeMemoryAllocations({
    node_id: "node-a",
    include_stopped: true,
  });

  assert.equal(response.data.resource_count, 1);
  assert.equal(response.data.resources[0].resource_id, "101");
  assert.equal(response.data.allocated_memory_bytes_total, 1024);
});

test("NodeService canAllocateMemory evaluates free and allocated headroom policies.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data_by_path["/api2/json/nodes/node-a/status"] = {
    memory: {
      total: 17179869184,
      used: 8589934592,
      free: 8589934592,
    },
  };
  request_client.response_data_by_path["/api2/json/nodes/node-a/qemu"] = [
    {
      vmid: 100,
      status: "running",
      maxmem: 6442450944,
    },
  ];
  request_client.response_data_by_path["/api2/json/nodes/node-a/lxc"] = [
    {
      vmid: 200,
      status: "running",
      maxmem: 2147483648,
    },
  ];
  const service = new NodeService({
    request_client,
  });

  const free_headroom_ok = await service.canAllocateMemory({
    node_id: "node-a",
    requested_memory_bytes: 2147483648,
    mode: "free_headroom",
  });
  const free_headroom_exceeds = await service.canAllocateMemory({
    node_id: "node-a",
    requested_memory_bytes: 9663676416,
    mode: "free_headroom",
  });
  const allocated_headroom_ok = await service.canAllocateMemory({
    node_id: "node-a",
    requested_memory_bytes: 2147483648,
    mode: "allocated_headroom",
  });
  const allocated_headroom_exceeds = await service.canAllocateMemory({
    node_id: "node-a",
    requested_memory_bytes: 9663676416,
    mode: "allocated_headroom",
  });

  assert.equal(free_headroom_ok.data.allowed, true);
  assert.equal(free_headroom_ok.data.reason, "within_limit");
  assert.equal(free_headroom_ok.data.available_memory_bytes, 8589934592);
  assert.equal(free_headroom_exceeds.data.allowed, false);
  assert.equal(free_headroom_exceeds.data.reason, "exceeds_limit");
  assert.equal(allocated_headroom_ok.data.allowed, true);
  assert.equal(allocated_headroom_ok.data.available_memory_bytes, 8589934592);
  assert.equal(allocated_headroom_exceeds.data.allowed, false);
  assert.equal(allocated_headroom_exceeds.data.reason, "exceeds_limit");
});

test("NodeService canAllocateMemory reports capacity_unknown when memory telemetry is missing.", async () => {
  const request_client = new FakeRequestClient();
  request_client.response_data = {};
  const service = new NodeService({
    request_client,
  });

  const response = await service.canAllocateMemory({
    node_id: "node-a",
    requested_memory_bytes: 1073741824,
    mode: "free_headroom",
  });

  assert.equal(response.data.allowed, false);
  assert.equal(response.data.reason, "capacity_unknown");
  assert.equal(response.data.available_memory_bytes, undefined);
});

test("NodeService validates requested_memory_bytes input.", async () => {
  const request_client = new FakeRequestClient();
  const service = new NodeService({
    request_client,
  });

  await assert.rejects(
    async () => service.canAllocateMemory({
      node_id: "node-a",
      requested_memory_bytes: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.code, "proxmox.validation.invalid_input");
      assert.equal(error.details?.field, "requested_memory_bytes");
      return true;
    },
  );
});
