export type proxmox_error_code_t =
  | "proxmox.config.load_file"
  | "proxmox.config.parse_json"
  | "proxmox.config.validation"
  | "proxmox.config.profile_not_found"
  | "proxmox.config.cluster_not_found"
  | "proxmox.config.auth.unsupported_provider"
  | "proxmox.config.auth.missing_token"
  | "proxmox.transport.request_failed"
  | "proxmox.transport.timeout"
  | "proxmox.transport.network_error"
  | "proxmox.transport.retry_exhausted"
  | "proxmox.auth.missing_token"
  | "proxmox.auth.unsupported_provider"
  | "proxmox.auth.invalid_token"
  | "proxmox.auth.ticket_acquisition_failed"
  | "proxmox.auth.privileged_fallback_misconfigured"
  | "proxmox.auth.privileged_fallback_denied"
  | "proxmox.auth.privileged_fallback_failed"
  | "proxmox.ssh.connection_failed"
  | "proxmox.ssh.auth_failed"
  | "proxmox.ssh.host_verification_failed"
  | "proxmox.ssh.session_open_failed"
  | "proxmox.ssh.session_io_failed"
  | "proxmox.expect.timeout"
  | "proxmox.expect.pattern_invalid"
  | "proxmox.expect.callback_failed"
  | "proxmox.expect.callback_timeout"
  | "proxmox.expect.callback_invalid_result"
  | "proxmox.expect.session_closed"
  | "proxmox.expect.step_failed"
  | "proxmox.expect.aborted"
  | "proxmox.validation.invalid_input"
  | "proxmox.validation.missing_input"
  | "proxmox.http.not_found"
  | "proxmox.http.conflict"
  | "proxmox.http.task_failed"
  | "proxmox.http.rate_limited"
  | "proxmox.http.server_error"
  | "proxmox.http.client_error"
  | "proxmox.lxc.exec_start_failed"
  | "proxmox.lxc.upload_source_invalid"
  | "proxmox.lxc.upload_temp_write_failed"
  | "proxmox.lxc.upload_directory_source_invalid"
  | "proxmox.lxc.upload_directory_archive_failed"
  | "proxmox.lxc.upload_directory_extract_failed"
  | "proxmox.lxc.upload_directory_path_unsafe"
  | "proxmox.lxc.upload_transfer_failed"
  | "proxmox.lxc.upload_push_failed"
  | "proxmox.lxc.upload_permission_denied"
  | "proxmox.lxc.upload_checksum_mismatch"
  | "proxmox.lxc.upload_timeout"
  | "proxmox.lxc.upload_conflict"
  | "proxmox.lxc.terminal_session_io_failed"
  | "proxmox.lxc.command_timeout"
  | "proxmox.lxc.command_non_zero_exit"
  | "proxmox.lxc.terminal_session_not_found";

export interface proxmox_error_details_i {
  field?: string;
  path?: string;
  value?: string;
  request_id?: string;
}

export type proxmox_error_details_t = proxmox_error_details_i;

export interface proxmox_error_input_i {
  code: proxmox_error_code_t;
  message: string;
  details?: proxmox_error_details_t;
  status_code?: number;
  cause?: unknown;
}

export class ProxmoxError extends Error {
  public readonly code: proxmox_error_code_t;
  public readonly details?: proxmox_error_details_t;
  public readonly status_code?: number;

  constructor(params: proxmox_error_input_i) {
    super(params.message);
    this.name = "ProxmoxError";
    this.code = params.code;
    this.details = params.details;
    this.status_code = params.status_code;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
    Object.setPrototypeOf(this, ProxmoxError.prototype);
  }
}

export class ProxmoxTransportError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxTransportError";
    Object.setPrototypeOf(this, ProxmoxTransportError.prototype);
  }
}

export class ProxmoxAuthError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxAuthError";
    Object.setPrototypeOf(this, ProxmoxAuthError.prototype);
  }
}

export class ProxmoxPrivilegedFallbackError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxPrivilegedFallbackError";
    Object.setPrototypeOf(this, ProxmoxPrivilegedFallbackError.prototype);
  }
}

export class ProxmoxSshShellError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxSshShellError";
    Object.setPrototypeOf(this, ProxmoxSshShellError.prototype);
  }
}

export class ProxmoxExpectTimeoutError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectTimeoutError";
    Object.setPrototypeOf(this, ProxmoxExpectTimeoutError.prototype);
  }
}

export class ProxmoxExpectPatternError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectPatternError";
    Object.setPrototypeOf(this, ProxmoxExpectPatternError.prototype);
  }
}

export class ProxmoxExpectCallbackError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectCallbackError";
    Object.setPrototypeOf(this, ProxmoxExpectCallbackError.prototype);
  }
}

