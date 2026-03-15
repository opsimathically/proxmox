import { LxcService } from "./lxc_service";
import {
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_open_input_i,
  proxmox_lxc_terminal_session_t,
} from "../types/proxmox_service_types";
import {
  proxmox_expect_callback_matcher_result_t,
  proxmox_expect_callback_metadata_t,
  proxmox_expect_match_result_t,
  proxmox_expect_matcher_t,
  proxmox_expect_run_script_input_t,
  proxmox_expect_script_result_t,
  proxmox_expect_send_and_expect_input_t,
  proxmox_expect_step_result_t,
  proxmox_expect_step_t,
  proxmox_expect_stream_target_t,
  proxmox_expect_transcript_entry_t,
  proxmox_expect_wait_for_input_t,
  proxmox_expect_wait_for_result_t,
} from "../types/proxmox_expect_types";
import {
  ProxmoxExpectAbortedError,
  ProxmoxExpectCallbackError,
  ProxmoxExpectCallbackResultError,
  ProxmoxExpectCallbackTimeoutError,
  ProxmoxExpectPatternError,
  ProxmoxExpectSessionClosedError,
  ProxmoxExpectStepFailedError,
  ProxmoxExpectTimeoutError,
  ProxmoxTerminalSessionError,
  ProxmoxValidationError,
} from "../errors/proxmox_error";

interface lxc_expect_service_dependency_i {
  openTerminalSession(params: proxmox_lxc_terminal_open_input_i): Promise<proxmox_lxc_terminal_session_t>;
  sendTerminalInput(params: { session_id: string; input_text: string }): Promise<void>;
  resizeTerminal(params: { session_id: string; columns: number; rows: number }): Promise<proxmox_lxc_terminal_session_t>;
  readTerminalEvents(params: { session_id: string; max_events?: number }): Promise<proxmox_lxc_terminal_event_t[]>;
  getTerminalSession(params: { session_id: string }): proxmox_lxc_terminal_session_t;
  closeTerminalSession(params: { session_id: string; reason?: string; code?: number }): Promise<void>;
}

interface lxc_expect_service_input_i {
  lxc_service: lxc_expect_service_dependency_i;
}

interface proxmox_compiled_expect_matcher_i {
  matcher_id?: string;
  matcher_index: number;
  matcher_kind: "string" | "regex" | "callback";
  match: (params: {
    buffer_text: string;
    latest_chunk: string;
    capture_groups: boolean;
    elapsed_ms: number;
    step_id?: string;
    abort_signal?: AbortSignal;
    callback_timeout_ms?: number;
  }) => Promise<{
    matched: boolean;
    matched_text: string;
    capture_groups?: string[];
    metadata?: proxmox_expect_callback_metadata_t;
  }>;
}

interface proxmox_expect_wait_runtime_i {
  output_buffer: string;
  latest_output_chunk: string;
  output_truncated: boolean;
  consumed_event_count: number;
}

interface proxmox_expect_transcript_runtime_i {
  entries: proxmox_expect_transcript_entry_t[];
  text_bytes: number;
  max_buffer_bytes: number;
  truncated: boolean;
  total_output_bytes: number;
  total_input_bytes: number;
}

const DEFAULT_EXPECT_TIMEOUT_MS = 30000;
const DEFAULT_EXPECT_POLL_INTERVAL_MS = 100;
const DEFAULT_EXPECT_CALLBACK_TIMEOUT_MS = 500;
const DEFAULT_EXPECT_BUFFER_BYTES = 128 * 1024;
const DEFAULT_EXPECT_MAX_EVENTS_PER_POLL = 256;
const DEFAULT_EXPECT_MAX_SCRIPT_STEP_RETRIES = 0;

export class LxcExpectService {
  private readonly lxc_service: lxc_expect_service_dependency_i;

  constructor(params: lxc_expect_service_input_i) {
    this.lxc_service = params.lxc_service;
  }

  public static fromLxcService(params: { lxc_service: LxcService }): LxcExpectService {
    return new LxcExpectService({
      lxc_service: params.lxc_service,
    });
  }

  public async waitFor(params: proxmox_expect_wait_for_input_t): Promise<proxmox_expect_wait_for_result_t> {
    const normalized = NormalizeWaitForInput(params);
    return this.waitForInternal({
      session_id: normalized.session_id,
      expect_matchers: normalized.expect_matchers,
      timeout_ms: normalized.timeout_ms,
      poll_interval_ms: normalized.poll_interval_ms,
      max_buffer_bytes: normalized.max_buffer_bytes,
      capture_groups: normalized.capture_groups,
      callback_timeout_ms: normalized.callback_timeout_ms,
      fail_on_unexpected_output: normalized.fail_on_unexpected_output,
      unexpected_matchers: normalized.unexpected_matchers,
      stream_target: normalized.stream_target,
      abort_signal: normalized.abort_signal,
    });
  }

  public async sendAndExpect(params: proxmox_expect_send_and_expect_input_t): Promise<proxmox_expect_wait_for_result_t> {
    const send_input = ValidateSendInput(params.send_input, "send_input");
    await this.lxc_service.sendTerminalInput({
      session_id: params.session_id,
      input_text: send_input,
    });
    return this.waitFor({
      session_id: params.session_id,
      expect: params.expect,
      timeout_ms: params.timeout_ms,
      poll_interval_ms: params.poll_interval_ms,
      max_buffer_bytes: params.max_buffer_bytes,
      stream_target: params.stream_target,
      capture_groups: params.capture_groups,
      callback_timeout_ms: params.callback_timeout_ms,
      fail_on_unexpected_output: params.fail_on_unexpected_output,
      unexpected_matchers: params.unexpected_matchers,
      abort_signal: params.abort_signal,
    });
  }

  public async step(params: {
    session_id: string;
    step: proxmox_expect_step_t;
    default_timeout_ms?: number;
    default_poll_interval_ms?: number;
    default_callback_timeout_ms?: number;
    max_buffer_bytes?: number;
    stream_target?: proxmox_expect_stream_target_t;
    abort_signal?: AbortSignal;
  }): Promise<proxmox_expect_step_result_t> {
    const step_result = await this.executeStep({
      session_id: params.session_id,
      step: params.step,
      default_timeout_ms: params.default_timeout_ms,
      default_poll_interval_ms: params.default_poll_interval_ms,
      default_callback_timeout_ms: params.default_callback_timeout_ms,
      max_buffer_bytes: params.max_buffer_bytes,
      stream_target: params.stream_target,
      abort_signal: params.abort_signal,
      transcript: undefined,
    });
    return step_result;
  }

