import {
  ProxmoxAuthError,
  ProxmoxConflictError,
  ProxmoxError,
  ProxmoxHttpError,
  ProxmoxNotFoundError,
  ProxmoxRateLimitError,
  ProxmoxTaskError,
  ProxmoxTimeoutError,
  ProxmoxTransportError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import { AccessService } from "../services/access_service";
import { LxcService } from "../services/lxc_service";
import {
  proxmox_lxc_helper_destroy_input_i,
  proxmox_lxc_helper_destroy_preflight_check_t,
  proxmox_lxc_helper_destroy_preflight_result_t,
  proxmox_lxc_helper_destroy_response_t,
  proxmox_lxc_task_result_t,
} from "../types/proxmox_service_types";

type normalized_lxc_destroy_preflight_t = {
  enabled: boolean;
  enforce: boolean;
  check_permissions: boolean;
  auth_id?: string;
};

type normalized_lxc_destroy_input_t = {
  node_id: string;
  container_id: string;
  stop_first: boolean;
  force_stop: boolean;
  purge?: boolean;
  ignore_not_found: boolean;
  dry_run: boolean;
  wait_for_task: boolean;
  timeout_ms?: number;
  retry_allowed?: boolean;
  preflight: normalized_lxc_destroy_preflight_t;
};

type lxc_destroy_container_state_t = {
  container_found: boolean;
  container_was_running?: boolean;
};

export interface lxc_destroy_helper_input_i {
  lxc_service: LxcService;
  access_service?: AccessService;
}

export class LxcDestroyHelper {
  public readonly lxc_service: LxcService;
  public readonly access_service?: AccessService;

  constructor(params: lxc_destroy_helper_input_i) {
    this.lxc_service = params.lxc_service;
    this.access_service = params.access_service;
  }

  public async teardownAndDestroyLxcContainer(
    params: proxmox_lxc_helper_destroy_input_i,
  ): Promise<proxmox_lxc_helper_destroy_response_t> {
    const normalized_input = NormalizeDestroyInput(params);
    const container_state = await this.resolveContainerState({
      node_id: normalized_input.node_id,
      container_id: normalized_input.container_id,
    });
    const preflight = await this.runPreflight({
      normalized_input,
      container_state,
    });

    if (normalized_input.dry_run) {
      return {
        success: true,
        status_code: 200,
        data: {
          node_id: normalized_input.node_id,
          container_id: normalized_input.container_id,
          dry_run: true,
          stop_first: normalized_input.stop_first,
          container_found: container_state.container_found,
          container_was_running: container_state.container_was_running,
          stopped: false,
          deleted: false,
          ignored_not_found: false,
          preflight,
        },
      };
    }

    if (!container_state.container_found) {
      if (normalized_input.ignore_not_found) {
        return this.buildIgnoredNotFoundResult({
          normalized_input,
          container_state,
          preflight,
          stopped: false,
        });
      }
      throw new ProxmoxNotFoundError({
        code: "proxmox.http.not_found",
        message: "LXC container was not found for teardown-and-destroy.",
        details: {
          field: "container_id",
          value: normalized_input.container_id,
        },
      });
    }

    let stopped = false;
    let stop_task: proxmox_lxc_task_result_t | undefined;
    if (normalized_input.stop_first && container_state.container_was_running === true) {
      try {
        stop_task = await this.stopContainer({
          normalized_input,
        });
        stopped = true;
      } catch (error) {
        if (error instanceof ProxmoxNotFoundError && normalized_input.ignore_not_found) {
          return this.buildIgnoredNotFoundResult({
            normalized_input,
            container_state: {
              container_found: false,
              container_was_running: container_state.container_was_running,
            },
            preflight,
            stopped,
            stop_task,
          });
        }
        RethrowWithDestroyContext({
          error,
          stage: "stop",
          normalized_input,
        });
      }
    }

    try {
      const delete_task = await this.deleteContainer({
        normalized_input,
      });
      return {
        success: true,
        status_code: 200,
        data: {
          node_id: normalized_input.node_id,
          container_id: normalized_input.container_id,
          dry_run: false,
          stop_first: normalized_input.stop_first,
          container_found: true,
          container_was_running: container_state.container_was_running,
          stopped,
          deleted: true,
          ignored_not_found: false,
          stop_task,
          delete_task,
          preflight,
        },
      };
    } catch (error) {
      if (error instanceof ProxmoxNotFoundError && normalized_input.ignore_not_found) {
        return this.buildIgnoredNotFoundResult({
          normalized_input,
          container_state: {
            container_found: false,
            container_was_running: container_state.container_was_running,
          },
          preflight,
          stopped,
          stop_task,
        });
      }
      RethrowWithDestroyContext({
        error,
        stage: "delete",
        normalized_input,
      });
    }
  }

  private async runPreflight(params: {
    normalized_input: normalized_lxc_destroy_input_t;
    container_state: lxc_destroy_container_state_t;
  }): Promise<proxmox_lxc_helper_destroy_preflight_result_t> {
    const preflight = params.normalized_input.preflight;
    if (!preflight.enabled) {
      return {
        executed: false,
        enforce: false,
        failed_checks: 0,
        checks: [],
      };
    }

    const checks: proxmox_lxc_helper_destroy_preflight_check_t[] = [];
    const container_exists_or_ignored = params.container_state.container_found || params.normalized_input.ignore_not_found;
    checks.push({
      check: "container_exists_or_ignored",
      passed: container_exists_or_ignored,
      reason: params.container_state.container_found
        ? "container_exists"
        : (params.normalized_input.ignore_not_found ? "not_found_ignored" : "container_not_found"),
    });

    if (preflight.check_permissions) {
      const privilege_path = `/vms/${params.normalized_input.container_id}`;
      if (params.normalized_input.stop_first) {
        checks.push(await this.checkPrivilege({
          path: privilege_path,
          privilege: "VM.PowerMgmt",
          auth_id: preflight.auth_id,
          check_name: "permission_stop",
        }));
      }
      checks.push(await this.checkPrivilege({
        path: privilege_path,
        privilege: "VM.Allocate",
        auth_id: preflight.auth_id,
        check_name: "permission_delete",
      }));
    }

    const failed_checks = checks.filter((check_record) => check_record.passed !== true);
    if (failed_checks.length > 0 && preflight.enforce) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "LXC destroy preflight checks failed.",
        details: {
          field: "preflight",
          value: failed_checks.map((check_record) => check_record.check).join(","),
        },
      });
    }

    return {
      executed: true,
      enforce: preflight.enforce,
      failed_checks: failed_checks.length,
      checks,
    };
  }

  private async checkPrivilege(params: {
    path: string;
    privilege: string;
    auth_id?: string;
    check_name: string;
  }): Promise<proxmox_lxc_helper_destroy_preflight_check_t> {
    if (this.access_service === undefined) {
      return {
        check: params.check_name,
        passed: false,
        reason: "access_service_unavailable",
      };
    }

    if (params.auth_id === undefined) {
      const response = await this.access_service.hasCurrentPrivilege({
        path: params.path,
        privilege: params.privilege,
      });
      return {
        check: params.check_name,
        passed: response.data.allowed,
        reason: response.data.allowed ? "allowed" : "denied",
      };
    }

    const response = await this.access_service.hasIdentityPrivilege({
      path: params.path,
      privilege: params.privilege,
      auth_id: params.auth_id,
    });
    return {
      check: params.check_name,
      passed: response.data.allowed,
      reason: response.data.allowed ? "allowed" : "denied",
    };
  }

  private async resolveContainerState(params: {
    node_id: string;
    container_id: string;
  }): Promise<lxc_destroy_container_state_t> {
    try {
      const response = await this.lxc_service.getContainer({
        node_id: params.node_id,
        container_id: params.container_id,
      });
      const raw_data = response.data as Record<string, unknown>;
      const raw_status = raw_data.status;
      const status = typeof raw_status === "string" ? raw_status.trim().toLowerCase() : undefined;
      return {
        container_found: true,
        container_was_running: status === "running",
      };
    } catch (error) {
      if (error instanceof ProxmoxNotFoundError) {
        return {
          container_found: false,
        };
      }
      throw error;
    }
  }

  private async stopContainer(params: {
    normalized_input: normalized_lxc_destroy_input_t;
  }): Promise<proxmox_lxc_task_result_t> {
    if (params.normalized_input.wait_for_task) {
      return this.lxc_service.stopContainer({
        node_id: params.normalized_input.node_id,
        container_id: params.normalized_input.container_id,
        wait_for_task: true,
        timeout_ms: params.normalized_input.timeout_ms,
        retry_allowed: params.normalized_input.retry_allowed,
        force: params.normalized_input.force_stop,
      });
    }

    return this.lxc_service.stopContainer({
      node_id: params.normalized_input.node_id,
      container_id: params.normalized_input.container_id,
      timeout_ms: params.normalized_input.timeout_ms,
      retry_allowed: params.normalized_input.retry_allowed,
      force: params.normalized_input.force_stop,
    });
  }

  private async deleteContainer(params: {
    normalized_input: normalized_lxc_destroy_input_t;
  }): Promise<proxmox_lxc_task_result_t> {
    if (params.normalized_input.wait_for_task) {
      return this.lxc_service.deleteContainer({
        node_id: params.normalized_input.node_id,
        container_id: params.normalized_input.container_id,
        wait_for_task: true,
        timeout_ms: params.normalized_input.timeout_ms,
        retry_allowed: params.normalized_input.retry_allowed,
        purge: params.normalized_input.purge,
      });
    }

    return this.lxc_service.deleteContainer({
      node_id: params.normalized_input.node_id,
      container_id: params.normalized_input.container_id,
      timeout_ms: params.normalized_input.timeout_ms,
      retry_allowed: params.normalized_input.retry_allowed,
      purge: params.normalized_input.purge,
    });
  }

  private buildIgnoredNotFoundResult(params: {
    normalized_input: normalized_lxc_destroy_input_t;
    container_state: lxc_destroy_container_state_t;
    preflight: proxmox_lxc_helper_destroy_preflight_result_t;
    stopped: boolean;
    stop_task?: proxmox_lxc_task_result_t;
  }): proxmox_lxc_helper_destroy_response_t {
    return {
      success: true,
      status_code: 200,
      data: {
        node_id: params.normalized_input.node_id,
        container_id: params.normalized_input.container_id,
        dry_run: false,
        stop_first: params.normalized_input.stop_first,
        container_found: false,
        container_was_running: params.container_state.container_was_running,
        stopped: params.stopped,
        deleted: true,
        ignored_not_found: true,
        stop_task: params.stop_task,
        preflight: params.preflight,
      },
    };
  }
}

