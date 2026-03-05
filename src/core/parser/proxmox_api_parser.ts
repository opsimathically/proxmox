import {
  proxmox_api_response_t,
  proxmox_http_response_t,
} from "../../types/proxmox_http_types";

export interface proxmox_response_parser_i {
  ParseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T>;
}

export interface proxmox_api_parser_i {
  ParseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T>;
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
      message: ToString(typed_payload.message),
    };
  }

  if (typeof payload === "object" && "result" in payload) {
    const typed_payload = payload as Record<string, unknown>;
    return {
      data: typed_payload.result as T,
      success: true,
    };
  }

  return {
    data: payload as T,
    success: true,
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

export class ProxmoxApiParser implements proxmox_api_parser_i {
  public ParseResponse<T>(response: proxmox_http_response_t): proxmox_api_response_t<T> {
    let parsed: unknown = {};
    if (response.body) {
      try {
        parsed = JSON.parse(response.body) as unknown;
      } catch {
        parsed = {};
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