  public async runScript(params: proxmox_expect_run_script_input_t): Promise<proxmox_expect_script_result_t> {
    const normalized_script = NormalizeScript(params.script);
    const stream_target = ValidateStreamTarget(params.stream_target ?? "combined");
    const transcript = BuildTranscriptRuntime({
      max_buffer_bytes: normalized_script.max_buffer_bytes,
    });
    const started_epoch_ms = Date.now();
    const started_at = new Date(started_epoch_ms).toISOString();
    let session_id = params.target.session_id?.trim();
    let opened_session = false;
    let closed_session = false;
    const step_results: proxmox_expect_step_result_t[] = [];
    let failed_step_id: string | undefined;

    if (!session_id) {
      if (!params.target.open_terminal_input) {
        throw new ProxmoxValidationError({
          code: "proxmox.validation.invalid_input",
          message: "runScript requires target.session_id or target.open_terminal_input.",
          details: {
            field: "target",
          },
        });
      }
      const opened_terminal = await this.lxc_service.openTerminalSession(params.target.open_terminal_input);
      session_id = opened_terminal.session_id;
      opened_session = true;
      AppendTranscriptEntry({
        transcript,
        entry_type: "event",
        text: `session_opened:${session_id}`,
        redacted: false,
      });
    }

    const step_lookup = BuildStepLookup(normalized_script.steps);
    const step_order = normalized_script.steps.map((step) => step.step_id);
    let current_step_id: string | undefined = normalized_script.start_step_id ?? step_order[0];
    let succeeded = true;
    let executed_steps = 0;
    const max_executed_steps = Math.max(step_order.length * 32, 256);

    try {
      while (current_step_id !== undefined) {
        ThrowIfAborted(params.abort_signal);
        if (executed_steps > max_executed_steps) {
          throw new ProxmoxExpectStepFailedError({
            code: "proxmox.expect.step_failed",
            message: "Expect script exceeded maximum step execution guard.",
            details: {
              field: "script.max_executed_steps",
              value: String(max_executed_steps),
            },
          });
        }
        const step = step_lookup.get(current_step_id);
        if (!step) {
          throw new ProxmoxValidationError({
            code: "proxmox.validation.invalid_input",
            message: "Expect script referenced an unknown next step id.",
            details: {
              field: "step.next_step_id",
              value: current_step_id,
            },
          });
        }

        const max_retries = step.max_retries ?? normalized_script.max_step_retries ?? DEFAULT_EXPECT_MAX_SCRIPT_STEP_RETRIES;
        let step_result: proxmox_expect_step_result_t | undefined;
        let attempt = 0;
        while (attempt <= max_retries) {
          step_result = await this.executeStep({
            session_id,
            step,
            default_timeout_ms: normalized_script.default_timeout_ms,
            default_poll_interval_ms: normalized_script.default_poll_interval_ms,
            default_callback_timeout_ms: normalized_script.default_callback_timeout_ms,
            max_buffer_bytes: normalized_script.max_buffer_bytes,
            stream_target,
            abort_signal: params.abort_signal,
            transcript,
            override_attempt_count: attempt + 1,
          });
          if (step_result.status === "failed" && attempt < max_retries) {
            attempt += 1;
            continue;
          }
          break;
        }
        if (!step_result) {
          throw new ProxmoxExpectStepFailedError({
            code: "proxmox.expect.step_failed",
            message: "Expect step did not produce a result.",
            details: {
              field: "step.step_id",
              value: step.step_id,
            },
          });
        }
        step_results.push(step_result);
        executed_steps += 1;

        const next_step = ResolveNextStepId({
          script_steps: normalized_script.steps,
          step_order,
          step,
          step_result,
        });
        if (step_result.status === "failed" || next_step.should_fail_script) {
          succeeded = false;
          failed_step_id = step.step_id;
          break;
        }

        if (step.inter_step_delay_ms !== undefined && step.inter_step_delay_ms > 0) {
          await SleepMs(step.inter_step_delay_ms);
        }
        current_step_id = next_step.next_step_id;
      }
    } finally {
      const close_on_finish = params.target.close_on_finish !== false;
      if (opened_session && close_on_finish && session_id) {
        try {
          await this.lxc_service.closeTerminalSession({
            session_id,
            reason: "expect_script_complete",
            code: 1000,
          });
        } catch (error) {
          if (!(error instanceof ProxmoxTerminalSessionError)) {
            throw error;
          }
        } finally {
          closed_session = true;
        }
      }
    }

    const finished_epoch_ms = Date.now();
    return {
      session_id: session_id!,
      opened_session,
      closed_session,
      succeeded,
      failed_step_id,
      started_at,
      finished_at: new Date(finished_epoch_ms).toISOString(),
      elapsed_ms: finished_epoch_ms - started_epoch_ms,
      step_results,
      transcript: {
        entries: transcript.entries,
        total_input_bytes: transcript.total_input_bytes,
        total_output_bytes: transcript.total_output_bytes,
        max_buffer_bytes: transcript.max_buffer_bytes,
        truncated: transcript.truncated,
      },
    };
  }