function NormalizeDestroyInput(
  input: proxmox_lxc_helper_destroy_input_i,
): normalized_lxc_destroy_input_t {
  return {
    node_id: ValidateNodeId(input.node_id),
    container_id: ValidateContainerId(input.container_id),
    stop_first: input.stop_first !== false,
    force_stop: input.force_stop === true,
    purge: input.purge === true ? true : undefined,
    ignore_not_found: input.ignore_not_found === true,
    dry_run: input.dry_run === true,
    wait_for_task: input.wait_for_task === true || input.wait_for_tasks === true,
    timeout_ms: input.timeout_ms,
    retry_allowed: input.retry_allowed,
    preflight: NormalizeDestroyPreflight(input.preflight),
  };
}

function NormalizeDestroyPreflight(
  input: proxmox_lxc_helper_destroy_input_i["preflight"],
): normalized_lxc_destroy_preflight_t {
  if (input === undefined || input.enabled !== true) {
    return {
      enabled: false,
      enforce: false,
      check_permissions: false,
    };
  }

  return {
    enabled: true,
    enforce: input.enforce === true,
    check_permissions: input.check_permissions !== false,
    auth_id: NormalizeOptionalAuthId(input.auth_id),
  };
}

function ValidateNodeId(node_id: string): string {
  const normalized = node_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: "node_id is required and cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id contains unsupported characters.",
      details: {
        field: "node_id",
      },
    });
  }
  return normalized;
}

