import {
  ProxmoxError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";
import { LxcDestroyHelper } from "./lxc_destroy_helper";
import { LxcHelper } from "./lxc_helper";
import {
  proxmox_lxc_helper_bulk_create_input_i,
  proxmox_lxc_helper_bulk_create_item_t,
  proxmox_lxc_helper_bulk_create_response_t,
  proxmox_lxc_helper_bulk_destroy_input_i,
  proxmox_lxc_helper_bulk_destroy_item_t,
  proxmox_lxc_helper_bulk_destroy_response_t,
  proxmox_lxc_helper_bulk_error_t,
  proxmox_lxc_helper_bulk_hostname_strategy_i,
  proxmox_lxc_helper_bulk_summary_t,
  proxmox_lxc_helper_create_input_i,
  proxmox_lxc_helper_create_response_t,
  proxmox_lxc_helper_destroy_input_i,
  proxmox_lxc_helper_destroy_response_t,
  proxmox_lxc_id_t,
} from "../types/proxmox_service_types";

const MAX_BULK_CONCURRENCY = 5;
const DEFAULT_BULK_CONCURRENCY = 2;

type normalized_lxc_bulk_create_input_t = {
  base_input: proxmox_lxc_helper_create_input_i;
  container_ids: string[];
  hostname_strategy: proxmox_lxc_helper_bulk_hostname_strategy_i;
  concurrency_limit: number;
  continue_on_error: boolean;
  wait_for_task: boolean;
  dry_run: boolean;
};

type normalized_lxc_bulk_destroy_input_t = {
  node_id: string;
  container_ids: string[];
  stop_first: boolean;
  force_stop: boolean;
  purge?: boolean;
  ignore_not_found: boolean;
  dry_run: boolean;
  wait_for_task: boolean;
  timeout_ms?: number;
  retry_allowed?: boolean;
  preflight?: proxmox_lxc_helper_destroy_input_i["preflight"];
  concurrency_limit: number;
  continue_on_error: boolean;
};

type indexed_container_id_t = {
  index: number;
  container_id: string;
};

type indexed_bulk_create_work_item_t = indexed_container_id_t & {
  hostname: string;
};

export interface lxc_bulk_helper_input_i {
  lxc_helper: LxcHelper;
  lxc_destroy_helper: LxcDestroyHelper;
}

export class LxcBulkHelper {
  public readonly lxc_helper: LxcHelper;
  public readonly lxc_destroy_helper: LxcDestroyHelper;

  constructor(params: lxc_bulk_helper_input_i) {
    this.lxc_helper = params.lxc_helper;
    this.lxc_destroy_helper = params.lxc_destroy_helper;
  }

  public async createLxcContainersBulk(
    params: proxmox_lxc_helper_bulk_create_input_i,
  ): Promise<proxmox_lxc_helper_bulk_create_response_t> {
    const normalized_input = NormalizeBulkCreateInput(params);
    const work_items = BuildBulkCreateWorkItems(normalized_input);
    const result = await this.executeBulkCreateItems({
      normalized_input,
      work_items,
    });

    return {
      success: true,
      status_code: 200,
      data: {
        node_id: normalized_input.base_input.general.node_id,
        dry_run: normalized_input.dry_run,
        continue_on_error: normalized_input.continue_on_error,
        concurrency_limit: normalized_input.concurrency_limit,
        summary: result.summary,
        items: result.items,
      },
    };
  }

  public async teardownAndDestroyLxcContainersBulk(
    params: proxmox_lxc_helper_bulk_destroy_input_i,
  ): Promise<proxmox_lxc_helper_bulk_destroy_response_t> {
    const normalized_input = NormalizeBulkDestroyInput(params);
    const work_items = normalized_input.container_ids.map((container_id, index) => ({
      index,
      container_id,
    }));
    const result = await this.executeBulkDestroyItems({
      normalized_input,
      work_items,
    });

    return {
      success: true,
      status_code: 200,
      data: {
        node_id: normalized_input.node_id,
        dry_run: normalized_input.dry_run,
        continue_on_error: normalized_input.continue_on_error,
        concurrency_limit: normalized_input.concurrency_limit,
        summary: result.summary,
        items: result.items,
      },
    };
  }

  private async executeBulkCreateItems(params: {
    normalized_input: normalized_lxc_bulk_create_input_t;
    work_items: indexed_bulk_create_work_item_t[];
  }): Promise<{
    summary: proxmox_lxc_helper_bulk_summary_t;
    items: proxmox_lxc_helper_bulk_create_item_t[];
  }> {
    const requested = params.work_items.length;
    const items: proxmox_lxc_helper_bulk_create_item_t[] = [];
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (
      let work_item_start = 0;
      work_item_start < params.work_items.length;
      work_item_start += params.normalized_input.concurrency_limit
    ) {
      const chunk = params.work_items.slice(
        work_item_start,
        work_item_start + params.normalized_input.concurrency_limit,
      );
      const chunk_results = await Promise.all(
        chunk.map(async (work_item) => this.executeCreateWorkItem({
          normalized_input: params.normalized_input,
          work_item,
        })),
      );

      for (const item_result of chunk_results) {
        items.push(item_result);
        attempted += 1;
        if (item_result.success) {
          succeeded += 1;
        } else {
          failed += 1;
        }
      }

      const chunk_has_failure = chunk_results.some((item_result) => item_result.success !== true);
      if (chunk_has_failure && !params.normalized_input.continue_on_error) {
        const remaining_work_items = params.work_items.slice(work_item_start + chunk.length);
        for (const skipped_work_item of remaining_work_items) {
          items.push({
            index: skipped_work_item.index,
            container_id: skipped_work_item.container_id,
            hostname: skipped_work_item.hostname,
            attempted: false,
            skipped: true,
            success: false,
            dry_run: params.normalized_input.dry_run,
          });
          skipped += 1;
        }
        break;
      }
    }

    return {
      summary: {
        requested,
        attempted,
        succeeded,
        failed,
        skipped,
      },
      items,
    };
  }

  private async executeCreateWorkItem(params: {
    normalized_input: normalized_lxc_bulk_create_input_t;
    work_item: indexed_bulk_create_work_item_t;
  }): Promise<proxmox_lxc_helper_bulk_create_item_t> {
    const create_input: proxmox_lxc_helper_create_input_i = {
      ...params.normalized_input.base_input,
      general: {
        ...params.normalized_input.base_input.general,
        container_id: params.work_item.container_id,
        hostname: params.work_item.hostname,
      },
      wait_for_task: params.normalized_input.wait_for_task,
      dry_run: params.normalized_input.dry_run,
    };

    try {
      const response = await this.lxc_helper.createLxcContainer(create_input);
      return {
        index: params.work_item.index,
        container_id: params.work_item.container_id,
        hostname: params.work_item.hostname,
        attempted: true,
        skipped: false,
        success: true,
        dry_run: params.normalized_input.dry_run,
        create_task: response.data.create_task,
        start_task: response.data.start_task,
        preflight_summary: response.data.preflight,
      };
    } catch (error) {
      return {
        index: params.work_item.index,
        container_id: params.work_item.container_id,
        hostname: params.work_item.hostname,
        attempted: true,
        skipped: false,
        success: false,
        dry_run: params.normalized_input.dry_run,
        error: BuildSafeBulkErrorRecord(error),
      };
    }
  }

  private async executeBulkDestroyItems(params: {
    normalized_input: normalized_lxc_bulk_destroy_input_t;
    work_items: indexed_container_id_t[];
  }): Promise<{
    summary: proxmox_lxc_helper_bulk_summary_t;
    items: proxmox_lxc_helper_bulk_destroy_item_t[];
  }> {
    const requested = params.work_items.length;
    const items: proxmox_lxc_helper_bulk_destroy_item_t[] = [];
    let attempted = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (
      let work_item_start = 0;
      work_item_start < params.work_items.length;
      work_item_start += params.normalized_input.concurrency_limit
    ) {
      const chunk = params.work_items.slice(
        work_item_start,
        work_item_start + params.normalized_input.concurrency_limit,
      );
      const chunk_results = await Promise.all(
        chunk.map(async (work_item) => this.executeDestroyWorkItem({
          normalized_input: params.normalized_input,
          work_item,
        })),
      );

      for (const item_result of chunk_results) {
        items.push(item_result);
        attempted += 1;
        if (item_result.success) {
          succeeded += 1;
        } else {
          failed += 1;
        }
      }

      const chunk_has_failure = chunk_results.some((item_result) => item_result.success !== true);
      if (chunk_has_failure && !params.normalized_input.continue_on_error) {
        const remaining_work_items = params.work_items.slice(work_item_start + chunk.length);
        for (const skipped_work_item of remaining_work_items) {
          items.push({
            index: skipped_work_item.index,
            container_id: skipped_work_item.container_id,
            attempted: false,
            skipped: true,
            success: false,
            dry_run: params.normalized_input.dry_run,
          });
          skipped += 1;
        }
        break;
      }
    }

    return {
      summary: {
        requested,
        attempted,
        succeeded,
        failed,
        skipped,
      },
      items,
    };
  }

  private async executeDestroyWorkItem(params: {
    normalized_input: normalized_lxc_bulk_destroy_input_t;
    work_item: indexed_container_id_t;
  }): Promise<proxmox_lxc_helper_bulk_destroy_item_t> {
    const destroy_input: proxmox_lxc_helper_destroy_input_i = {
      node_id: params.normalized_input.node_id,
      container_id: params.work_item.container_id,
      stop_first: params.normalized_input.stop_first,
      force_stop: params.normalized_input.force_stop,
      purge: params.normalized_input.purge,
      ignore_not_found: params.normalized_input.ignore_not_found,
      dry_run: params.normalized_input.dry_run,
      wait_for_task: params.normalized_input.wait_for_task,
      timeout_ms: params.normalized_input.timeout_ms,
      retry_allowed: params.normalized_input.retry_allowed,
      preflight: params.normalized_input.preflight,
    };

    try {
      const response =
        await this.lxc_destroy_helper.teardownAndDestroyLxcContainer(destroy_input);
      return {
        index: params.work_item.index,
        container_id: params.work_item.container_id,
        attempted: true,
        skipped: false,
        success: true,
        dry_run: params.normalized_input.dry_run,
        stopped: response.data.stopped,
        deleted: response.data.deleted,
        ignored_not_found: response.data.ignored_not_found,
        stop_task: response.data.stop_task,
        delete_task: response.data.delete_task,
        preflight_summary: response.data.preflight,
      };
    } catch (error) {
      return {
        index: params.work_item.index,
        container_id: params.work_item.container_id,
        attempted: true,
        skipped: false,
        success: false,
        dry_run: params.normalized_input.dry_run,
        error: BuildSafeBulkErrorRecord(error),
      };
    }
  }
}

function NormalizeBulkCreateInput(
  input: proxmox_lxc_helper_bulk_create_input_i,
): normalized_lxc_bulk_create_input_t {
  const count = ValidatePositiveInteger({
    value: input.count,
    field_name: "count",
  });
  const container_ids = ResolveBulkContainerIds({
    count,
    container_id_start: input.container_id_start,
    container_id_step: input.container_id_step,
    container_id_list: input.container_id_list,
    field_prefix: "create",
  });

  const wait_for_task = input.wait_for_tasks === true
    || input.base_input.wait_for_task === true;
  const dry_run = input.dry_run === undefined
    ? input.base_input.dry_run === true
    : input.dry_run === true;

  return {
    base_input: input.base_input,
    container_ids,
    hostname_strategy: NormalizeBulkHostnameStrategy(input.hostname_strategy),
    concurrency_limit: ValidateBulkConcurrencyLimit(input.concurrency_limit),
    continue_on_error: input.continue_on_error === true,
    wait_for_task,
    dry_run,
  };
}

function NormalizeBulkDestroyInput(
  input: proxmox_lxc_helper_bulk_destroy_input_i,
): normalized_lxc_bulk_destroy_input_t {
  const node_id = ValidateNodeId(input.node_id);
  const count = input.count === undefined
    ? undefined
    : ValidatePositiveInteger({
      value: input.count,
      field_name: "count",
    });
  const container_ids = ResolveBulkContainerIds({
    count,
    container_id_start: input.container_id_start,
    container_id_step: input.container_id_step,
    container_id_list: input.container_id_list,
    field_prefix: "destroy",
  });

  const wait_for_task = input.wait_for_tasks === true || input.wait_for_task === true;
  return {
    node_id,
    container_ids,
    stop_first: input.stop_first !== false,
    force_stop: input.force_stop === true,
    purge: input.purge === true ? true : undefined,
    ignore_not_found: input.ignore_not_found === true,
    dry_run: input.dry_run === true,
    wait_for_task,
    timeout_ms: input.timeout_ms,
    retry_allowed: input.retry_allowed,
    preflight: input.preflight,
    concurrency_limit: ValidateBulkConcurrencyLimit(input.concurrency_limit),
    continue_on_error: input.continue_on_error === true,
  };
}

function BuildBulkCreateWorkItems(
  normalized_input: normalized_lxc_bulk_create_input_t,
): indexed_bulk_create_work_item_t[] {
  const base_hostname = normalized_input.base_input.general.hostname;
  const generated_hostnames = new Set<string>();
  const work_items: indexed_bulk_create_work_item_t[] = [];
  for (let index = 0; index < normalized_input.container_ids.length; index += 1) {
    const container_id = normalized_input.container_ids[index];
    const hostname = BuildBulkHostname({
      base_hostname,
      container_id,
      index,
      hostname_strategy: normalized_input.hostname_strategy,
    });

    if (generated_hostnames.has(hostname)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Bulk LXC create generated duplicate hostnames.",
        details: {
          field: "hostname_strategy",
          value: hostname,
        },
      });
    }
    generated_hostnames.add(hostname);
    work_items.push({
      index,
      container_id,
      hostname,
    });
  }
  return work_items;
}