  private async executeStep(params: {
    session_id: string;
    step: proxmox_expect_step_t;
    default_timeout_ms?: number;
    default_poll_interval_ms?: number;
    default_callback_timeout_ms?: number;
    max_buffer_bytes?: number;
    stream_target?: proxmox_expect_stream_target_t;
    abort_signal?: AbortSignal;
    transcript?: proxmox_expect_transcript_runtime_i;
    override_attempt_count?: number;
  }): Promise<proxmox_expect_step_result_t> {
    const started_epoch_ms = Date.now();
    const step_id = ValidateStepId(params.step.step_id, "step.step_id");
    const timeout_ms = params.step.timeout_ms ?? params.default_timeout_ms ?? DEFAULT_EXPECT_TIMEOUT_MS;
    const poll_interval_ms = params.step.poll_interval_ms ?? params.default_poll_interval_ms ?? DEFAULT_EXPECT_POLL_INTERVAL_MS;
    const callback_timeout_ms = ResolveCallbackTimeoutMs({
      raw_timeout_ms: params.step.callback_timeout_ms ?? params.default_callback_timeout_ms,
      field_name: `${step_id}.callback_timeout_ms`,
      fallback_timeout_ms: DEFAULT_EXPECT_CALLBACK_TIMEOUT_MS,
    });
    const max_buffer_bytes = params.max_buffer_bytes ?? DEFAULT_EXPECT_BUFFER_BYTES;
    const stream_target = ValidateStreamTarget(params.stream_target ?? "combined");
    const sensitive_input = params.step.sensitive_input === true;
    const fail_on_timeout = params.step.fail_on_timeout !== false;
    const fail_on_unexpected_output = params.step.fail_on_unexpected_output === true;
    let sent_input = false;

    this.ensureSessionOpen(params.session_id);
    ThrowIfAborted(params.abort_signal);

    if (params.step.send_input !== undefined) {
      const send_input = ValidateSendInput(params.step.send_input, `${step_id}.send_input`);
      await this.lxc_service.sendTerminalInput({
        session_id: params.session_id,
        input_text: send_input,
      });
      sent_input = true;
      if (params.transcript) {
        AppendTranscriptEntry({
          transcript: params.transcript,
          entry_type: "input",
          step_id,
          text: sensitive_input ? "[redacted]" : send_input,
          redacted: sensitive_input,
          input_byte_count: send_input.length,
        });
      }
    }

    if (params.step.expect === undefined) {
      const finished_epoch_ms = Date.now();
      return {
        step_id,
        status: "completed_without_expect",
        attempt_count: params.override_attempt_count ?? 1,
        started_at: new Date(started_epoch_ms).toISOString(),
        finished_at: new Date(finished_epoch_ms).toISOString(),
        elapsed_ms: finished_epoch_ms - started_epoch_ms,
        sent_input,
        sensitive_input,
        expect_defined: false,
        timeout: false,
        unexpected_output: false,
        output_excerpt: "",
      };
    }

    const wait_result = await this.waitForInternal({
      session_id: params.session_id,
      expect_matchers: params.step.expect,
      timeout_ms,
      poll_interval_ms,
      max_buffer_bytes,
      capture_groups: params.step.capture_groups === true,
      callback_timeout_ms,
      fail_on_unexpected_output,
      unexpected_matchers: params.step.unexpected_matchers,
      stream_target,
      step_id,
      abort_signal: params.abort_signal,
      on_output_chunk: params.transcript
        ? (output_chunk: string): void => {
          AppendTranscriptEntry({
            transcript: params.transcript!,
            entry_type: "output",
            step_id,
            text: output_chunk,
            redacted: false,
            output_byte_count: output_chunk.length,
          });
        }
        : undefined,
    });

    const finished_epoch_ms = Date.now();
    const step_result: proxmox_expect_step_result_t = {
      step_id,
      status: wait_result.status === "matched"
        ? "matched"
        : wait_result.status === "timeout"
          ? "timeout"
          : "unexpected_output",
      attempt_count: params.override_attempt_count ?? 1,
      started_at: new Date(started_epoch_ms).toISOString(),
      finished_at: new Date(finished_epoch_ms).toISOString(),
      elapsed_ms: finished_epoch_ms - started_epoch_ms,
      sent_input,
      sensitive_input,
      expect_defined: true,
      match: wait_result.match,
      timeout: wait_result.status === "timeout",
      unexpected_output: wait_result.status === "unexpected_output",
      output_excerpt: wait_result.output_excerpt,
    };

    if (wait_result.status === "timeout" && fail_on_timeout) {
      step_result.status = "failed";
    }
    if (wait_result.status === "unexpected_output" && fail_on_unexpected_output) {
      step_result.status = "failed";
    }

    return step_result;
  }