function ValidateContainerId(container_id: string | number): string {
  if (typeof container_id === "number") {
    if (!Number.isInteger(container_id) || container_id <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "container_id must be a positive integer.",
        details: {
          field: "container_id",
        },
      });
    }
    return String(container_id);
  }

  const normalized = container_id.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "container_id must be a positive integer.",
      details: {
        field: "container_id",
      },
    });
  }
  return normalized;
}

function NormalizeOptionalAuthId(auth_id: string | undefined): string | undefined {
  if (auth_id === undefined) {
    return undefined;
  }

  const normalized = auth_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "preflight.auth_id cannot be empty when provided.",
      details: {
        field: "preflight.auth_id",
      },
    });
  }
  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+(?:![A-Za-z0-9._-]+)?$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "preflight.auth_id format is invalid.",
      details: {
        field: "preflight.auth_id",
      },
    });
  }
  return normalized;
}

function BuildDestroyContextValue(params: {
  stage: "stop" | "delete";
  normalized_input: normalized_lxc_destroy_input_t;
}): string {
  const payload = {
    stage: params.stage,
    node_id: params.normalized_input.node_id,
    container_id: params.normalized_input.container_id,
    stop_first: params.normalized_input.stop_first,
    force_stop: params.normalized_input.force_stop,
    purge: params.normalized_input.purge,
    ignore_not_found: params.normalized_input.ignore_not_found,
    dry_run: params.normalized_input.dry_run,
    wait_for_task: params.normalized_input.wait_for_task,
    preflight_enabled: params.normalized_input.preflight.enabled,
  };
  const serialized = JSON.stringify(payload);
  if (serialized.length <= 900) {
    return serialized;
  }
  return `${serialized.slice(0, 897)}...`;
}

