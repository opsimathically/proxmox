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
  | "proxmox.validation.invalid_input"
  | "proxmox.validation.missing_input"
  | "proxmox.http.not_found"
  | "proxmox.http.conflict"
  | "proxmox.http.task_failed"
  | "proxmox.http.rate_limited"
  | "proxmox.http.server_error"
  | "proxmox.http.client_error";

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