  private async waitForInternal(params: {
    session_id: string;
    expect_matchers: proxmox_expect_matcher_t | proxmox_expect_matcher_t[];
    timeout_ms: number;
    poll_interval_ms: number;
    max_buffer_bytes: number;
    stream_target: proxmox_expect_stream_target_t;
    capture_groups: boolean;
    callback_timeout_ms?: number;
    fail_on_unexpected_output: boolean;
    unexpected_matchers?: proxmox_expect_matcher_t[];
    step_id?: string;
    abort_signal?: AbortSignal;
    on_output_chunk?: (output_chunk: string) => void;
  }): Promise<proxmox_expect_wait_for_result_t> {
    const normalized_expect_matchers = NormalizeMatcherList(params.expect_matchers, "expect");
    const compiled_expect_matchers = CompileMatchers(normalized_expect_matchers);
    const compiled_unexpected_matchers = params.unexpected_matchers
      ? CompileMatchers(NormalizeMatcherList(params.unexpected_matchers, "unexpected_matchers"))
      : [];
    const wait_runtime: proxmox_expect_wait_runtime_i = {
      output_buffer: "",
      latest_output_chunk: "",
      output_truncated: false,
      consumed_event_count: 0,
    };
    const started_epoch_ms = Date.now();

    while (true) {
      ThrowIfAborted(params.abort_signal);
      let event_batch: proxmox_lxc_terminal_event_t[] = [];
      try {
        event_batch = await this.lxc_service.readTerminalEvents({
          session_id: params.session_id,
          max_events: DEFAULT_EXPECT_MAX_EVENTS_PER_POLL,
        });
      } catch (error) {
        if (error instanceof ProxmoxTerminalSessionError) {
          throw new ProxmoxExpectSessionClosedError({
            code: "proxmox.expect.session_closed",
            message: "Terminal session was not found or has already closed.",
            details: {
              field: "session_id",
              value: params.session_id,
            },
            cause: error,
          });
        }
        throw error;
      }
      for (const terminal_event of event_batch) {
        wait_runtime.consumed_event_count += 1;
        if (terminal_event.event_type === "close") {
          throw new ProxmoxExpectSessionClosedError({
            code: "proxmox.expect.session_closed",
            message: "Terminal session closed while waiting for expect match.",
            details: {
              field: "session_id",
              value: params.session_id,
            },
          });
        }
        if (terminal_event.event_type !== "output") {
          continue;
        }
        const output_chunk = terminal_event.output_chunk ?? "";
        if (output_chunk.length === 0) {
          continue;
        }
        wait_runtime.latest_output_chunk = output_chunk;
        params.on_output_chunk?.(output_chunk);
        const appended = AppendOutputBuffer({
          existing_output_buffer: wait_runtime.output_buffer,
          output_chunk,
          max_buffer_bytes: params.max_buffer_bytes,
        });
        wait_runtime.output_buffer = appended.output_buffer;
        wait_runtime.output_truncated = wait_runtime.output_truncated || appended.truncated;

        if (params.fail_on_unexpected_output && compiled_unexpected_matchers.length > 0) {
          const unexpected_match = await FindFirstMatch({
            compiled_matchers: compiled_unexpected_matchers,
            output_buffer: wait_runtime.output_buffer,
            latest_output_chunk: wait_runtime.latest_output_chunk,
            capture_groups: params.capture_groups,
            elapsed_ms: Date.now() - started_epoch_ms,
            callback_timeout_ms: params.callback_timeout_ms,
            step_id: params.step_id,
            abort_signal: params.abort_signal,
          });
          if (unexpected_match !== undefined) {
            return {
              session_id: params.session_id,
              status: "unexpected_output",
              timed_out: false,
              unexpected_output_detected: true,
              matched: false,
              elapsed_ms: Date.now() - started_epoch_ms,
              consumed_event_count: wait_runtime.consumed_event_count,
              output_excerpt: BuildExcerpt(wait_runtime.output_buffer),
              output_truncated: wait_runtime.output_truncated,
            };
          }
        }

        const expected_match = await FindFirstMatch({
          compiled_matchers: compiled_expect_matchers,
          output_buffer: wait_runtime.output_buffer,
          latest_output_chunk: wait_runtime.latest_output_chunk,
          capture_groups: params.capture_groups,
          elapsed_ms: Date.now() - started_epoch_ms,
          callback_timeout_ms: params.callback_timeout_ms,
          step_id: params.step_id,
          abort_signal: params.abort_signal,
        });
        if (expected_match !== undefined) {
          return {
            session_id: params.session_id,
            status: "matched",
            timed_out: false,
            unexpected_output_detected: false,
            matched: true,
            match: expected_match,
            elapsed_ms: Date.now() - started_epoch_ms,
            consumed_event_count: wait_runtime.consumed_event_count,
            output_excerpt: BuildExcerpt(wait_runtime.output_buffer),
            output_truncated: wait_runtime.output_truncated,
          };
        }
      }

      const elapsed_ms = Date.now() - started_epoch_ms;
      if (elapsed_ms >= params.timeout_ms) {
        return {
          session_id: params.session_id,
          status: "timeout",
          timed_out: true,
          unexpected_output_detected: false,
          matched: false,
          elapsed_ms,
          consumed_event_count: wait_runtime.consumed_event_count,
          output_excerpt: BuildExcerpt(wait_runtime.output_buffer),
          output_truncated: wait_runtime.output_truncated,
        };
      }

      await SleepMs(Math.min(params.poll_interval_ms, Math.max(25, params.timeout_ms - elapsed_ms)));
    }
  }

  private ensureSessionOpen(session_id: string): void {
    try {
      this.lxc_service.getTerminalSession({
        session_id,
      });
    } catch (error) {
      if (error instanceof ProxmoxTerminalSessionError) {
        throw new ProxmoxExpectSessionClosedError({
          code: "proxmox.expect.session_closed",
          message: "Terminal session was not found or has already closed.",
          details: {
            field: "session_id",
            value: session_id,
          },
          cause: error,
        });
      }
      throw error;
    }
  }
}

function NormalizeWaitForInput(params: proxmox_expect_wait_for_input_t): {
  session_id: string;
  expect_matchers: proxmox_expect_matcher_t | proxmox_expect_matcher_t[];
  timeout_ms: number;
  poll_interval_ms: number;
  callback_timeout_ms?: number;
  max_buffer_bytes: number;
  stream_target: proxmox_expect_stream_target_t;
  capture_groups: boolean;
  fail_on_unexpected_output: boolean;
  unexpected_matchers?: proxmox_expect_matcher_t[];
  abort_signal?: AbortSignal;
} {
  const session_id = ValidateSessionId(params.session_id);
  const timeout_ms = ValidatePositiveNumber(params.timeout_ms ?? DEFAULT_EXPECT_TIMEOUT_MS, "timeout_ms", 1);
  const poll_interval_ms = ValidatePositiveNumber(
    params.poll_interval_ms ?? DEFAULT_EXPECT_POLL_INTERVAL_MS,
    "poll_interval_ms",
    10,
  );
  const max_buffer_bytes = ValidatePositiveNumber(
    params.max_buffer_bytes ?? DEFAULT_EXPECT_BUFFER_BYTES,
    "max_buffer_bytes",
    128,
  );
  const callback_timeout_ms = params.callback_timeout_ms === undefined
    ? undefined
    : ResolveCallbackTimeoutMs({
      raw_timeout_ms: params.callback_timeout_ms,
      field_name: "callback_timeout_ms",
      fallback_timeout_ms: DEFAULT_EXPECT_CALLBACK_TIMEOUT_MS,
    });
  const stream_target = ValidateStreamTarget(params.stream_target ?? "combined");
  return {
    session_id,
    expect_matchers: params.expect,
    timeout_ms,
    poll_interval_ms,
    callback_timeout_ms,
    max_buffer_bytes,
    stream_target,
    capture_groups: params.capture_groups === true,
    fail_on_unexpected_output: params.fail_on_unexpected_output === true,
    unexpected_matchers: params.unexpected_matchers,
    abort_signal: params.abort_signal,
  };
}

