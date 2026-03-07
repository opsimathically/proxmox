import assert from "node:assert";
import test from "node:test";
import {
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { LxcDestroyHelper } from "../../src/helpers/lxc_destroy_helper";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";

class FakeLxcService {
  public container_exists = true;
  public container_running = true;
  public stop_calls: Record<string, unknown>[] = [];
  public delete_calls: Record<string, unknown>[] = [];
  public stop_error?: Error;
  public delete_error?: Error;

  public async getContainer(): Promise<proxmox_api_response_t<Record<string, unknown>>> {
    if (!this.container_exists) {
      throw new ProxmoxNotFoundError({
        code: "proxmox.http.not_found",
        message: "container not found",
        status_code: 404,
      });
    }
    return {
      success: true,
      status_code: 200,
      data: {
        status: this.container_running ? "running" : "stopped",
      },
    };
  }

  public async stopContainer(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.stop_calls.push(params);
    if (this.stop_error !== undefined) {
      throw this.stop_error;
    }
    this.container_running = false;
    return {
      operation: "stop",
      resource_type: "lxc",
      resource_id: String(params.container_id),
      node_id: String(params.node_id),
      task_id: "UPID:stop:1",
    };
  }

  public async deleteContainer(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.delete_calls.push(params);
    if (this.delete_error !== undefined) {
      throw this.delete_error;
    }
    this.container_exists = false;
    return {
      operation: "delete",
      resource_type: "lxc",
      resource_id: String(params.container_id),
      node_id: String(params.node_id),
      task_id: "UPID:delete:1",
    };
  }
}

class FakeAccessService {
  public current_allowed = true;
  public identity_allowed = true;
  public current_calls: Array<{ path: string; privilege: string }> = [];
  public identity_calls: Array<{ path: string; privilege: string; auth_id: string }> = [];

  public async hasCurrentPrivilege(params: {
    path: string;
    privilege: string;
  }): Promise<proxmox_api_response_t<{ allowed: boolean }>> {
    this.current_calls.push(params);
    return {
      success: true,
      status_code: 200,
      data: {
        allowed: this.current_allowed,
      },
    };
  }

  public async hasIdentityPrivilege(params: {
    path: string;
    privilege: string;
    auth_id: string;
  }): Promise<proxmox_api_response_t<{ allowed: boolean }>> {
    this.identity_calls.push(params);
    return {
      success: true,
      status_code: 200,
      data: {
        allowed: this.identity_allowed,
      },
    };
  }
}

function BuildHelper(params: {
  lxc_service?: FakeLxcService;
  access_service?: FakeAccessService;
} = {}): {
  helper: LxcDestroyHelper;
  lxc_service: FakeLxcService;
  access_service: FakeAccessService;
} {
  const lxc_service = params.lxc_service ?? new FakeLxcService();
  const access_service = params.access_service ?? new FakeAccessService();
  const helper = new LxcDestroyHelper({
    lxc_service: lxc_service as unknown as any,
    access_service: access_service as unknown as any,
  });
  return {
    helper,
    lxc_service,
    access_service,
  };
}

test("LxcDestroyHelper stops then deletes a running container.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = true;

  const response = await helper.teardownAndDestroyLxcContainer({
    node_id: "node-a",
    container_id: 1201,
    wait_for_task: true,
  });

  assert.equal(response.data.stopped, true);
  assert.equal(response.data.deleted, true);
  assert.equal(response.data.ignored_not_found, false);
  assert.equal(response.data.stop_task?.operation, "stop");
  assert.equal(response.data.delete_task?.operation, "delete");
  assert.equal(lxc_service.stop_calls.length, 1);
  assert.equal(lxc_service.delete_calls.length, 1);
});

test("LxcDestroyHelper deletes without stop when container is already stopped.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = false;

  const response = await helper.teardownAndDestroyLxcContainer({
    node_id: "node-a",
    container_id: 1202,
  });

  assert.equal(response.data.stopped, false);
  assert.equal(response.data.deleted, true);
  assert.equal(lxc_service.stop_calls.length, 0);
  assert.equal(lxc_service.delete_calls.length, 1);
  assert.equal(lxc_service.delete_calls[0].purge, undefined);
});

test("LxcDestroyHelper forwards purge only when explicitly enabled.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = false;

  await helper.teardownAndDestroyLxcContainer({
    node_id: "node-a",
    container_id: 1210,
    purge: true,
  });

  assert.equal(lxc_service.delete_calls.length, 1);
  assert.equal(lxc_service.delete_calls[0].purge, true);
});

test("LxcDestroyHelper returns not found when container is missing.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = false;

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "node-a",
      container_id: 1203,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxNotFoundError);
      return true;
    },
  );
});

test("LxcDestroyHelper returns successful no-op when ignore_not_found is true.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = false;

  const response = await helper.teardownAndDestroyLxcContainer({
    node_id: "node-a",
    container_id: 1204,
    ignore_not_found: true,
  });

  assert.equal(response.data.deleted, true);
  assert.equal(response.data.container_found, false);
  assert.equal(response.data.ignored_not_found, true);
  assert.equal(lxc_service.stop_calls.length, 0);
  assert.equal(lxc_service.delete_calls.length, 0);
});

test("LxcDestroyHelper supports dry_run planned destroy without mutation calls.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = true;

  const response = await helper.teardownAndDestroyLxcContainer({
    node_id: "node-a",
    container_id: 1205,
    dry_run: true,
  });

  assert.equal(response.data.dry_run, true);
  assert.equal(response.data.deleted, false);
  assert.equal(response.data.stopped, false);
  assert.equal(lxc_service.stop_calls.length, 0);
  assert.equal(lxc_service.delete_calls.length, 0);
});

test("LxcDestroyHelper stop failures include sanitized helper context.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = true;
  lxc_service.stop_error = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "stop failed",
    status_code: 500,
    details: {
      path: "/api2/json/nodes/node-a/lxc/1206/status/stop",
    },
    cause: {
      token: "should-not-leak",
    },
  });

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "node-a",
      container_id: 1206,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxHttpError);
      assert.equal(error.message.includes("teardown-and-destroy stop failed"), true);
      assert.equal(error.details?.field, "helpers.teardown_and_destroy_lxc_container");
      assert.equal(error.details?.value?.includes("1206"), true);
      assert.equal(error.details?.value?.includes("should-not-leak"), false);
      return true;
    },
  );
});

test("LxcDestroyHelper delete failures propagate as typed errors.", async () => {
  const { helper, lxc_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = false;
  lxc_service.delete_error = new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "delete failed",
    status_code: 500,
  });

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "node-a",
      container_id: 1207,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxHttpError);
      assert.equal(error.message.includes("teardown-and-destroy delete failed"), true);
      return true;
    },
  );
});

test("LxcDestroyHelper preflight enforces permission checks when requested.", async () => {
  const { helper, lxc_service, access_service } = BuildHelper();
  lxc_service.container_exists = true;
  lxc_service.container_running = true;
  access_service.current_allowed = false;

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "node-a",
      container_id: 1208,
      preflight: {
        enabled: true,
        enforce: true,
        check_permissions: true,
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "preflight");
      assert.equal(error.details?.value?.includes("permission_stop"), true);
      return true;
    },
  );
});

test("LxcDestroyHelper validates node_id and container_id inputs.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "",
      container_id: 1209,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainer({
      node_id: "node-a",
      container_id: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "container_id");
      return true;
    },
  );
});
