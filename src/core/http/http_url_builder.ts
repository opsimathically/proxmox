import {
  ProxmoxValidationError,
} from "../../errors/proxmox_error";

export interface proxmox_host_parts_i {
  protocol: "http" | "https";
  host: string;
  port?: number;
}

export interface proxmox_http_request_path_i {
  path: string;
}

export function BuildProxmoxUrl(params: {
  protocol: "http" | "https";
  host: string;
  port?: number;
  base_url?: string;
  path: string;
  query?: Record<string, string | number | boolean>;
}): string {
  const safe_path = NormalizePath(params.path);
  ValidateProtocol(params.protocol);
  const base_url = BuildBaseUrl({
    protocol: params.protocol,
    host: params.host,
    port: params.port,
    base_url: params.base_url,
  });
  if (!safe_path) {
    return base_url;
  }

  return `${base_url}/${safe_path}`;
}

function BuildBaseUrl(params: proxmox_host_parts_i & { base_url?: string }): string {
  if (!params.host || !params.host.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Host must be defined for URL construction.",
      details: {
        field: "host",
      },
    });
  }

  if (params.port !== undefined && (params.port < 1 || params.port > 65535)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Invalid port in URL construction.",
      details: {
        field: "port",
      },
    });
  }

  const host = params.host.trim();
  const protocol = params.protocol ?? "https";
  const explicit_base = params.base_url?.trim();
  if (explicit_base) {
    let normalized_base: URL;
    try {
      normalized_base = new URL(explicit_base);
    } catch {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "base_url must be a valid absolute URL.",
        details: {
          field: "base_url",
          value: explicit_base,
        },
      });
    }
    if (normalized_base.protocol !== "http:" && normalized_base.protocol !== "https:") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "base_url must use http or https protocol.",
        details: {
          field: "base_url",
          value: explicit_base,
        },
      });
    }
    if (normalized_base.username || normalized_base.password || normalized_base.search || normalized_base.hash) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "base_url must not contain credentials or unsafe components.",
        details: {
          field: "base_url",
          value: explicit_base,
        },
      });
    }
    return `${normalized_base.origin}${normalized_base.pathname.replace(/\/$/, "")}`;
  }

  const port_segment = params.port ? `:${params.port}` : "";
  const normalized_host = ValidateHost(host);
  return `${protocol}://${normalized_host}${port_segment}`;
}

function NormalizePath(path: string): string {
  const normalized_path = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized_path) {
    return "";
  }

  const segments = normalized_path.split("/");
  for (const proxmox_segment of segments) {
    if (!proxmox_segment || proxmox_segment === "." || proxmox_segment === "..") {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Path traversal segments are not allowed.",
        details: {
          field: "path",
          value: path,
        },
      });
    }
  if (/\.\./.test(proxmox_segment)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Path segment may not contain '..'.",
        details: {
          field: "path",
          value: path,
        },
      });
    }
  }

  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function ValidateProtocol(protocol: "http" | "https"): void {
  if (protocol !== "http" && protocol !== "https") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "protocol must be http or https.",
      details: {
        field: "protocol",
        value: protocol,
      },
    });
  }
}

function ValidateHost(host: string): string {
  const candidate = `https://${host}`;
  let parsed_host: URL;
  try {
    parsed_host = new URL(candidate);
  } catch {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Invalid host in URL construction.",
      details: {
        field: "host",
        value: host,
      },
    });
  }

  if (parsed_host.username || parsed_host.password || parsed_host.pathname !== "/" || parsed_host.search || parsed_host.hash) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Host value is invalid for URL construction.",
      details: {
        field: "host",
        value: host,
      },
    });
  }

  if (parsed_host.port && parsed_host.port !== "") {
    return `${parsed_host.hostname}:${parsed_host.port}`;
  }
  return parsed_host.hostname;
}