function NormalizeScript(script: {
  steps: proxmox_expect_step_t[];
  start_step_id?: string;
  default_timeout_ms?: number;
  default_poll_interval_ms?: number;
  default_callback_timeout_ms?: number;
  max_buffer_bytes?: number;
  max_step_retries?: number;
}): {
  steps: proxmox_expect_step_t[];
  start_step_id?: string;
  default_timeout_ms: number;
  default_poll_interval_ms: number;
  default_callback_timeout_ms: number;
  max_buffer_bytes: number;
  max_step_retries: number;
} {
  if (!Array.isArray(script.steps) || script.steps.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Expect script requires at least one step.",
      details: {
        field: "script.steps",
      },
    });
  }
  const default_timeout_ms = ValidatePositiveNumber(
    script.default_timeout_ms ?? DEFAULT_EXPECT_TIMEOUT_MS,
    "script.default_timeout_ms",
    1,
  );
  const default_poll_interval_ms = ValidatePositiveNumber(
    script.default_poll_interval_ms ?? DEFAULT_EXPECT_POLL_INTERVAL_MS,
    "script.default_poll_interval_ms",
    10,
  );
  const default_callback_timeout_ms = ResolveCallbackTimeoutMs({
    raw_timeout_ms: script.default_callback_timeout_ms,
    field_name: "script.default_callback_timeout_ms",
    fallback_timeout_ms: DEFAULT_EXPECT_CALLBACK_TIMEOUT_MS,
  });
  const max_buffer_bytes = ValidatePositiveNumber(
    script.max_buffer_bytes ?? DEFAULT_EXPECT_BUFFER_BYTES,
    "script.max_buffer_bytes",
    128,
  );
  const max_step_retries = ValidateNonNegativeInteger(
    script.max_step_retries ?? DEFAULT_EXPECT_MAX_SCRIPT_STEP_RETRIES,
    "script.max_step_retries",
  );
  const start_step_id = script.start_step_id?.trim();
  if (start_step_id !== undefined && start_step_id.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "script.start_step_id cannot be empty.",
      details: {
        field: "script.start_step_id",
      },
    });
  }
  return {
    steps: script.steps,
    start_step_id: start_step_id?.length ? start_step_id : undefined,
    default_timeout_ms,
    default_poll_interval_ms,
    default_callback_timeout_ms,
    max_buffer_bytes,
    max_step_retries,
  };
}

function BuildStepLookup(steps: proxmox_expect_step_t[]): Map<string, proxmox_expect_step_t> {
  const step_lookup = new Map<string, proxmox_expect_step_t>();
  for (const [index, step] of steps.entries()) {
    const step_id = ValidateStepId(step.step_id, `steps[${index}].step_id`);
    if (step_lookup.has(step_id)) {
      throw new ProxmoxValidationError({
        code: "proxmox.validation.invalid_input",
        message: "Expect script step_id values must be unique.",
        details: {
          field: "steps.step_id",
          value: step_id,
        },
      });
    }
    step_lookup.set(step_id, step);
  }
  return step_lookup;
}

function ResolveNextStepId(params: {
  script_steps: proxmox_expect_step_t[];
  step_order: string[];
  step: proxmox_expect_step_t;
  step_result: proxmox_expect_step_result_t;
}): {
  next_step_id?: string;
  should_fail_script: boolean;
} {
  const current_index = params.step_order.findIndex((step_id) => step_id === params.step.step_id);
  const default_next = current_index >= 0 && current_index + 1 < params.step_order.length
    ? params.step_order[current_index + 1]
    : undefined;

  if (params.step_result.status === "matched") {
    if (params.step_result.match?.matcher_id && params.step.next_step_by_matcher_id) {
      const branch_target = params.step.next_step_by_matcher_id[params.step_result.match.matcher_id];
      if (branch_target && branch_target.trim().length > 0) {
        return {
          next_step_id: branch_target.trim(),
          should_fail_script: false,
        };
      }
    }
    return {
      next_step_id: params.step.next_step_id?.trim() || default_next,
      should_fail_script: false,
    };
  }

  if (params.step_result.status === "timeout") {
    if (params.step.on_timeout_step_id && params.step.on_timeout_step_id.trim().length > 0) {
      return {
        next_step_id: params.step.on_timeout_step_id.trim(),
        should_fail_script: false,
      };
    }
    return {
      next_step_id: default_next,
      should_fail_script: params.step.fail_on_timeout !== false,
    };
  }

  if (params.step_result.status === "unexpected_output") {
    if (params.step.on_unexpected_step_id && params.step.on_unexpected_step_id.trim().length > 0) {
      return {
        next_step_id: params.step.on_unexpected_step_id.trim(),
        should_fail_script: false,
      };
    }
    return {
      next_step_id: default_next,
      should_fail_script: params.step.fail_on_unexpected_output === true,
    };
  }

  if (params.step_result.status === "failed") {
    return {
      next_step_id: undefined,
      should_fail_script: true,
    };
  }

  return {
    next_step_id: params.step.next_step_id?.trim() || default_next,
    should_fail_script: false,
  };
}

function ValidateStepId(step_id: string, field_name: string): string {
  const normalized = step_id.trim();
  if (!normalized) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Expect step id is required and cannot be empty.",
      details: {
        field: field_name,
      },
    });
  }
  return normalized;
}

function ValidateSessionId(raw_session_id: string): string {
  const session_id = raw_session_id.trim();
  if (!session_id) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "session_id is required.",
      details: {
        field: "session_id",
      },
    });
  }
  return session_id;
}

function ValidateSendInput(raw_input: string, field_name: string): string {
  const normalized = String(raw_input);
  if (normalized.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "send_input cannot be empty.",
      details: {
        field: field_name,
      },
    });
  }
  return normalized;
}

function ValidatePositiveNumber(raw_number: number, field_name: string, minimum: number): number {
  if (!Number.isFinite(raw_number) || raw_number < minimum) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field_name} must be a number >= ${minimum}.`,
      details: {
        field: field_name,
        value: String(raw_number),
      },
    });
  }
  return Math.floor(raw_number);
}

function ValidateNonNegativeInteger(raw_number: number, field_name: string): number {
  if (!Number.isInteger(raw_number) || raw_number < 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field_name} must be a non-negative integer.`,
      details: {
        field: field_name,
        value: String(raw_number),
      },
    });
  }
  return raw_number;
}

