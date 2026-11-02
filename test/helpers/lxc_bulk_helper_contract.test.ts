import assert from "node:assert";
import test from "node:test";
import {
  ProxmoxHttpError,
  ProxmoxValidationError,
} from "../../src/errors/proxmox_error";
import { LxcBulkHelper } from "../../src/helpers/lxc_bulk_helper";
import {
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_destroy_input_i,
  proxmox_lxc_helper_destroy_response_t,
} from "../../src/types/proxmox_service_types";

class FakeLxcHelper {
  public create_calls: proxmox_lxc_helper_create_input_i[] = [];
  public error_by_container_id = new Map<string, Error>();

  public async createLxcContainer(
    params: proxmox_lxc_helper_create_input_i,
  ): Promise<proxmox_lxc_helper_create_response_t> {
    this.create_calls.push(params);
    const container_id = String(params.general.container_id);
    const mapped_error = this.error_by_container_id.get(container_id);
    if (mapped_error !== undefined) {
      throw mapped_error;
    }

    return {
      success: true,
      status_code: 200,
      data: {
        node_id: params.general.node_id,
        container_id,
        dry_run: params.dry_run === true,
        config: {},
        preflight: {
          executed: true,
          enforce: false,
          failed_checks: 0,
          checks: [],
        },
        create_task: params.dry_run === true ? undefined : {
          operation: "create",
          resource_type: "lxc",
          resource_id: container_id,
          node_id: params.general.node_id,
          task_id: `UPID:create:${container_id}`,
        },
        start_task: undefined,
      },
    };
  }
}

class FakeLxcDestroyHelper {
  public destroy_calls: proxmox_lxc_helper_destroy_input_i[] = [];
  public error_by_container_id = new Map<string, Error>();

  public async teardownAndDestroyLxcContainer(
    params: proxmox_lxc_helper_destroy_input_i,
  ): Promise<proxmox_lxc_helper_destroy_response_t> {
    this.destroy_calls.push(params);
    const container_id = String(params.container_id);
    const mapped_error = this.error_by_container_id.get(container_id);
    if (mapped_error !== undefined) {
      throw mapped_error;
    }

    return {
      success: true,
      status_code: 200,
      data: {
        node_id: params.node_id,
        container_id,
        dry_run: params.dry_run === true,
        stop_first: params.stop_first !== false,
        container_found: true,
        container_was_running: false,
        stopped: false,
        deleted: true,
        ignored_not_found: params.ignore_not_found === true,
        delete_task: params.dry_run === true ? undefined : {
          operation: "delete",
          resource_type: "lxc",
          resource_id: container_id,
          node_id: params.node_id,
          task_id: `UPID:delete:${container_id}`,
        },
        preflight: {
          executed: false,
          enforce: false,
          failed_checks: 0,
          checks: [],
        },
      },
    };
  }
}

function BuildHelper(params: {
  lxc_helper?: FakeLxcHelper;
  lxc_destroy_helper?: FakeLxcDestroyHelper;
} = {}): {
  helper: LxcBulkHelper;
  lxc_helper: FakeLxcHelper;
  lxc_destroy_helper: FakeLxcDestroyHelper;
} {
  const lxc_helper = params.lxc_helper ?? new FakeLxcHelper();
  const lxc_destroy_helper = params.lxc_destroy_helper ?? new FakeLxcDestroyHelper();
  return {
    helper: new LxcBulkHelper({
      lxc_helper: lxc_helper as unknown as any,
      lxc_destroy_helper: lxc_destroy_helper as unknown as any,
    }),
    lxc_helper,
    lxc_destroy_helper,
  };
}

function BuildBaseCreateInput(): proxmox_lxc_helper_create_input_i {
  return {
    general: {
      node_id: "node-a",
      container_id: 1,
      hostname: "bulk-test.local",
    },
    template: {
      storage: "local",
      template: "local:vztmpl/debian-12.tar.zst",
    },
    disks: {
      storage: "local-lvm",
      disk_size_gib: 8,
    },
    preflight: {
      enabled: false,
    },
    dry_run: false,
  };
}

test("LxcBulkHelper createLxcContainersBulk succeeds with ID range and generated hostnames.", async () => {
  const { helper, lxc_helper } = BuildHelper();

  const response = await helper.createLxcContainersBulk({
    base_input: BuildBaseCreateInput(),
    count: 3,
    container_id_start: 9300,
    concurrency_limit: 2,
  });

  assert.equal(response.data.summary.requested, 3);
  assert.equal(response.data.summary.attempted, 3);
  assert.equal(response.data.summary.succeeded, 3);
  assert.equal(response.data.summary.failed, 0);
  assert.equal(response.data.summary.skipped, 0);
  assert.equal(lxc_helper.create_calls.length, 3);
  assert.equal(String(lxc_helper.create_calls[0].general.container_id), "9300");
  assert.equal(String(lxc_helper.create_calls[1].general.container_id), "9301");
  assert.equal(response.data.items[0].hostname, "bulk-test.local-1");
  assert.equal(response.data.items[1].hostname, "bulk-test.local-2");
});

test("LxcBulkHelper createLxcContainersBulk supports explicit IDs and hostname templates.", async () => {
  const { helper } = BuildHelper();

  const response = await helper.createLxcContainersBulk({
    base_input: BuildBaseCreateInput(),
    count: 2,
    container_id_list: [9401, 9402],
    hostname_strategy: {
      template: "ct-{container_id}-{index}.local",
      start_index: 10,
    },
    dry_run: true,
  });

  assert.equal(response.data.dry_run, true);
  assert.equal(response.data.items[0].hostname, "ct-9401-10.local");
  assert.equal(response.data.items[1].hostname, "ct-9402-11.local");
  assert.equal(response.data.items[0].dry_run, true);
});

