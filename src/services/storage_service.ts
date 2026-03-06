import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { basename, dirname } from "node:path";
import { URL } from "node:url";
import { proxmox_http_method_t } from "../types/proxmox_http_types";
import {
  MapHttpStatusToProxmoxError,
  ProxmoxTimeoutError,
  ProxmoxTransportError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
} from "../core/request/proxmox_request_client";
import {
  proxmox_storage_content_list_query_i,
  proxmox_storage_content_list_response_t,
  proxmox_storage_content_record_t,
  proxmox_storage_content_kind_t,
  proxmox_storage_content_filter_t,
  proxmox_storage_delete_input_i,
  proxmox_storage_download_input_i,
  proxmox_storage_download_response_t,
  proxmox_storage_permission_query_i,
  proxmox_storage_task_response_t,
  proxmox_storage_upload_input_i,
  proxmox_access_privilege_check_response_t,
} from "../types/proxmox_service_types";
import { AccessService } from "./access_service";
import { ProxmoxApiParser } from "../core/parser/proxmox_api_parser";

interface storage_access_checker_i {
  hasCurrentPrivilege(params: { path: string; privilege: string }): Promise<proxmox_access_privilege_check_response_t>;
  hasIdentityPrivilege(params: {
    path: string;
    auth_id: string;
    privilege: string;
  }): Promise<proxmox_access_privilege_check_response_t>;
}

export interface storage_service_input_i {
  request_client: proxmox_request_client_i;
  access_service?: storage_access_checker_i;
  http_request_impl?: typeof http.request;
  https_request_impl?: typeof https.request;
  request_timeout_ms_default?: number;
  max_response_bytes?: number;
}

export class StorageService {
  public readonly request_client: proxmox_request_client_i;
  public readonly access_service: storage_access_checker_i;
  public readonly http_request_impl: typeof http.request;
  public readonly https_request_impl: typeof https.request;
  public readonly request_timeout_ms_default: number;
  public readonly max_response_bytes: number;

  constructor(params: storage_service_input_i) {
    this.request_client = params.request_client;
    this.access_service = params.access_service ?? new AccessService({
      request_client: params.request_client,
    });
    this.http_request_impl = params.http_request_impl ?? http.request;
    this.https_request_impl = params.https_request_impl ?? https.request;
    this.request_timeout_ms_default = params.request_timeout_ms_default ?? 30000;
    this.max_response_bytes = params.max_response_bytes ?? 1024 * 1024;
  }