function ResolveCallbackTimeoutMs(params: {
  raw_timeout_ms: number | undefined;
  field_name: string;
  fallback_timeout_ms: number;
}): number {
  const selected_timeout_ms = params.raw_timeout_ms ?? params.fallback_timeout_ms;
  if (!Number.isFinite(selected_timeout_ms) || selected_timeout_ms < 25 || selected_timeout_ms > 60000) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${params.field_name} must be between 25 and 60000 milliseconds.`,
      details: {
        field: params.field_name,
        value: String(selected_timeout_ms),
      },
    });
  }
  return Math.floor(selected_timeout_ms);
}

function ValidateStreamTarget(stream_target: proxmox_expect_stream_target_t): proxmox_expect_stream_target_t {
  if (stream_target !== "combined") {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: "Only stream_target=combined is currently supported for LXC terminal expect.",
      details: {
        field: "stream_target",
        value: stream_target,
      },
    });
  }
  return stream_target;
}

function NormalizeMatcherList(
  matchers: proxmox_expect_matcher_t | proxmox_expect_matcher_t[],
  field_name: string,
): proxmox_expect_matcher_t[] {
  const normalized = Array.isArray(matchers) ? matchers : [matchers];
  if (normalized.length === 0) {
    throw new ProxmoxValidationError({
      code: "proxmox.validation.invalid_input",
      message: `${field_name} requires at least one matcher.`,
      details: {
        field: field_name,
      },
    });
  }
  return normalized;
}

function BuildCallbackInvocationSignature(params: {
  buffer_text: string;
  latest_chunk: string;
}): string {
  const buffer_suffix = params.buffer_text.slice(Math.max(0, params.buffer_text.length - 128));
  const chunk_suffix = params.latest_chunk.slice(Math.max(0, params.latest_chunk.length - 64));
  return `${params.buffer_text.length}:${buffer_suffix}|${params.latest_chunk.length}:${chunk_suffix}`;
}

async function RunCallbackMatcherWithTimeout(params: {
  callback_matcher: (params: {
    buffer_text: string;
    latest_chunk: string;
    elapsed_ms: number;
    step_id?: string;
    abort_signal?: AbortSignal;
  }) => Promise<boolean | proxmox_expect_callback_matcher_result_t> | boolean | proxmox_expect_callback_matcher_result_t;
  timeout_ms: number;
  callback_input: {
    buffer_text: string;
    latest_chunk: string;
    elapsed_ms: number;
    step_id?: string;
    abort_signal?: AbortSignal;
  };
  matcher_index: number;
  matcher_id?: string;
  step_id?: string;
}): Promise<boolean | proxmox_expect_callback_matcher_result_t> {
  return new Promise<boolean | proxmox_expect_callback_matcher_result_t>((resolve, reject) => {
    const timeout_handle = setTimeout(() => {
      reject(new ProxmoxExpectCallbackTimeoutError({
        code: "proxmox.expect.callback_timeout",
        message: "Callback matcher timed out.",
        details: {
          field: params.step_id
            ? `${params.step_id}.expect[${params.matcher_index}]`
            : `expect[${params.matcher_index}]`,
          value: params.matcher_id,
        },
      }));
    }, params.timeout_ms);

    Promise.resolve(params.callback_matcher({
      buffer_text: params.callback_input.buffer_text,
      latest_chunk: params.callback_input.latest_chunk,
      elapsed_ms: params.callback_input.elapsed_ms,
      step_id: params.callback_input.step_id,
      abort_signal: params.callback_input.abort_signal,
    }))
      .then((result) => {
        clearTimeout(timeout_handle);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout_handle);
        reject(error);
      });
  });
}

function NormalizeCallbackMatcherResult(params: {
  raw_result: unknown;
  matcher_index: number;
  matcher_id?: string;
  step_id?: string;
  buffer_text: string;
}): {
  matched: boolean;
  matched_text: string;
  capture_groups?: string[];
  metadata?: proxmox_expect_callback_metadata_t;
} {
  if (typeof params.raw_result === "boolean") {
    return {
      matched: params.raw_result,
      matched_text: params.raw_result ? BuildExcerpt(params.buffer_text) : "",
    };
  }

  if (!IsRecord(params.raw_result)) {
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher returned an invalid result type.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}]`
          : `expect[${params.matcher_index}]`,
        value: params.matcher_id,
      },
    });
  }

  const matched = params.raw_result.matched;
  if (typeof matched !== "boolean") {
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher result must include boolean matched field.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}].matched`
          : `expect[${params.matcher_index}].matched`,
      },
    });
  }

  const matched_text_raw = params.raw_result.matched_text;
  if (matched_text_raw !== undefined && typeof matched_text_raw !== "string") {
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher result matched_text must be a string when provided.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}].matched_text`
          : `expect[${params.matcher_index}].matched_text`,
      },
    });
  }

  const capture_groups_raw = params.raw_result.capture_groups;
  if (
    capture_groups_raw !== undefined
    && (!Array.isArray(capture_groups_raw) || capture_groups_raw.some((entry) => typeof entry !== "string"))
  ) {
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher result capture_groups must be an array of strings.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}].capture_groups`
          : `expect[${params.matcher_index}].capture_groups`,
      },
    });
  }

  const metadata_raw = params.raw_result.metadata;
  const metadata = ValidateCallbackMetadata({
    metadata_raw,
    matcher_index: params.matcher_index,
    matcher_id: params.matcher_id,
    step_id: params.step_id,
  });
  const capture_groups = capture_groups_raw === undefined
    ? undefined
    : capture_groups_raw as string[];

  return {
    matched,
    matched_text: matched
      ? matched_text_raw ?? BuildExcerpt(params.buffer_text)
      : matched_text_raw ?? "",
    capture_groups,
    metadata,
  };
}

function ValidateCallbackMetadata(params: {
  metadata_raw: unknown;
  matcher_index: number;
  matcher_id?: string;
  step_id?: string;
}): proxmox_expect_callback_metadata_t | undefined {
  if (params.metadata_raw === undefined) {
    return undefined;
  }
  if (!IsRecord(params.metadata_raw)) {
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher metadata must be a record object.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}].metadata`
          : `expect[${params.matcher_index}].metadata`,
        value: params.matcher_id,
      },
    });
  }

  const normalized_metadata: proxmox_expect_callback_metadata_t = {};
  for (const key_name of Object.keys(params.metadata_raw)) {
    const value = params.metadata_raw[key_name];
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      normalized_metadata[key_name] = value;
      continue;
    }
    throw new ProxmoxExpectCallbackResultError({
      code: "proxmox.expect.callback_invalid_result",
      message: "Callback matcher metadata values must be string/number/boolean/null.",
      details: {
        field: params.step_id
          ? `${params.step_id}.expect[${params.matcher_index}].metadata.${key_name}`
          : `expect[${params.matcher_index}].metadata.${key_name}`,
        value: params.matcher_id,
      },
    });
  }

  return normalized_metadata;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function CompileMatchers(matchers: proxmox_expect_matcher_t[]): proxmox_compiled_expect_matcher_i[] {
  return matchers.map((matcher, matcher_index) => CompileMatcher({
    matcher,
    matcher_index,
  }));
}

