import { proxmox_http_request_t } from "../../types/proxmox_http_types";
import { prox_mox_http_transport_i } from "../http/proxmox_http_transport_i";
import { BuildProxmoxUrl } from "../http/http_url_builder";
import { proxmox_api_parser_i } from "../parser/proxmox_api_parser";
import { ProxmoxTaskError, ProxmoxTimeoutError } from "../../errors/proxmox_error";
import { ProxmoxValidationError } from "../../errors/proxmox_error";

export interface task_poller_input_i {
  transport: prox_mox_http_transport_i;
  parser: proxmox_api_parser_i;
}

export interface task_polling_options_t {
  interval_ms?: number;
  timeout_ms?: number;
  max_poll_failures?: number;
}

export interface task_poller_input_params_i {
  node: string;
  task_id: string;
  host: string;
  protocol: "http" | "https";
  port?: number;
  verify_tls?: boolean;
  request_timeout_ms?: number;
  ca_bundle_path?: string;
  request_headers?: Record<string, string>;
  options?: task_polling_options_t;
}

export interface proxmox_task_result_t {
  task_id: string;
  node: string;
  status: "running" | "stopped" | "ok" | "error" | "unknown";
  exit_status?: "OK" | "ERROR";
  percent?: number;
  message?: string;
  raw?: unknown;
}

export class TaskPoller {
  public readonly transport: prox_mox_http_transport_i;
  public readonly parser: proxmox_api_parser_i;
  public readonly interval_ms: number;
  public readonly timeout_ms: number;
  public readonly max_poll_failures: number;

  constructor(params: task_poller_input_i) {
    this.transport = params.transport;
    this.parser = params.parser;
    this.interval_ms = 1500;
    this.timeout_ms = 1800000;
    this.max_poll_failures = 3;
  }

  public async waitForTaskCompletion(params: task_poller_input_params_i): Promise<proxmox_task_result_t> {
    const interval_ms = params.options?.interval_ms ?? this.interval_ms;
    const timeout_ms = params.options?.timeout_ms ?? this.timeout_ms;
    const max_poll_failures = params.options?.max_poll_failures ?? this.max_poll_failures;
    const start_time_ms = Date.now();
    if (interval_ms <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Task poll interval must be greater than zero.",
        details: {
          field: "task_polling.interval_ms",
        },
      });
    }

    if (timeout_ms <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Task poll timeout must be greater than zero.",
        details: {
          field: "task_polling.timeout_ms",
        },
      });
    }

    if (max_poll_failures < 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Max consecutive poll failures must be zero or greater.",
        details: {
          field: "task_polling.max_poll_failures",
        },
      });
    }

    let poll_failures = 0;
    while (Date.now() - start_time_ms <= timeout_ms) {
      const request_url = BuildProxmoxUrl({
        protocol: params.protocol,
        host: params.host,
        port: params.port,
        path: "",
      });

      const request: proxmox_http_request_t = {
        method: "GET",
        path: BuildTaskPath(params.node, params.task_id),
        headers: params.request_headers ?? {},
      };

      const transport_context = {
        base_url: request_url,
        verify_tls: params.verify_tls ?? true,
        keep_alive_ms: 30000,
        ca_bundle_path: params.ca_bundle_path,
        request_timeout_ms: params.request_timeout_ms,
      };
      const response = await this.transport.request({
        request: {
          ...request,
          path: request.path,
        },
        context: transport_context,
      });

      if (response.status >= 200 && response.status < 300) {
        const parsed = this.parser.parseResponse<Record<string, unknown>>(response);
        const task_status = CoerceTaskStatus(parsed.data as Record<string, unknown>);
        if (task_status.status !== "running") {
          if (task_status.exit_status === "ERROR") {
            throw new ProxmoxTaskError({
              code: "proxmox.http.task_failed",
              message: task_status.message ?? "Task reported error state.",
              details: {
                field: "task.status",
              },
            });
          }
          return {
            task_id: task_status.task_id,
            node: task_status.node,
            status: task_status.status,
            exit_status: task_status.exit_status,
            percent: task_status.percent,
            message: task_status.message,
            raw: task_status,
          };
        }
        poll_failures = 0;
      } else {
        poll_failures += 1;
        if (poll_failures > max_poll_failures) {
          throw new ProxmoxTaskError({
            code: "proxmox.http.task_failed",
            message: "Exceeded max poll failures while waiting for task.",
            details: {
              field: "task.poll",
            },
          });
        }
      }

      if ((Date.now() - start_time_ms) + interval_ms >= timeout_ms) {
        break;
      }
      await SleepMs(interval_ms);
    }

    throw new ProxmoxTimeoutError({
      code: "proxmox.transport.timeout",
      message: "Timed out while polling task completion.",
      details: {
        field: "task.poll.timeout",
      },
    });
  }

  public getDefaultIntervalMs(): number {
    return this.interval_ms;
  }
}

function BuildTaskPath(node: string, task_id: string): string {
  return `/api2/json/nodes/${Encode(node)}/tasks/${Encode(task_id)}/status`;
}

function Encode(value: string): string {
  return encodeURIComponent(value);
}

function SleepMs(delay_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay_ms);
  });
}

interface proxmox_task_status_record_t {
  [key: string]: unknown;
}

function CoerceTaskStatus(payload: Record<string, unknown>): proxmox_task_result_t {
  const record = (payload.data as proxmox_task_status_record_t) ?? payload;
  const status_raw = ToString(record.status, `task.data.status`) ?? "running";
  const normalized_status = NormalizeStatus(status_raw);
  const task_id = ToString(record.taskid, `task.data.taskid`) ?? ToString(record.task_id, `task.data.task_id`) ?? "unknown";
  const node = ToString(record.node, `task.data.node`) ?? "unknown";
  const raw_exit = ToString(record.exitstatus, `task.data.exitstatus`) ?? ToString(record.exit_status, `task.data.exit_status`);

  if (!Object.hasOwn(record, "status")) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Task payload missing status.",
      details: {
        field: "task.status",
      },
    });
  }

  return {
    task_id,
    node,
    status: normalized_status,
    exit_status: raw_exit as proxmox_task_result_t["exit_status"],
    percent: ToNumber(record.percent, `task.data.percent`),
    message: ToString(record.message, `task.data.message`),
    raw: payload,
  };
}

function ToString(value: unknown, _field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function ToNumber(value: unknown, _field: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return value;
}

function NormalizeStatus(value: string): proxmox_task_result_t["status"] {
  const lower_status = value.toLowerCase();
  if (
    lower_status === "running" ||
    lower_status === "stopped" ||
    lower_status === "ok" ||
    lower_status === "error" ||
    lower_status === "unknown"
  ) {
    return lower_status;
  }
  return "unknown";
}