function ResolveBulkContainerIds(params: {
  count?: number;
  container_id_start?: proxmox_lxc_id_t;
  container_id_step?: number;
  container_id_list?: proxmox_lxc_id_t[];
  field_prefix: "create" | "destroy";
}): string[] {
  if (params.container_id_list !== undefined) {
    const ids = params.container_id_list.map((container_id, index) => ValidateContainerId({
      container_id,
      field_name: `${params.field_prefix}.container_id_list[${index}]`,
    }));
    if (ids.length === 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.missing_input",
        message: "container_id_list cannot be empty.",
        details: {
          field: "container_id_list",
        },
      });
    }
    if (params.count !== undefined && params.count !== ids.length) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "count must match container_id_list length when both are provided.",
        details: {
          field: "count",
          value: String(params.count),
        },
      });
    }

    const unique_ids = new Set(ids);
    if (unique_ids.size !== ids.length) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "container_id_list contains duplicate values.",
        details: {
          field: "container_id_list",
        },
      });
    }
    return ids;
  }

  if (params.count === undefined) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: "count is required when container_id_list is not provided.",
      details: {
        field: "count",
      },
    });
  }

  if (params.container_id_start === undefined) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.missing_input",
      message: "container_id_start is required when container_id_list is not provided.",
      details: {
        field: "container_id_start",
      },
    });
  }

  const start_id = Number.parseInt(
    ValidateContainerId({
      container_id: params.container_id_start,
      field_name: `${params.field_prefix}.container_id_start`,
    }),
    10,
  );
  const step = params.container_id_step === undefined
    ? 1
    : ValidatePositiveInteger({
      value: params.container_id_step,
      field_name: "container_id_step",
    });
  const ids: string[] = [];
  for (let index = 0; index < params.count; index += 1) {
    ids.push(String(start_id + (index * step)));
  }
  return ids;
}