function CompileMatcher(params: {
  matcher: proxmox_expect_matcher_t;
  matcher_index: number;
}): proxmox_compiled_expect_matcher_i {
  const matcher_id = params.matcher.matcher_id?.trim();
  if (params.matcher.kind === "string") {
    const value = params.matcher.value;
    if (!value || value.length === 0) {
      throw new ProxmoxExpectPatternError({
        code: "proxmox.expect.pattern_invalid",
        message: "String matcher value cannot be empty.",
        details: {
          field: `matcher[${params.matcher_index}].value`,
        },
      });
    }
    const case_sensitive = params.matcher.case_sensitive !== false;
    return {
      matcher_id: matcher_id?.length ? matcher_id : undefined,
      matcher_index: params.matcher_index,
      matcher_kind: "string",
      match: async ({ buffer_text }): Promise<{
        matched: boolean;
        matched_text: string;
      }> => {
        const haystack = case_sensitive ? buffer_text : buffer_text.toLowerCase();
        const needle = case_sensitive ? value : value.toLowerCase();
        const match_index = haystack.indexOf(needle);
        if (match_index < 0) {
          return {
            matched: false,
            matched_text: "",
          };
        }
        return {
          matched: true,
          matched_text: buffer_text.slice(match_index, match_index + value.length),
        };
      },
    };
  }

  if (params.matcher.kind === "callback") {
    if (typeof params.matcher.callback_matcher !== "function") {
      throw new ProxmoxExpectPatternError({
        code: "proxmox.expect.pattern_invalid",
        message: "Callback matcher requires callback_matcher function.",
        details: {
          field: `matcher[${params.matcher_index}].callback_matcher`,
        },
      });
    }
    const callback_matcher = params.matcher.callback_matcher;
    const matcher_timeout_ms = params.matcher.timeout_ms;
    let previous_invocation_signature: string | undefined;
    let previous_result: {
      matched: boolean;
      matched_text: string;
      capture_groups?: string[];
      metadata?: proxmox_expect_callback_metadata_t;
    } | undefined;

    return {
      matcher_id: matcher_id?.length ? matcher_id : undefined,
      matcher_index: params.matcher_index,
      matcher_kind: "callback",
      match: async (match_params): Promise<{
        matched: boolean;
        matched_text: string;
        capture_groups?: string[];
        metadata?: proxmox_expect_callback_metadata_t;
      }> => {
        const invocation_signature = BuildCallbackInvocationSignature({
          buffer_text: match_params.buffer_text,
          latest_chunk: match_params.latest_chunk,
        });
        if (invocation_signature === previous_invocation_signature && previous_result !== undefined) {
          return previous_result;
        }
        ThrowIfAborted(match_params.abort_signal);
        const callback_timeout_ms = ResolveCallbackTimeoutMs({
          raw_timeout_ms: matcher_timeout_ms ?? match_params.callback_timeout_ms,
          field_name: `matcher[${params.matcher_index}].timeout_ms`,
          fallback_timeout_ms: DEFAULT_EXPECT_CALLBACK_TIMEOUT_MS,
        });
        let callback_result: boolean | proxmox_expect_callback_matcher_result_t;
        try {
          callback_result = await RunCallbackMatcherWithTimeout({
            callback_matcher,
            timeout_ms: callback_timeout_ms,
            callback_input: {
              buffer_text: match_params.buffer_text,
              latest_chunk: match_params.latest_chunk,
              elapsed_ms: match_params.elapsed_ms,
              step_id: match_params.step_id,
              abort_signal: match_params.abort_signal,
            },
            matcher_index: params.matcher_index,
            matcher_id: matcher_id?.length ? matcher_id : undefined,
            step_id: match_params.step_id,
          });
        } catch (error) {
          if (error instanceof ProxmoxExpectCallbackTimeoutError || error instanceof ProxmoxExpectCallbackResultError) {
            throw error;
          }
          throw new ProxmoxExpectCallbackError({
            code: "proxmox.expect.callback_failed",
            message: "Callback matcher execution failed.",
            details: {
              field: match_params.step_id
                ? `${match_params.step_id}.expect[${params.matcher_index}]`
                : `expect[${params.matcher_index}]`,
              value: matcher_id?.length ? matcher_id : undefined,
            },
            cause: error,
          });
        }
        const normalized_result = NormalizeCallbackMatcherResult({
          raw_result: callback_result,
          matcher_index: params.matcher_index,
          matcher_id: matcher_id?.length ? matcher_id : undefined,
          step_id: match_params.step_id,
          buffer_text: match_params.buffer_text,
        });
        previous_invocation_signature = invocation_signature;
        previous_result = normalized_result;
        return normalized_result;
      },
    };
  }

  const pattern = params.matcher.pattern;
  if (!pattern || pattern.length === 0) {
    throw new ProxmoxExpectPatternError({
      code: "proxmox.expect.pattern_invalid",
      message: "Regex matcher pattern cannot be empty.",
      details: {
        field: `matcher[${params.matcher_index}].pattern`,
      },
    });
  }
  const raw_flags = params.matcher.flags ?? "";
  if (raw_flags.includes("g")) {
    throw new ProxmoxExpectPatternError({
      code: "proxmox.expect.pattern_invalid",
      message: "Regex matcher flags must not include global flag g.",
      details: {
        field: `matcher[${params.matcher_index}].flags`,
        value: raw_flags,
      },
    });
  }
  let compiled_regex: RegExp;
  try {
    compiled_regex = new RegExp(pattern, raw_flags);
  } catch (error) {
    throw new ProxmoxExpectPatternError({
      code: "proxmox.expect.pattern_invalid",
      message: "Regex matcher pattern or flags are invalid.",
      details: {
        field: `matcher[${params.matcher_index}]`,
      },
      cause: error,
    });
  }
  return {
    matcher_id: matcher_id?.length ? matcher_id : undefined,
    matcher_index: params.matcher_index,
    matcher_kind: "regex",
    match: async ({ buffer_text, capture_groups }): Promise<{
      matched: boolean;
      matched_text: string;
      capture_groups?: string[];
    }> => {
      const match_result = compiled_regex.exec(buffer_text);
      if (!match_result) {
        return {
          matched: false,
          matched_text: "",
        };
      }
      return {
        matched: true,
        matched_text: match_result[0] ?? "",
        capture_groups: capture_groups
          ? match_result.slice(1).map((entry) => entry ?? "")
          : undefined,
      };
    },
  };
}

