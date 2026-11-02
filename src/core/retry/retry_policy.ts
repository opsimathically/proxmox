import { proxmox_retry_policy_t } from "../../types/proxmox_config_types";
import {
  ProxmoxHttpError,
  ProxmoxRateLimitError,
  ProxmoxTransportError,
  ProxmoxTimeoutError,
} from "../../errors/proxmox_error";

export interface proxmox_retry_evaluation_i {
  should_retry: boolean;
  delay_ms: number;
}

export interface proxmox_retry_evaluation_input_i {
  attempt_number: number;
  policy: proxmox_retry_policy_t;
  error?: unknown;
  status_code?: number;
}

function ResolveJitterRatio(params: {
  policy: proxmox_retry_policy_t;
}): number {
  const raw_ratio = params.policy.jitter_ratio ?? 0.2;
  return Math.min(Math.max(raw_ratio, 0), 1);
}

function ResolveDelayBounds(params: {
  policy: proxmox_retry_policy_t;
}): { base_delay_ms: number; max_delay_ms: number } {
  const base_delay_ms = params.policy.base_delay_ms ?? 100;
  const max_delay_ms = Math.max(base_delay_ms, params.policy.max_delay_ms ?? 5000);
  return {
    base_delay_ms,
    max_delay_ms,
  };
}

export function IsRetryableStatusCode(params: {
  status_code: number;
  policy: proxmox_retry_policy_t;
}): boolean {
  if (params.status_code === 429) {
    return params.policy.retry_on_429 !== false;
  }

  if (params.status_code === 500 || params.status_code === 502 || params.status_code === 503 || params.status_code === 504) {
    return params.policy.retry_on_500 !== false;
  }

  return false;
}

export function IsRetryableError(params: {
  error: unknown;
  policy: proxmox_retry_policy_t;
}): boolean {
  if (params.error instanceof ProxmoxRateLimitError) {
    return params.policy.retry_on_429 !== false;
  }

  if (params.error instanceof ProxmoxHttpError) {
    return params.policy.enabled !== false;
  }

  if (params.error instanceof ProxmoxTimeoutError) {
    return params.policy.enabled !== false;
  }

  if (params.error instanceof ProxmoxTransportError) {
    return params.policy.enabled !== false && IsRetryableTransportError(params.error.cause);
  }

  return false;
}

export function IsRetryableTransportError(raw_error: unknown): boolean {
  if (raw_error === undefined) {
    return true;
  }

  if (raw_error instanceof Error) {
    const raw_code = "code" in raw_error
      ? String((raw_error as { code?: string }).code)
      : "";
    if (
      raw_code === "ECONNRESET" ||
      raw_code === "ENOTFOUND" ||
      raw_code === "ECONNREFUSED" ||
      raw_code === "EPIPE" ||
      raw_code === "ETIMEDOUT" ||
      raw_code === "EHOSTUNREACH" ||
      raw_code === "ENETUNREACH" ||
      raw_code === "EAI_AGAIN" ||
      raw_code === "ECONNABORTED"
    ) {
      return true;
    }
  }

  const error_text = String(raw_error).toLowerCase();
  return error_text.includes("network") || error_text.includes("socket hang up");
}

export function NextRetryDelayMs(params: {
  policy: proxmox_retry_policy_t;
  attempt_number: number;
  random_value?: number;
}): number {
  const jitter_ratio = ResolveJitterRatio({ policy: params.policy });
  const delay_bounds = ResolveDelayBounds({ policy: params.policy });
  const capped_attempt = Math.max(params.attempt_number, 1);
  const attempt_multiplier = Math.pow(2, capped_attempt - 1);
  const exponential_delay = delay_bounds.base_delay_ms * attempt_multiplier;
  const capped_delay = Math.min(exponential_delay, delay_bounds.max_delay_ms);
  const centered_jitter = 1 + jitter_ratio * ((params.random_value ?? Math.random()) - 0.5);
  const delay_ms = Math.floor(capped_delay * centered_jitter);
  return Math.max(0, delay_ms);
}

export function EvaluateRetry(params: {
  attempt_number: number;
  policy: proxmox_retry_policy_t;
  error?: unknown;
  status_code?: number;
}): proxmox_retry_evaluation_i {
  const can_retry_count = params.policy.enabled !== false &&
    params.attempt_number <= (params.policy.max_retries ?? 0);
  const should_retry_status = params.status_code !== undefined
    ? IsRetryableStatusCode({ status_code: params.status_code, policy: params.policy })
    : false;
  const should_retry_error = params.status_code === undefined && params.error !== undefined
    ? IsRetryableError({ error: params.error, policy: params.policy })
    : false;
  const should_retry = can_retry_count && (should_retry_status || should_retry_error);

  return {
    should_retry,
    delay_ms: should_retry ? NextRetryDelayMs({ policy: params.policy, attempt_number: params.attempt_number }) : 0,
  };
}