  public async listStorageContent(
    params: proxmox_storage_content_list_query_i,
  ): Promise<proxmox_storage_content_list_response_t> {
    const validated = ValidateStorageReference({
      node_id: params.node_id,
      storage: params.storage,
    });
    const query = BuildStorageContentListQuery(params);
    const response = await this.request_client.request<unknown[]>({
      method: "GET" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(validated.node_id)}/storage/${encodeURIComponent(validated.storage)}/content`,
      node_id: validated.node_id,
      query,
      retry_allowed: true,
    });

    const normalized_data = NormalizeStorageContentRecords({
      raw_records: response.data,
      node_id: validated.node_id,
      storage: validated.storage,
    });
    return {
      ...response,
      data: normalized_data,
    };
  }

  public async listBackups(
    params: { node_id: string; storage: string; vmid?: string | number },
  ): Promise<proxmox_storage_content_list_response_t> {
    return this.listStorageContent({
      node_id: params.node_id,
      storage: params.storage,
      vmid: params.vmid,
      content: "backup",
    });
  }

  public async listIsoImages(
    params: { node_id: string; storage: string },
  ): Promise<proxmox_storage_content_list_response_t> {
    return this.listStorageContent({
      node_id: params.node_id,
      storage: params.storage,
      content: "iso",
    });
  }

  public async listCtTemplates(
    params: { node_id: string; storage: string },
  ): Promise<proxmox_storage_content_list_response_t> {
    return this.listStorageContent({
      node_id: params.node_id,
      storage: params.storage,
      content: "vztmpl",
    });
  }

  public async deleteContent(
    params: proxmox_storage_delete_input_i,
  ): Promise<proxmox_storage_task_response_t> {
    const validated = ValidateStorageReference({
      node_id: params.node_id,
      storage: params.storage,
      volume_id: params.volume_id,
    });
    const query = BuildDeleteContentQuery(params.delay);
    const response = await this.request_client.request<unknown>({
      method: "DELETE" as proxmox_http_method_t,
      path: `/api2/json/nodes/${encodeURIComponent(validated.node_id)}/storage/${encodeURIComponent(validated.storage)}/content/${encodeURIComponent(validated.volume_id as string)}`,
      node_id: validated.node_id,
      query,
      retry_allowed: false,
    });
    const task_id = ResolveStorageTaskId({
      raw_data: response.data,
      fallback_node_id: validated.node_id,
    });
    return {
      ...response,
      data: {
        operation: "delete_content",
        node_id: validated.node_id,
        storage: validated.storage,
        volume_id: validated.volume_id,
        task_id,
      },
    };
  }

  public async uploadContent(
    params: proxmox_storage_upload_input_i,
  ): Promise<proxmox_storage_task_response_t> {
    const validated = ValidateStorageReference({
      node_id: params.node_id,
      storage: params.storage,
    });
    const content_type = ValidateContentType(params.content_type);
    const file_path = ValidateFilePath(params.file_path);
    const file_stat = ValidateUploadFile({
      file_path,
    });
    const filename = ResolveUploadFilename({
      file_path,
      filename: params.filename,
    });
    const checksum = ValidateOptionalNonEmptyString({
      value: params.checksum,
      field_name: "checksum",
    });
    const checksum_algorithm = ValidateOptionalChecksumAlgorithm(params.checksum_algorithm);

    const node_connection = this.request_client.resolveNode(validated.node_id);
    const auth_header = await node_connection.auth_provider.getAuthHeader();
    const request_url = BuildNodeUrl({
      node_connection,
      path: `/api2/json/nodes/${encodeURIComponent(validated.node_id)}/storage/${encodeURIComponent(validated.storage)}/upload`,
    });

    const text_fields: Array<{ name: string; value: string }> = [
      { name: "content", value: content_type },
    ];
    if (checksum !== undefined) {
      text_fields.push({ name: "checksum", value: checksum });
    }
    if (checksum_algorithm !== undefined) {
      text_fields.push({ name: "checksum-algorithm", value: checksum_algorithm });
    }

    const upload_response = await this.sendMultipartUploadRequest({
      request_url,
      node_connection,
      auth_header,
      file_path,
      file_name: filename,
      file_size: file_stat.size,
      text_fields,
    });
    if (upload_response.status_code < 200 || upload_response.status_code >= 300) {
      throw MapHttpStatusToProxmoxError({
        status_code: upload_response.status_code,
        path: request_url.pathname,
        message: ExtractMessageFromBody(upload_response.body),
        body: upload_response.body,
      });
    }

    const parser = new ProxmoxApiParser();
    const parsed_response = parser.parseResponse<unknown>({
      status: upload_response.status_code,
      status_text: upload_response.status_text,
      headers: upload_response.headers,
      body: upload_response.body,
    });
    const task_id = ResolveStorageTaskId({
      raw_data: parsed_response.data,
      fallback_node_id: validated.node_id,
    });

    return {
      status_code: parsed_response.status_code,
      success: parsed_response.success,
      message: parsed_response.message,
      data: {
        operation: "upload_content",
        node_id: validated.node_id,
        storage: validated.storage,
        task_id,
        content_type,
      },
    };
  }

  public async downloadContent(
    params: proxmox_storage_download_input_i,
  ): Promise<proxmox_storage_download_response_t> {
    const validated = ValidateStorageReference({
      node_id: params.node_id,
      storage: params.storage,
      volume_id: params.volume_id,
    });
    const destination_path = ValidateDestinationPath(params.destination_path);
    const overwrite = params.overwrite === true;
    ValidateDownloadDestination({
      destination_path,
      overwrite,
    });

    const node_connection = this.request_client.resolveNode(validated.node_id);
    const auth_header = await node_connection.auth_provider.getAuthHeader();
    const request_url = BuildNodeUrl({
      node_connection,
      path: `/api2/json/nodes/${encodeURIComponent(validated.node_id)}/storage/${encodeURIComponent(validated.storage)}/download`,
    });
    request_url.searchParams.set("volume", validated.volume_id as string);

    const download_response = await this.sendDownloadRequest({
      request_url,
      node_connection,
      auth_header,
      destination_path,
      overwrite,
    });
    if (download_response.status_code < 200 || download_response.status_code >= 300) {
      throw MapHttpStatusToProxmoxError({
        status_code: download_response.status_code,
        path: request_url.pathname,
        message: ExtractMessageFromBody(download_response.body),
        body: download_response.body,
      });
    }

    return {
      status_code: download_response.status_code,
      success: true,
      data: {
        node_id: validated.node_id,
        storage: validated.storage,
        volume_id: validated.volume_id as string,
        destination_path,
        bytes_written: download_response.bytes_written,
      },
    };
  }

  public async canAuditStorage(
    params: proxmox_storage_permission_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.checkStoragePrivilege({
      node_id: params.node_id,
      storage: params.storage,
      auth_id: params.auth_id,
      privilege: "Datastore.Audit",
    });
  }

  public async canAllocateTemplate(
    params: proxmox_storage_permission_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.checkStoragePrivilege({
      node_id: params.node_id,
      storage: params.storage,
      auth_id: params.auth_id,
      privilege: "Datastore.AllocateTemplate",
    });
  }

  public async canAllocateSpace(
    params: proxmox_storage_permission_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.checkStoragePrivilege({
      node_id: params.node_id,
      storage: params.storage,
      auth_id: params.auth_id,
      privilege: "Datastore.AllocateSpace",
    });
  }

  public async canModifyPermissions(
    params: proxmox_storage_permission_query_i,
  ): Promise<proxmox_access_privilege_check_response_t> {
    return this.checkStoragePrivilege({
      node_id: params.node_id,
      storage: params.storage,
      auth_id: params.auth_id,
      privilege: "Permissions.Modify",
    });
  }

  private async checkStoragePrivilege(params: {
    node_id: string;
    storage: string;
    auth_id?: string;
    privilege: string;
  }): Promise<proxmox_access_privilege_check_response_t> {
    ValidateStorageReference({
      node_id: params.node_id,
      storage: params.storage,
    });
    const path = BuildStorageAclPath(params.storage);
    if (params.auth_id === undefined) {
      return this.access_service.hasCurrentPrivilege({
        path,
        privilege: params.privilege,
      });
    }
    return this.access_service.hasIdentityPrivilege({
      path,
      auth_id: params.auth_id,
      privilege: params.privilege,
    });
  }

  private async sendMultipartUploadRequest(params: {
    request_url: URL;
    node_connection: proxmox_node_connection_i;
    auth_header: string;
    file_path: string;
    file_name: string;
    file_size: number;
    text_fields: Array<{ name: string; value: string }>;
  }): Promise<{
    status_code: number;
    status_text: string;
    headers: Record<string, string>;
    body: string;
  }> {
    const boundary = `proxmoxlib-${randomBytes(8).toString("hex")}`;
    const text_field_buffers = params.text_fields.map((text_field) => BuildMultipartTextField({
      boundary,
      name: text_field.name,
      value: text_field.value,
    }));
    const file_header = BuildMultipartFileHeader({
      boundary,
      field_name: "filename",
      file_name: params.file_name,
    });
    const file_footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

    const content_length = text_field_buffers.reduce((running_total, buffer) => running_total + buffer.length, 0)
      + file_header.length
      + params.file_size
      + file_footer.length;

    return new Promise((resolve, reject) => {
      const request_impl = params.node_connection.protocol === "https"
        ? this.https_request_impl
        : this.http_request_impl;
      const request_options = BuildRequestOptions({
        node_connection: params.node_connection,
        method: "POST",
        headers: {
          Authorization: params.auth_header,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(content_length),
        },
      });

      const request = request_impl(params.request_url, request_options, (response) => {
        CollectResponseBody({
          response,
          max_response_bytes: this.max_response_bytes,
        }).then((response_body) => {
          resolve({
            status_code: response.statusCode ?? 0,
            status_text: response.statusMessage ?? "",
            headers: NormalizeHeaders(response.headers),
            body: response_body,
          });
        }).catch(reject);
      });

      request.setTimeout(this.request_timeout_ms_default, () => {
        request.destroy(new Error("request_timeout"));
      });
      request.on("error", (error) => {
        if (error instanceof Error && error.message === "request_timeout") {
          reject(new ProxmoxTimeoutError({
            code: "proxmox.transport.timeout",
            message: "Request timed out.",
            details: {
              field: "request_timeout",
            },
            cause: error,
          }));
          return;
        }
        reject(new ProxmoxTransportError({
          code: "proxmox.transport.request_failed",
          message: "Request to Proxmox host failed.",
          details: {
            field: "http_transport",
          },
          cause: error,
        }));
      });

      for (const text_field_buffer of text_field_buffers) {
        request.write(text_field_buffer);
      }
      request.write(file_header);

      const file_stream = createReadStream(params.file_path);
      file_stream.on("error", (error) => {
        request.destroy(error);
      });
      file_stream.on("end", () => {
        request.write(file_footer);
        request.end();
      });
      file_stream.pipe(request, { end: false });
    });
  }

  private async sendDownloadRequest(params: {
    request_url: URL;
    node_connection: proxmox_node_connection_i;
    auth_header: string;
    destination_path: string;
    overwrite: boolean;
  }): Promise<{
    status_code: number;
    body: string;
    bytes_written: number;
  }> {
    return new Promise((resolve, reject) => {
      const request_impl = params.node_connection.protocol === "https"
        ? this.https_request_impl
        : this.http_request_impl;
      const request_options = BuildRequestOptions({
        node_connection: params.node_connection,
        method: "GET",
        headers: {
          Authorization: params.auth_header,
          Accept: "application/octet-stream",
        },
      });

      const request = request_impl(params.request_url, request_options, (response) => {
        const status_code = response.statusCode ?? 0;
        if (status_code < 200 || status_code >= 300) {
          CollectResponseBody({
            response,
            max_response_bytes: this.max_response_bytes,
          }).then((response_body) => {
            resolve({
              status_code,
              body: response_body,
              bytes_written: 0,
            });
          }).catch(reject);
          return;
        }

        const file_flags = params.overwrite ? "w" : "wx";
        const output_stream = createWriteStream(params.destination_path, {
          flags: file_flags,
        });
        let bytes_written = 0;

        response.on("data", (chunk: Buffer | string) => {
          bytes_written += typeof chunk === "string"
            ? Buffer.byteLength(chunk)
            : chunk.length;
        });
        output_stream.on("error", (error) => {
          response.destroy(error);
        });
        response.on("error", (error) => {
          output_stream.destroy(error);
        });
        output_stream.on("finish", () => {
          const resolved_bytes_written = bytes_written > 0
            ? bytes_written
            : output_stream.bytesWritten;
          resolve({
            status_code,
            body: "",
            bytes_written: resolved_bytes_written,
          });
        });

        response.pipe(output_stream);
      });

      request.setTimeout(this.request_timeout_ms_default, () => {
        request.destroy(new Error("request_timeout"));
      });
      request.on("error", (error) => {
        if (existsSync(params.destination_path)) {
          try {
            unlinkSync(params.destination_path);
          } catch {
            // Preserve original failure.
          }
        }

        if (error instanceof Error && error.message === "request_timeout") {
          reject(new ProxmoxTimeoutError({
            code: "proxmox.transport.timeout",
            message: "Request timed out.",
            details: {
              field: "request_timeout",
            },
            cause: error,
          }));
          return;
        }

        reject(new ProxmoxTransportError({
          code: "proxmox.transport.request_failed",
          message: "Request to Proxmox host failed.",
          details: {
            field: "http_transport",
          },
          cause: error,
        }));
      });

      request.end();
    });
  }
}

function ValidateStorageReference(params: {
  node_id: string;
  storage: string;
  volume_id?: string;
}): { node_id: string; storage: string; volume_id?: string } {
  const node_id = params.node_id.trim();
  if (!node_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "node_id is required and cannot be empty.",
      details: {
        field: "node_id",
      },
    });
  }

  const storage = params.storage.trim();
  if (!storage) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "storage is required and cannot be empty.",
      details: {
        field: "storage",
      },
    });
  }

  if (params.volume_id === undefined) {
    return {
      node_id,
      storage,
    };
  }

  const volume_id = params.volume_id.trim();
  if (!volume_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "volume_id is required and cannot be empty.",
      details: {
        field: "volume_id",
      },
    });
  }

  return {
    node_id,
    storage,
    volume_id,
  };
}

function BuildStorageContentListQuery(params: proxmox_storage_content_list_query_i): { [key: string]: string } {
  const query: { [key: string]: string } = {};
  if (params.content !== undefined) {
    query.content = ValidateStorageContentFilter(params.content);
  }
  if (params.vmid !== undefined) {
    const vmid = String(params.vmid).trim();
    if (!vmid) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "vmid filter must not be empty.",
        details: {
          field: "vmid",
        },
      });
    }
    query.vmid = vmid;
  }
  return query;
}

function BuildDeleteContentQuery(delay: number | undefined): { [key: string]: string } | undefined {
  if (delay === undefined) {
    return undefined;
  }
  if (!Number.isInteger(delay) || delay < 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "delay must be a non-negative integer.",
      details: {
        field: "delay",
      },
    });
  }
  return {
    delay: String(delay),
  };
}

function NormalizeStorageContentRecords(params: {
  raw_records: unknown;
  node_id: string;
  storage: string;
}): proxmox_storage_content_record_t[] {
  if (!Array.isArray(params.raw_records)) {
    return [];
  }
  const output: proxmox_storage_content_record_t[] = [];
  for (const raw_record of params.raw_records) {
    if (typeof raw_record !== "object" || raw_record === null || Array.isArray(raw_record)) {
      continue;
    }
    const record = raw_record as Record<string, unknown>;
    const content = ToOptionalString(record.content);
    const volume_id = ResolveVolumeId(record);
    output.push({
      volume_id,
      storage: ToOptionalString(record.storage) ?? params.storage,
      node: ToOptionalString(record.node) ?? params.node_id,
      content,
      normalized_content: NormalizeStorageContentKind(content),
      format: ToOptionalString(record.format),
      size: ToOptionalNumber(record.size),
      vmid: typeof record.vmid === "string" || typeof record.vmid === "number"
        ? record.vmid
        : undefined,
      ctime: ToOptionalInteger(record.ctime),
      notes: ToOptionalString(record.notes),
      protected: typeof record.protected === "boolean" || typeof record.protected === "number"
        ? record.protected
        : undefined,
      raw: record,
    });
  }
  return output;
}

function ResolveVolumeId(record: Record<string, unknown>): string {
  const candidates = [record.volid, record.volume, record.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "unknown";
}

function ValidateContentType(content_type: "iso" | "vztmpl"): "iso" | "vztmpl" {
  if (content_type !== "iso" && content_type !== "vztmpl") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "content_type must be iso or vztmpl.",
      details: {
        field: "content_type",
      },
    });
  }
  return content_type;
}

function ValidateFilePath(file_path: string): string {
  const normalized_path = file_path.trim();
  if (!normalized_path) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "file_path is required and cannot be empty.",
      details: {
        field: "file_path",
      },
    });
  }
  return normalized_path;
}

function ValidateUploadFile(params: { file_path: string }): { size: number } {
  let file_stats;
  try {
    file_stats = statSync(params.file_path);
  } catch (error) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "file_path must point to a readable file.",
      details: {
        field: "file_path",
      },
      cause: error,
    });
  }
  if (!file_stats.isFile()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "file_path must point to a regular file.",
      details: {
        field: "file_path",
      },
    });
  }
  if (file_stats.size <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "file_path must point to a non-empty file.",
      details: {
        field: "file_path",
      },
    });
  }
  return {
    size: file_stats.size,
  };
}

function ResolveUploadFilename(params: { file_path: string; filename?: string }): string {
  const candidate = params.filename?.trim() || basename(params.file_path);
  if (!candidate.trim()) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "filename cannot be empty.",
      details: {
        field: "filename",
      },
    });
  }
  return candidate;
}

function ValidateOptionalNonEmptyString(params: {
  value: string | undefined;
  field_name: string;
}): string | undefined {
  if (params.value === undefined) {
    return undefined;
  }
  const normalized = params.value.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} cannot be empty.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized;
}

function ValidateOptionalChecksumAlgorithm(checksum_algorithm: string | undefined): string | undefined {
  const normalized = ValidateOptionalNonEmptyString({
    value: checksum_algorithm,
    field_name: "checksum_algorithm",
  });
  if (normalized === undefined) {
    return undefined;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "checksum_algorithm contains unsupported characters.",
      details: {
        field: "checksum_algorithm",
      },
    });
  }
  return normalized;
}

function BuildMultipartTextField(params: {
  boundary: string;
  name: string;
  value: string;
}): Buffer {
  return Buffer.from(
    `--${params.boundary}\r\n`
    + `Content-Disposition: form-data; name="${EscapeMultipartValue(params.name)}"\r\n\r\n`
    + `${params.value}\r\n`,
    "utf8",
  );
}

function BuildMultipartFileHeader(params: {
  boundary: string;
  field_name: string;
  file_name: string;
}): Buffer {
  return Buffer.from(
    `--${params.boundary}\r\n`
    + `Content-Disposition: form-data; name="${EscapeMultipartValue(params.field_name)}"; filename="${EscapeMultipartValue(params.file_name)}"\r\n`
    + "Content-Type: application/octet-stream\r\n\r\n",
    "utf8",
  );
}

function EscapeMultipartValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function ValidateDestinationPath(destination_path: string): string {
  const normalized_path = destination_path.trim();
  if (!normalized_path) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "destination_path is required and cannot be empty.",
      details: {
        field: "destination_path",
      },
    });
  }
  return normalized_path;
}

function ValidateDownloadDestination(params: {
  destination_path: string;
  overwrite: boolean;
}): void {
  if (existsSync(params.destination_path) && !params.overwrite) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "destination_path already exists and overwrite is false.",
      details: {
        field: "destination_path",
      },
    });
  }
  if (!existsSync(dirname(params.destination_path))) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "destination_path parent directory does not exist.",
      details: {
        field: "destination_path",
      },
    });
  }
}

function BuildStorageAclPath(storage: string): string {
  return `/storage/${storage.trim()}`;
}

function BuildNodeUrl(params: {
  node_connection: proxmox_node_connection_i;
  path: string;
}): URL {
  const protocol = params.node_connection.protocol;
  const port = params.node_connection.port ?? (protocol === "https" ? 8006 : 80);
  return new URL(`${protocol}://${params.node_connection.host}:${port}${params.path}`);
}

function BuildRequestOptions(params: {
  node_connection: proxmox_node_connection_i;
  method: string;
  headers: Record<string, string>;
}): http.RequestOptions | https.RequestOptions {
  const options: http.RequestOptions | https.RequestOptions = {
    method: params.method,
    headers: params.headers,
  };
  if (params.node_connection.protocol === "https") {
    const https_options = options as https.RequestOptions;
    https_options.rejectUnauthorized = params.node_connection.verify_tls;
    if (params.node_connection.ca_bundle_path) {
      try {
        https_options.ca = readFileSync(params.node_connection.ca_bundle_path, "utf8");
      } catch (error) {
        throw new ProxmoxTransportError({
          code: "proxmox.transport.request_failed",
          message: "Request to Proxmox host failed.",
          details: {
            field: "ca_bundle_path",
          },
          cause: error,
        });
      }
    }
  }
  return options;
}

async function CollectResponseBody(params: {
  response: http.IncomingMessage;
  max_response_bytes: number;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total_size = 0;

    params.response.on("data", (chunk: Buffer | string) => {
      const normalized_chunk = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      total_size += normalized_chunk.length;
      if (total_size > params.max_response_bytes) {
        reject(new ProxmoxTransportError({
          code: "proxmox.transport.request_failed",
          message: "Request to Proxmox host failed.",
          details: {
            field: "http_transport",
          },
          cause: new Error("response_too_large"),
        }));
        return;
      }
      chunks.push(normalized_chunk);
    });
    params.response.on("error", (error) => {
      reject(error);
    });
    params.response.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function NormalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const normalized_headers: Record<string, string> = {};
  for (const [header_name, header_value] of Object.entries(headers)) {
    if (header_value === undefined) {
      continue;
    }
    normalized_headers[header_name] = Array.isArray(header_value)
      ? header_value.join(", ")
      : String(header_value);
  }
  return normalized_headers;
}

function ExtractMessageFromBody(body: string): string {
  if (!body) {
    return "Storage request failed.";
  }
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.errors === "string" && parsed.errors.trim()) {
      return parsed.errors.trim();
    }
  } catch {
    // Fallback below.
  }
  return "Storage request failed.";
}

function ResolveStorageTaskId(params: {
  raw_data: unknown;
  fallback_node_id: string;
}): string {
  if (typeof params.raw_data === "string" && params.raw_data.trim()) {
    return params.raw_data.trim();
  }
  if (typeof params.raw_data === "object" && params.raw_data !== null && !Array.isArray(params.raw_data)) {
    const record = params.raw_data as Record<string, unknown>;
    const task_candidates = [record.upid, record.task, record.task_id, record.data];
    for (const task_candidate of task_candidates) {
      if (typeof task_candidate === "string" && task_candidate.trim()) {
        return task_candidate.trim();
      }
      if (typeof task_candidate === "object" && task_candidate !== null && !Array.isArray(task_candidate)) {
        const nested = task_candidate as Record<string, unknown>;
        if (typeof nested.upid === "string" && nested.upid.trim()) {
          return nested.upid.trim();
        }
      }
    }
  }
  return `UPID:${params.fallback_node_id}:unknown`;
}

function ValidateStorageContentFilter(content: proxmox_storage_content_filter_t): proxmox_storage_content_filter_t {
  if (content === "backup" || content === "iso" || content === "vztmpl") {
    return content;
  }
  throw new ProxmoxValidationError({
    code: "proxmox.validation.invalid_input",
    message: "content must be backup, iso, or vztmpl.",
    details: {
      field: "content",
    },
  });
}

function NormalizeStorageContentKind(content: string | undefined): proxmox_storage_content_kind_t {
  if (content === "backup" || content === "iso" || content === "vztmpl") {
    return content;
  }
  return "unknown";
}

function ToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function ToOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function ToOptionalInteger(value: unknown): number | undefined {
  const parsed = ToOptionalNumber(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (!Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}
