import { TaskPoller, task_polling_options_t } from "../core/task/task_poller";
import { proxmox_request_client_i } from "../core/request/proxmox_request_client";
import { ProxmoxError, ProxmoxValidationError } from "../errors/proxmox_error";
import {
  proxmox_task_wait_many_input_i,
  proxmox_task_wait_many_item_t,
  proxmox_task_wait_many_response_t,
} from "../types/proxmox_service_types";

const DEFAULT_MAX_PARALLEL_TASKS = 3;
const MAX_PARALLEL_TASKS_LIMIT = 20;

type normalized_task_wait_input_t = {
  tasks: Array<{
    node_id: string;
    task_id: string;
  }>;
  fail_fast: boolean;
  timeout_ms?: number;
  poll_interval_ms?: number;
  max_poll_failures?: number;
  max_parallel_tasks: number;
};

export interface task_service_input_i {
  request_client: proxmox_request_client_i;
  task_poller?: TaskPoller;
  task_poll_options?: task_polling_options_t;
}

export class TaskService {
  public readonly request_client: proxmox_request_client_i;
  public readonly task_poller?: TaskPoller;
  public readonly task_poll_options?: task_polling_options_t;

  constructor(params: task_service_input_i) {
    this.request_client = params.request_client;
    this.task_poller = params.task_poller;
    this.task_poll_options = params.task_poll_options;
  }

  public async waitForTasks(
    params: proxmox_task_wait_many_input_i,
  ): Promise<proxmox_task_wait_many_response_t> {
    const normalized_input = NormalizeWaitInput({
      input: params,
      defaults: this.task_poll_options,
    });
    if (this.task_poller === undefined) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Task polling is disabled or not configured.",
        details: {
          field: "task_poller",
        },
      });
    }

    const task_records: proxmox_task_wait_many_item_t[] = [];
    let fail_fast_triggered = false;
    for (
      let task_index = 0;
      task_index < normalized_input.tasks.length;
      task_index += normalized_input.max_parallel_tasks
    ) {
      const task_chunk = normalized_input.tasks.slice(
        task_index,
        task_index + normalized_input.max_parallel_tasks,
      );
      const chunk_results = await Promise.all(
        task_chunk.map(async (task_target) => this.waitForSingleTask({
          task_target,
          options: normalized_input,
        })),
      );
      task_records.push(...chunk_results);

      const chunk_has_failure = chunk_results.some((task_record) => task_record.error !== undefined);
      if (chunk_has_failure && normalized_input.fail_fast) {
        fail_fast_triggered = true;
        const remaining_tasks = normalized_input.tasks.slice(task_index + task_chunk.length);
        for (const remaining_task of remaining_tasks) {
          task_records.push({
            node_id: remaining_task.node_id,
            task_id: remaining_task.task_id,
            completed: false,
            status: "unknown",
            error: {
              message: "Task wait skipped after fail-fast trigger.",
              field: "fail_fast",
            },
          });
        }
        break;
      }
    }

    const completed = task_records.filter((task_record) => task_record.completed).length;
    const failed = task_records.filter((task_record) => task_record.error !== undefined).length;
    const pending = task_records.length - completed;
    const succeeded = completed - failed;

    return {
      success: true,
      status_code: fail_fast_triggered ? 207 : 200,
      data: {
        fail_fast: normalized_input.fail_fast,
        timeout_ms: normalized_input.timeout_ms,
        poll_interval_ms: normalized_input.poll_interval_ms,
        max_poll_failures: normalized_input.max_poll_failures,
        max_parallel_tasks: normalized_input.max_parallel_tasks,
        summary: {
          requested: normalized_input.tasks.length,
          completed,
          succeeded: succeeded >= 0 ? succeeded : 0,
          failed,
          pending,
        },
        tasks: task_records,
      },
    };
  }

  private async waitForSingleTask(params: {
    task_target: {
      node_id: string;
      task_id: string;
    };
    options: normalized_task_wait_input_t;
  }): Promise<proxmox_task_wait_many_item_t> {
    try {
      const node_connection = this.request_client.resolveNode(params.task_target.node_id);
      const auth_header = await node_connection.auth_provider.getAuthHeader();
      const task_result = await this.task_poller!.waitForTaskCompletion({
        node: params.task_target.node_id,
        task_id: params.task_target.task_id,
        host: node_connection.host,
        protocol: node_connection.protocol,
        port: node_connection.port,
        verify_tls: node_connection.verify_tls,
        ca_bundle_path: node_connection.ca_bundle_path,
        request_headers: {
          Authorization: auth_header,
        },
        options: {
          interval_ms: params.options.poll_interval_ms,
          timeout_ms: params.options.timeout_ms,
          max_poll_failures: params.options.max_poll_failures,
        },
      });
      return {
        node_id: params.task_target.node_id,
        task_id: params.task_target.task_id,
        completed: true,
        status: task_result.status,
        exit_status: task_result.exit_status,
        percent: task_result.percent,
        message: task_result.message,
        raw: task_result.raw,
      };
    } catch (error) {
      return {
        node_id: params.task_target.node_id,
        task_id: params.task_target.task_id,
        completed: true,
        status: "error",
        error: BuildSafeTaskError(error),
      };
    }
  }
}