function RethrowWithDestroyContext(params: {
  error: unknown;
  stage: "stop" | "delete";
  normalized_input: normalized_lxc_destroy_input_t;
}): never {
  if (!(params.error instanceof ProxmoxError)) {
    throw params.error;
  }

  const context_value = BuildDestroyContextValue({
    stage: params.stage,
    normalized_input: params.normalized_input,
  });
  const detail_field = typeof params.error.details?.field === "string" && params.error.details.field.trim().length > 0
    ? params.error.details.field
    : "helpers.teardown_and_destroy_lxc_container";
  const existing_value = typeof params.error.details?.value === "string" && params.error.details.value.trim().length > 0
    ? params.error.details.value
    : undefined;

  const details = {
    ...params.error.details,
    field: detail_field,
    value: existing_value === undefined
      ? context_value
      : `${existing_value}; helper_context=${context_value}`,
  };
  const message = `LXC helper teardown-and-destroy ${params.stage} failed: ${params.error.message}`;

  if (params.error instanceof ProxmoxValidationError) {
    throw new ProxmoxValidationError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxAuthError) {
    throw new ProxmoxAuthError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxNotFoundError) {
    throw new ProxmoxNotFoundError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxConflictError) {
    throw new ProxmoxConflictError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxRateLimitError) {
    throw new ProxmoxRateLimitError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTimeoutError) {
    throw new ProxmoxTimeoutError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTransportError) {
    throw new ProxmoxTransportError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxTaskError) {
    throw new ProxmoxTaskError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }
  if (params.error instanceof ProxmoxHttpError) {
    throw new ProxmoxHttpError({
      code: params.error.code,
      message,
      details,
      status_code: params.error.status_code,
      cause: params.error.cause,
    });
  }

  throw new ProxmoxError({
    code: params.error.code,
    message,
    details,
    status_code: params.error.status_code,
    cause: params.error.cause,
  });
}
