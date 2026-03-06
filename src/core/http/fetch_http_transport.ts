import { readFileSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";
import { prox_mox_http_transport_i } from "./proxmox_http_transport_i";
import {
  proxmox_http_request_t,
  proxmox_http_response_t,
} from "../../types/proxmox_http_types";
import {
  ProxmoxTimeoutError,
  ProxmoxTransportError,
} from "../../errors/proxmox_error";

export interface fetch_http_transport_input_i {
  request_timeout_ms_default?: number;
  verify_tls_default?: boolean;
  keep_alive_ms_default: number;
  http_request_impl?: typeof http.request;
  https_request_impl?: typeof https.request;
}

export class FetchHttpTransport implements prox_mox_http_transport_i {
  public readonly request_timeout_ms_default: number;
  public readonly verify_tls_default: boolean;
  public readonly keep_alive_ms_default: number;
  private readonly http_agent_cache: Map<string, http.Agent>;
  private readonly https_agent_cache: Map<string, https.Agent>;
  private readonly http_request_impl: typeof http.request;
  private readonly https_request_impl: typeof https.request;

  constructor(params: fetch_http_transport_input_i) {
    this.request_timeout_ms_default = params.request_timeout_ms_default ?? 30000;
    this.verify_tls_default = params.verify_tls_default ?? true;
    this.keep_alive_ms_default = params.keep_alive_ms_default;
    this.http_agent_cache = new Map<string, http.Agent>();
    this.https_agent_cache = new Map<string, https.Agent>();
    this.http_request_impl = params.http_request_impl ?? http.request;
    this.https_request_impl = params.https_request_impl ?? https.request;
  }

  public async request(params: {
    request: proxmox_http_request_t;
    context: {
      base_url: string;
      verify_tls: boolean;
      keep_alive_ms: number;
      ca_bundle_path?: string;
      request_timeout_ms?: number;
    };
  }): Promise<proxmox_http_response_t> {
    const request = params.request;
    const context = params.context;
    const request_url = new URL(context.base_url + request.path);
    for (const key of Object.keys(request.query || {})) {
      const query_value = request.query?.[key];
      if (query_value !== undefined) {
        request_url.searchParams.set(key, String(query_value));
      }
    }

    const timeout_ms = request.timeout_ms ??
      context.request_timeout_ms ??
      this.request_timeout_ms_default;

    try {
      const headers = request.headers ?? {};
      const body_payload = request.body === undefined
        ? ""
        : JSON.stringify(request.body);
      const request_headers: Record<string, string> = {
        ...headers,
      };
      if (body_payload.length > 0) {
        if (!HasHeader({
          headers: request_headers,
          header_name: "content-type",
        })) {
          request_headers["content-type"] = "application/json";
        }
        if (!HasHeader({
          headers: request_headers,
          header_name: "content-length",
        })) {
          request_headers["content-length"] = String(Buffer.byteLength(body_payload, "utf8"));
        }
      }
      const verify_tls = context.verify_tls ?? this.verify_tls_default;
      const keep_alive_ms = context.keep_alive_ms ?? this.keep_alive_ms_default;

      const is_https = request_url.protocol === "https:";
      const ca_bundle = is_https && context.ca_bundle_path
        ? readFileSync(context.ca_bundle_path, "utf8")
        : undefined;
      const response = await this.performRequest({
        request_url,
        request_method: request.method,
        request_headers,
        request_body: body_payload,
        timeout_ms,
        keep_alive_ms,
        verify_tls,
        ca_bundle,
      });

      return {
        status: response.status,
        status_text: response.status_text,
        headers: response.headers,
        body: response.body,
      };
    } catch (error) {
      if (error instanceof Error && error.message === "request_timeout") {
        throw new ProxmoxTimeoutError({
          code: "proxmox.transport.timeout",
          message: "Request timed out.",
          details: {
            field: "request_timeout",
          },
          cause: error,
        });
      }
      throw new ProxmoxTransportError({
        code: "proxmox.transport.request_failed",
        message: "Request to Proxmox host failed.",
        details: {
          field: "http_transport",
        },
        cause: error,
      });
    }
  }

  private async performRequest(params: {
    request_url: URL;
    request_method: string;
    request_headers: Record<string, string>;
    request_body: string;
    timeout_ms: number;
    keep_alive_ms: number;
    verify_tls: boolean;
    ca_bundle?: string;
  }): Promise<{
    status: number;
    status_text: string;
    headers: Record<string, string>;
    body: string;
  }> {
    const is_https = params.request_url.protocol === "https:";
    const request_impl = is_https
      ? this.https_request_impl
      : this.http_request_impl;
    const request_agent = is_https
      ? this.resolveHttpsAgent({
        keep_alive_ms: params.keep_alive_ms,
        verify_tls: params.verify_tls,
        ca_bundle: params.ca_bundle,
      })
      : this.resolveHttpAgent({
        keep_alive_ms: params.keep_alive_ms,
      });

    return new Promise((resolve, reject) => {
      const request_instance = request_impl(params.request_url, {
        method: params.request_method,
        headers: params.request_headers,
        agent: request_agent,
      }, (incoming_message) => {
        const response_chunks: Buffer[] = [];
        incoming_message.on("data", (chunk: Buffer | string) => {
          response_chunks.push(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
          );
        });
        incoming_message.on("end", () => {
          const response_headers: Record<string, string> = {};
          for (const [header_name, header_value] of Object.entries(incoming_message.headers)) {
            if (header_value === undefined) {
              continue;
            }
            response_headers[header_name] = Array.isArray(header_value)
              ? header_value.join(", ")
              : String(header_value);
          }

          resolve({
            status: incoming_message.statusCode ?? 0,
            status_text: incoming_message.statusMessage ?? "",
            headers: response_headers,
            body: Buffer.concat(response_chunks).toString("utf8"),
          });
        });
      });

      request_instance.on("error", (error: Error) => {
        reject(error);
      });
      request_instance.setTimeout(params.timeout_ms, () => {
        request_instance.destroy(new Error("request_timeout"));
      });

      if (params.request_body.length > 0) {
        request_instance.write(params.request_body);
      }
      request_instance.end();
    });
  }

  private resolveHttpAgent(params: { keep_alive_ms: number }): http.Agent {
    const cache_key = String(params.keep_alive_ms);
    const cached_agent = this.http_agent_cache.get(cache_key);
    if (cached_agent !== undefined) {
      return cached_agent;
    }

    const agent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: params.keep_alive_ms,
    });
    this.http_agent_cache.set(cache_key, agent);
    return agent;
  }

  private resolveHttpsAgent(params: {
    keep_alive_ms: number;
    verify_tls: boolean;
    ca_bundle?: string;
  }): https.Agent {
    const ca_bundle_key = params.ca_bundle ?? "default-ca";
    const cache_key = `${params.keep_alive_ms}|${params.verify_tls}|${ca_bundle_key}`;
    const cached_agent = this.https_agent_cache.get(cache_key);
    if (cached_agent !== undefined) {
      return cached_agent;
    }

    const agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: params.keep_alive_ms,
      rejectUnauthorized: params.verify_tls,
      ca: params.ca_bundle,
    });
    this.https_agent_cache.set(cache_key, agent);
    return agent;
  }
}

function HasHeader(params: {
  headers: Record<string, string>;
  header_name: string;
}): boolean {
  const expected = params.header_name.toLowerCase();
  return Object.keys(params.headers).some((key_name) => key_name.toLowerCase() === expected);
}