export class ProxmoxExpectCallbackTimeoutError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectCallbackTimeoutError";
    Object.setPrototypeOf(this, ProxmoxExpectCallbackTimeoutError.prototype);
  }
}

export class ProxmoxExpectCallbackResultError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectCallbackResultError";
    Object.setPrototypeOf(this, ProxmoxExpectCallbackResultError.prototype);
  }
}

export class ProxmoxExpectSessionClosedError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectSessionClosedError";
    Object.setPrototypeOf(this, ProxmoxExpectSessionClosedError.prototype);
  }
}

export class ProxmoxExpectStepFailedError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectStepFailedError";
    Object.setPrototypeOf(this, ProxmoxExpectStepFailedError.prototype);
  }
}

export class ProxmoxExpectAbortedError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxExpectAbortedError";
    Object.setPrototypeOf(this, ProxmoxExpectAbortedError.prototype);
  }
}

export class ProxmoxValidationError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxValidationError";
    Object.setPrototypeOf(this, ProxmoxValidationError.prototype);
  }
}

export class ProxmoxNotFoundError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxNotFoundError";
    Object.setPrototypeOf(this, ProxmoxNotFoundError.prototype);
  }
}

export class ProxmoxConflictError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxConflictError";
    Object.setPrototypeOf(this, ProxmoxConflictError.prototype);
  }
}

export class ProxmoxTaskError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxTaskError";
    Object.setPrototypeOf(this, ProxmoxTaskError.prototype);
  }
}

export class ProxmoxTimeoutError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxTimeoutError";
    Object.setPrototypeOf(this, ProxmoxTimeoutError.prototype);
  }
}

export class ProxmoxRateLimitError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxRateLimitError";
    Object.setPrototypeOf(this, ProxmoxRateLimitError.prototype);
  }
}

export class ProxmoxLxcExecError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxLxcExecError";
    Object.setPrototypeOf(this, ProxmoxLxcExecError.prototype);
  }
}

export class ProxmoxLxcUploadError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxLxcUploadError";
    Object.setPrototypeOf(this, ProxmoxLxcUploadError.prototype);
  }
}

export class ProxmoxTerminalSessionError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxTerminalSessionError";
    Object.setPrototypeOf(this, ProxmoxTerminalSessionError.prototype);
  }
}

export class ProxmoxCommandTimeoutError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxCommandTimeoutError";
    Object.setPrototypeOf(this, ProxmoxCommandTimeoutError.prototype);
  }
}

export class ProxmoxCommandExitError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxCommandExitError";
    Object.setPrototypeOf(this, ProxmoxCommandExitError.prototype);
  }
}

export class ProxmoxHttpError extends ProxmoxError {
  constructor(params: proxmox_error_input_i) {
    super(params);
    this.name = "ProxmoxHttpError";
    Object.setPrototypeOf(this, ProxmoxHttpError.prototype);
  }
}

export function MapHttpStatusToProxmoxError(params: {
  status_code: number;
  path?: string;
  message?: string;
  body?: unknown;
  request_id?: string;
}): ProxmoxError {
  const detail = {
    path: params.path,
    request_id: params.request_id,
  };
  if (params.status_code === 401 || params.status_code === 403) {
    return new ProxmoxAuthError({
      code: "proxmox.auth.invalid_token",
      message: params.message ?? "Authorization failed for Proxmox request.",
      details: detail,
      status_code: params.status_code,
      cause: params.body,
    });
  }
  if (params.status_code === 404) {
    return new ProxmoxNotFoundError({
      code: "proxmox.http.not_found",
      message: params.message ?? "Resource was not found in Proxmox.",
      details: detail,
      status_code: params.status_code,
      cause: params.body,
    });
  }
  if (params.status_code === 409) {
    return new ProxmoxConflictError({
      code: "proxmox.http.conflict",
      message: params.message ?? "Proxmox reported a resource conflict.",
      details: detail,
      status_code: params.status_code,
      cause: params.body,
    });
  }
  if (params.status_code === 429) {
    return new ProxmoxRateLimitError({
      code: "proxmox.http.rate_limited",
      message: params.message ?? "Proxmox returned rate-limit error.",
      details: detail,
      status_code: params.status_code,
      cause: params.body,
    });
  }
  if (params.status_code >= 500) {
    return new ProxmoxHttpError({
      code: "proxmox.http.server_error",
      message: params.message ?? "Proxmox server error encountered.",
      details: detail,
      status_code: params.status_code,
      cause: params.body,
    });
  }

  return new ProxmoxHttpError({
    code: "proxmox.http.client_error",
    message: params.message ?? "Proxmox client/request error encountered.",
    details: detail,
    status_code: params.status_code,
    cause: params.body,
  });
}
