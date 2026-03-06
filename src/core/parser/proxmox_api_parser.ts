import {
  proxmox_api_response_t,
  proxmox_http_response_t,
} from "../../types/proxmox_http_types";

export interface proxmox_response_parser_i {
  parseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T>;
}

export interface proxmox_api_parser_i {
  parseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T>;
}

export type proxmox_response_parser_t = proxmox_api_parser_i;

function ParseEnvelopePayload<T>(payload: unknown): { data: T; success: boolean; message?: string } {
  if (payload === null || payload === undefined) {
    return {
      data: payload as T,
      success: true,
    };
  }

  if (typeof payload === "object" && "data" in payload) {
    const typed_payload = payload as Record<string, unknown>;
    return {
      data: typed_payload.data as T,
      success: typed_payload.success === undefined
        ? true
        : typeof typed_payload.success === "boolean"
          ? typed_payload.success
          : Boolean(typed_payload.success),
      message: ResolvePayloadMessage(typed_payload),
    };
  }

  if (typeof payload === "object" && "result" in payload) {
    const typed_payload = payload as Record<string, unknown>;
    return {
      data: typed_payload.result as T,
      success: true,
      message: ResolvePayloadMessage(typed_payload),
    };
  }

  if (typeof payload === "object") {
    const typed_payload = payload as Record<string, unknown>;
    return {
      data: payload as T,
      success: typed_payload.success === undefined
        ? true
        : typeof typed_payload.success === "boolean"
          ? typed_payload.success
          : Boolean(typed_payload.success),
      message: ResolvePayloadMessage(typed_payload),
    };
  }

  return {
    data: payload as T,
    success: true,
    message: typeof payload === "string" ? SummarizeString(payload) : undefined,
  };
}

function ToString(raw_value: unknown): string | undefined {
  if (raw_value === undefined || raw_value === null) {
    return undefined;
  }
  return typeof raw_value === "string"
    ? raw_value
    : String(raw_value);
}

function ResolvePayloadMessage(payload: Record<string, unknown>): string | undefined {
  const direct_message_candidates = [
    payload.message,
    payload.error,
    payload.reason,
  ];
  for (const direct_candidate of direct_message_candidates) {
    const direct_message = ToString(direct_candidate)?.trim();
    if (direct_message && direct_message.length > 0) {
      return SummarizeString(direct_message);
    }
  }

  const errors_value = payload.errors;
  if (errors_value !== undefined) {
    const errors_message = ResolveErrorsMessage(errors_value);
    if (errors_message !== undefined) {
      return errors_message;
    }
  }

  const data_message = ToString(payload.data)?.trim();
  if (data_message && data_message.length > 0) {
    return SummarizeString(data_message);
  }
  return undefined;
}

function ResolveErrorsMessage(errors: unknown): string | undefined {
  if (typeof errors === "string") {
    const normalized = errors.trim();
    return normalized ? SummarizeString(normalized) : undefined;
  }

  if (Array.isArray(errors)) {
    const summarized_errors: string[] = [];
    for (const entry of errors) {
      const normalized_entry = ToString(entry)?.trim();
      if (!normalized_entry) {
        continue;
      }
      summarized_errors.push(normalized_entry);
      if (summarized_errors.length >= 8) {
        break;
      }
    }
    if (summarized_errors.length === 0) {
      return undefined;
    }
    return SummarizeString(summarized_errors.join("; "));
  }

  if (typeof errors === "object" && errors !== null) {
    const error_record = errors as Record<string, unknown>;
    const pairs: string[] = [];
    for (const [field_name, field_value] of Object.entries(error_record)) {
      const normalized_value = ToString(field_value)?.trim();
      if (!normalized_value) {
        continue;
      }
      pairs.push(`${field_name}: ${normalized_value}`);
      if (pairs.length >= 8) {
        break;
      }
    }
    if (pairs.length === 0) {
      return undefined;
    }
    return SummarizeString(pairs.join("; "));
  }

  return undefined;
}

function SummarizeString(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const max_length = 400;
  if (normalized.length <= max_length) {
    return normalized;
  }
  return `${normalized.slice(0, max_length - 3)}...`;
}

export class ProxmoxApiParser implements proxmox_api_parser_i {
  public parseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T> {
    let parsed: unknown = {};
    if (response.body) {
      try {
        parsed = JSON.parse(response.body) as unknown;
      } catch {
        // Preserve body text for non-JSON error responses so callers can surface actionable details.
        parsed = response.body;
      }
    }

    const envelope = ParseEnvelopePayload<T>(parsed);
    return {
      data: envelope.data,
      success: envelope.success,
      message: envelope.message,
      status_code: response.status,
    };
  }
}