async function FindFirstMatch(params: {
  compiled_matchers: proxmox_compiled_expect_matcher_i[];
  output_buffer: string;
  latest_output_chunk: string;
  capture_groups: boolean;
  elapsed_ms: number;
  callback_timeout_ms?: number;
  step_id?: string;
  abort_signal?: AbortSignal;
}): Promise<proxmox_expect_match_result_t | undefined> {
  for (const matcher of params.compiled_matchers) {
    const test_result = await matcher.match({
      buffer_text: params.output_buffer,
      latest_chunk: params.latest_output_chunk,
      capture_groups: params.capture_groups,
      elapsed_ms: params.elapsed_ms,
      step_id: params.step_id,
      abort_signal: params.abort_signal,
      callback_timeout_ms: params.callback_timeout_ms,
    });
    if (!test_result.matched) {
      continue;
    }
    return {
      matched: true,
      matcher_index: matcher.matcher_index,
      matcher_id: matcher.matcher_id,
      matcher_kind: matcher.matcher_kind,
      matched_text: test_result.matched_text,
      capture_groups: test_result.capture_groups,
      metadata: test_result.metadata,
      elapsed_ms: params.elapsed_ms,
      buffer_excerpt: BuildExcerpt(params.output_buffer),
    };
  }
  return undefined;
}

function AppendOutputBuffer(params: {
  existing_output_buffer: string;
  output_chunk: string;
  max_buffer_bytes: number;
}): {
  output_buffer: string;
  truncated: boolean;
} {
  let output_buffer = params.existing_output_buffer + params.output_chunk;
  if (output_buffer.length <= params.max_buffer_bytes) {
    return {
      output_buffer,
      truncated: false,
    };
  }
  output_buffer = output_buffer.slice(output_buffer.length - params.max_buffer_bytes);
  return {
    output_buffer,
    truncated: true,
  };
}

function BuildExcerpt(output_buffer: string): string {
  const normalized = output_buffer.replace(/\s+/g, " ").trim();
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237)}...`;
}

function BuildTranscriptRuntime(params: {
  max_buffer_bytes: number;
}): proxmox_expect_transcript_runtime_i {
  return {
    entries: [],
    text_bytes: 0,
    max_buffer_bytes: params.max_buffer_bytes,
    truncated: false,
    total_input_bytes: 0,
    total_output_bytes: 0,
  };
}

function AppendTranscriptEntry(params: {
  transcript: proxmox_expect_transcript_runtime_i;
  entry_type: "input" | "output" | "event";
  step_id?: string;
  text: string;
  redacted: boolean;
  input_byte_count?: number;
  output_byte_count?: number;
}): void {
  const entry_text = params.text;
  const entry: proxmox_expect_transcript_entry_t = {
    timestamp_iso: new Date().toISOString(),
    entry_type: params.entry_type,
    step_id: params.step_id,
    text: entry_text,
    redacted: params.redacted,
  };
  params.transcript.entries.push(entry);
  params.transcript.text_bytes += entry_text.length;
  if (params.input_byte_count !== undefined) {
    params.transcript.total_input_bytes += params.input_byte_count;
  }
  if (params.output_byte_count !== undefined) {
    params.transcript.total_output_bytes += params.output_byte_count;
  }
  while (params.transcript.text_bytes > params.transcript.max_buffer_bytes && params.transcript.entries.length > 0) {
    const removed = params.transcript.entries.shift();
    if (!removed) {
      break;
    }
    params.transcript.text_bytes -= removed.text.length;
    params.transcript.truncated = true;
  }
}

function ThrowIfAborted(abort_signal: AbortSignal | undefined): void {
  if (abort_signal?.aborted) {
    throw new ProxmoxExpectAbortedError({
      code: "proxmox.expect.aborted",
      message: "Expect operation was aborted.",
      details: {
        field: "abort_signal",
      },
    });
  }
}

function SleepMs(delay_ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay_ms);
  });
}

export function ThrowIfExpectWaitFailed(params: {
  wait_result: proxmox_expect_wait_for_result_t;
  step_id?: string;
}): void {
  if (params.wait_result.status === "matched") {
    return;
  }
  if (params.wait_result.status === "timeout") {
    throw new ProxmoxExpectTimeoutError({
      code: "proxmox.expect.timeout",
      message: "Expect wait timed out before a matching pattern was found.",
      details: {
        field: params.step_id ? `${params.step_id}.timeout` : "expect.timeout",
        value: String(params.wait_result.elapsed_ms),
      },
    });
  }
  throw new ProxmoxExpectStepFailedError({
    code: "proxmox.expect.step_failed",
    message: "Expect wait failed because unexpected output was detected.",
    details: {
      field: params.step_id ? `${params.step_id}.unexpected_output` : "expect.unexpected_output",
    },
  });
}