test("LxcBulkHelper createLxcContainersBulk stops scheduling when continue_on_error is false.", async () => {
  const { helper, lxc_helper } = BuildHelper();
  lxc_helper.error_by_container_id.set("9501", new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "create failed",
    status_code: 500,
  }));

  const response = await helper.createLxcContainersBulk({
    base_input: BuildBaseCreateInput(),
    count: 4,
    container_id_start: 9500,
    concurrency_limit: 1,
    continue_on_error: false,
  });

  assert.equal(response.data.summary.attempted, 2);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.skipped, 2);
  assert.equal(response.data.items[3].skipped, true);
});

test("LxcBulkHelper createLxcContainersBulk continues after failures when configured.", async () => {
  const { helper, lxc_helper } = BuildHelper();
  lxc_helper.error_by_container_id.set("9601", new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "create failed",
    status_code: 500,
  }));

  const response = await helper.createLxcContainersBulk({
    base_input: BuildBaseCreateInput(),
    count: 3,
    container_id_start: 9600,
    continue_on_error: true,
    concurrency_limit: 1,
  });

  assert.equal(response.data.summary.attempted, 3);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.skipped, 0);
  assert.equal(response.data.items[2].attempted, true);
});

test("LxcBulkHelper createLxcContainersBulk sanitizes per-item error details.", async () => {
  const { helper, lxc_helper } = BuildHelper();
  lxc_helper.error_by_container_id.set("9700", new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "storage error",
    status_code: 500,
    details: {
      path: "/api2/json/nodes/node-a/lxc",
      field: "helpers.create_lxc_container",
      value: "secret-token-should-not-leak",
    },
  }));

  const response = await helper.createLxcContainersBulk({
    base_input: BuildBaseCreateInput(),
    count: 1,
    container_id_start: 9700,
  });

  assert.equal(response.data.items[0].success, false);
  assert.equal(response.data.items[0].error?.code, "proxmox.http.server_error");
  assert.equal(response.data.items[0].error?.path, "/api2/json/nodes/node-a/lxc");
  assert.equal(
    JSON.stringify(response.data.items[0].error).includes("secret-token-should-not-leak"),
    false,
  );
});

test("LxcBulkHelper createLxcContainersBulk validates input contracts.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.createLxcContainersBulk({
      base_input: BuildBaseCreateInput(),
      count: 2,
      container_id_list: [9800],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "count");
      return true;
    },
  );

  await assert.rejects(
    async () => helper.createLxcContainersBulk({
      base_input: BuildBaseCreateInput(),
      count: 2,
      container_id_list: [9800, 9800],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "container_id_list");
      return true;
    },
  );
});

test("LxcBulkHelper teardownAndDestroyLxcContainersBulk succeeds with explicit IDs.", async () => {
  const { helper, lxc_destroy_helper } = BuildHelper();

  const response = await helper.teardownAndDestroyLxcContainersBulk({
    node_id: "node-a",
    container_id_list: [9901, 9902, 9903],
    stop_first: true,
    ignore_not_found: true,
    count: 3,
  });

  assert.equal(response.data.summary.requested, 3);
  assert.equal(response.data.summary.succeeded, 3);
  assert.equal(lxc_destroy_helper.destroy_calls.length, 3);
  assert.equal(String(lxc_destroy_helper.destroy_calls[0].container_id), "9901");
});

test("LxcBulkHelper teardownAndDestroyLxcContainersBulk supports continue_on_error false.", async () => {
  const { helper, lxc_destroy_helper } = BuildHelper();
  lxc_destroy_helper.error_by_container_id.set("9911", new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "destroy failed",
    status_code: 500,
  }));

  const response = await helper.teardownAndDestroyLxcContainersBulk({
    node_id: "node-a",
    count: 4,
    container_id_start: 9910,
    concurrency_limit: 1,
    continue_on_error: false,
  });

  assert.equal(response.data.summary.attempted, 2);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.skipped, 2);
});

test("LxcBulkHelper teardownAndDestroyLxcContainersBulk continues when continue_on_error is true.", async () => {
  const { helper, lxc_destroy_helper } = BuildHelper();
  lxc_destroy_helper.error_by_container_id.set("9921", new ProxmoxHttpError({
    code: "proxmox.http.server_error",
    message: "destroy failed",
    status_code: 500,
  }));

  const response = await helper.teardownAndDestroyLxcContainersBulk({
    node_id: "node-a",
    count: 3,
    container_id_start: 9920,
    concurrency_limit: 1,
    continue_on_error: true,
  });

  assert.equal(response.data.summary.attempted, 3);
  assert.equal(response.data.summary.failed, 1);
  assert.equal(response.data.summary.skipped, 0);
});

test("LxcBulkHelper teardownAndDestroyLxcContainersBulk validates node_id and container ID source.", async () => {
  const { helper } = BuildHelper();

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainersBulk({
      node_id: "",
      count: 1,
      container_id_start: 9930,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "node_id");
      return true;
    },
  );

  await assert.rejects(
    async () => helper.teardownAndDestroyLxcContainersBulk({
      node_id: "node-a",
      count: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ProxmoxValidationError);
      assert.equal(error.details?.field, "container_id_start");
      return true;
    },
  );
});