function BuildBulkHostname(params: {
  base_hostname: string;
  container_id: string;
  index: number;
  hostname_strategy: proxmox_lxc_helper_bulk_hostname_strategy_i;
}): string {
  const ordinal = (params.hostname_strategy.start_index ?? 1) + params.index;
  if (params.hostname_strategy.template !== undefined) {
    const generated = params.hostname_strategy.template
      .replace(/\{index\}/g, String(ordinal))
      .replace(/\{container_id\}/g, params.container_id)
      .replace(/\{base_hostname\}/g, params.base_hostname);
    return generated.trim();
  }

  const resolved_prefix = params.hostname_strategy.prefix ?? params.base_hostname;
  const resolved_suffix = params.hostname_strategy.suffix ?? "";
  const resolved_separator = params.hostname_strategy.separator ?? "-";
  if (params.hostname_strategy.prefix !== undefined
    || params.hostname_strategy.suffix !== undefined
    || params.hostname_strategy.start_index !== undefined) {
    return `${resolved_prefix}${resolved_separator}${ordinal}${resolved_suffix}`.trim();
  }

  return `${params.base_hostname}-${ordinal}`.trim();
}

function NormalizeBulkHostnameStrategy(
  strategy: proxmox_lxc_helper_bulk_hostname_strategy_i | undefined,
): proxmox_lxc_helper_bulk_hostname_strategy_i {
  if (strategy === undefined) {
    return {};
  }

  const normalized: proxmox_lxc_helper_bulk_hostname_strategy_i = {};
  if (strategy.template !== undefined) {
    const template = strategy.template.trim();
    if (!template) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "hostname_strategy.template cannot be empty when provided.",
        details: {
          field: "hostname_strategy.template",
        },
      });
    }
    normalized.template = template;
  }
  if (strategy.prefix !== undefined) {
    const prefix = strategy.prefix.trim();
    if (!prefix) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "hostname_strategy.prefix cannot be empty when provided.",
        details: {
          field: "hostname_strategy.prefix",
        },
      });
    }
    normalized.prefix = prefix;
  }
  if (strategy.suffix !== undefined) {
    normalized.suffix = strategy.suffix.trim();
  }
  if (strategy.separator !== undefined) {
    normalized.separator = strategy.separator;
  }
  if (strategy.start_index !== undefined) {
    normalized.start_index = ValidatePositiveInteger({
      value: strategy.start_index,
      field_name: "hostname_strategy.start_index",
    });
  }
  return normalized;
}