function NormalizeWaitInput(params: {
  input: proxmox_task_wait_many_input_i;
  defaults?: task_polling_options_t;
}): normalized_task_wait_input_t {
  const tasks = ValidateTaskTargets(params.input.tasks);
  const fail_fast = params.input.fail_fast === true;
  const timeout_ms = params.input.timeout_ms ?? params.defaults?.timeout_ms;
  const poll_interval_ms = params.input.poll_interval_ms ?? params.defaults?.interval_ms;
  const max_poll_failures = params.input.max_poll_failures ?? params.defaults?.max_poll_failures;
  const max_parallel_tasks = params.input.max_parallel_tasks ?? DEFAULT_MAX_PARALLEL_TASKS;

  if (timeout_ms !== undefined && (!Number.isInteger(timeout_ms) || timeout_ms <= 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "timeout_ms must be a positive integer when provided.",
      details: {
        field: "timeout_ms",
      },
    });
  }
  if (poll_interval_ms !== undefined && (!Number.isInteger(poll_interval_ms) || poll_interval_ms <= 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "poll_interval_ms must be a positive integer when provided.",
      details: {
        field: "poll_interval_ms",
      },
    });
  }
  if (max_poll_failures !== undefined && (!Number.isInteger(max_poll_failures) || max_poll_failures < 0)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "max_poll_failures must be a non-negative integer when provided.",
      details: {
        field: "max_poll_failures",
      },
    });
  }
  if (!Number.isInteger(max_parallel_tasks) || max_parallel_tasks <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "max_parallel_tasks must be a positive integer.",
      details: {
        field: "max_parallel_tasks",
      },
    });
  }
  if (max_parallel_tasks > MAX_PARALLEL_TASKS_LIMIT) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `max_parallel_tasks must be <= ${MAX_PARALLEL_TASKS_LIMIT}.`,
      details: {
        field: "max_parallel_tasks",
      },
    });
  }

  return {
    tasks,
    fail_fast,
    timeout_ms,
    poll_interval_ms,
    max_poll_failures,
    max_parallel_tasks,
  };
}

function ValidateTaskTargets(
  tasks: proxmox_task_wait_many_input_i["tasks"],
): Array<{
  node_id: string;
  task_id: string;
}> {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "tasks must include at least one task target.",
      details: {
        field: "tasks",
      },
    });
  }

  const dedupe_set = new Set<string>();
  const normalized_tasks: Array<{
    node_id: string;
    task_id: string;
  }> = [];
  for (const task_target of tasks) {
    const node_id = ValidateNodeId(task_target.node_id);
    const task_id = ValidateTaskId(task_target.task_id);
    const dedupe_key = `${node_id.toLowerCase()}::${task_id}`;
    if (dedupe_set.has(dedupe_key)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "tasks contains duplicate node_id/task_id targets.",
        details: {
          field: "tasks",
        },
      });
    }
    dedupe_set.add(dedupe_key);
    normalized_tasks.push({
      node_id,
      task_id,
    });
  }
  return normalized_tasks;
}

function ValidateNodeId(raw_node_id: string): string {
  const node_id = raw_node_id.trim();
  if (!node_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id cannot be empty.",
      details: {
        field: "tasks.node_id",
      },
    });
  }
  if (!/^[A-Za-z0-9._-]+$/.test(node_id)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id contains unsupported characters.",
      details: {
        field: "tasks.node_id",
      },
    });
  }
  return node_id;
}

function ValidateTaskId(raw_task_id: string): string {
  const task_id = raw_task_id.trim();
  if (!task_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "task_id cannot be empty.",
      details: {
        field: "tasks.task_id",
      },
    });
  }
  return task_id;
}

function BuildSafeTaskError(error: unknown): {
  code?: string;
  message: string;
  status_code?: number;
  path?: string;
  field?: string;
} {
  if (error instanceof ProxmoxError) {
    return {
      code: error.code,
      message: error.message,
      status_code: error.status_code,
      path: error.details?.path,
      field: error.details?.field,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }
  return {
    message: "Task wait failed for unknown reason.",
  };
}