function ValidatePositiveInteger(params: {
  value: number;
  field_name: string;
}): number {
  if (!Number.isInteger(params.value) || params.value <= 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a positive integer.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return params.value;
}

function ValidateContainerId(params: {
  container_id: proxmox_lxc_id_t;
  field_name: string;
}): string {
  if (typeof params.container_id === "number") {
    if (!Number.isInteger(params.container_id) || params.container_id <= 0) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: `${params.field_name} must be a positive integer.`,
        details: {
          field: params.field_name,
        },
      });
    }
    return String(params.container_id);
  }

  const normalized = params.container_id.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be a positive integer.`,
      details: {
        field: params.field_name,
      },
    });
  }
  return normalized;
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

function ValidateBulkConcurrencyLimit(
  concurrency_limit: number | undefined,
): number {
  if (concurrency_limit === undefined) {
    return DEFAULT_BULK_CONCURRENCY;
  }
  const normalized = ValidatePositiveInteger({
    value: concurrency_limit,
    field_name: "concurrency_limit",
  });
  if (normalized > MAX_BULK_CONCURRENCY) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `concurrency_limit cannot exceed ${MAX_BULK_CONCURRENCY}.`,
      details: {
        field: "concurrency_limit",
      },
    });
  }
  return normalized;
}

function BuildSafeBulkErrorRecord(error: unknown): proxmox_lxc_helper_bulk_error_t {
  if (error instanceof ProxmoxError) {
    const record: proxmox_lxc_helper_bulk_error_t = {
      code: error.code,
      message: error.message,
      status_code: error.status_code,
    };

    if (typeof error.details?.path === "string" && error.details.path.trim().length > 0) {
      record.path = error.details.path;
    }
    if (typeof error.details?.field === "string" && error.details.field.trim().length > 0) {
      record.field = error.details.field;
    }
    return record;
  }

  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
    };
  }

  return {
    message: "Unknown error occurred.",
  };
}
