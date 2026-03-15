import { proxmox_lxc_terminal_open_input_i } from "./proxmox_service_types";

export type proxmox_expect_stream_target_t = "stdout" | "stderr" | "combined";
export type proxmox_expect_matcher_kind_t = "string" | "regex" | "callback";
export type proxmox_expect_wait_status_t = "matched" | "timeout" | "unexpected_output";
export type proxmox_expect_step_status_t =
  "matched" | "timeout" | "unexpected_output" | "completed_without_expect" | "failed";
export type proxmox_expect_callback_metadata_value_t = string | number | boolean | null;
export type proxmox_expect_callback_metadata_t = Record<string, proxmox_expect_callback_metadata_value_t>;

export interface proxmox_expect_string_matcher_i {
  matcher_id?: string;
  kind: "string";
  value: string;
  case_sensitive?: boolean;
}

export interface proxmox_expect_regex_matcher_i {
  matcher_id?: string;
  kind: "regex";
  pattern: string;
  flags?: string;
}

export interface proxmox_expect_callback_matcher_input_i {
  buffer_text: string;
  latest_chunk: string;
  elapsed_ms: number;
  step_id?: string;
  abort_signal?: AbortSignal;
}

export interface proxmox_expect_callback_matcher_result_i {
  matched: boolean;
  matched_text?: string;
  capture_groups?: string[];
  metadata?: proxmox_expect_callback_metadata_t;
}

export interface proxmox_expect_callback_matcher_i {
  matcher_id?: string;
  kind: "callback";
  callback_matcher: (
    params: proxmox_expect_callback_matcher_input_t
  ) => Promise<boolean | proxmox_expect_callback_matcher_result_t> | boolean | proxmox_expect_callback_matcher_result_t;
  timeout_ms?: number;
}

export type proxmox_expect_matcher_t =
  | proxmox_expect_string_matcher_i
  | proxmox_expect_regex_matcher_i
  | proxmox_expect_callback_matcher_i;

export interface proxmox_expect_match_result_i {
  matched: boolean;
  matcher_index: number;
  matcher_id?: string;
  matcher_kind: proxmox_expect_matcher_kind_t;
  matched_text: string;
  capture_groups?: string[];
  metadata?: proxmox_expect_callback_metadata_t;
  elapsed_ms: number;
  buffer_excerpt: string;
}

export interface proxmox_expect_wait_for_input_i {
  session_id: string;
  expect: proxmox_expect_matcher_t | proxmox_expect_matcher_t[];
  timeout_ms?: number;
  poll_interval_ms?: number;
  max_buffer_bytes?: number;
  stream_target?: proxmox_expect_stream_target_t;
  capture_groups?: boolean;
  callback_timeout_ms?: number;
  fail_on_unexpected_output?: boolean;
  unexpected_matchers?: proxmox_expect_matcher_t[];
  abort_signal?: AbortSignal;
}

export interface proxmox_expect_wait_for_result_i {
  session_id: string;
  status: proxmox_expect_wait_status_t;
  timed_out: boolean;
  unexpected_output_detected: boolean;
  matched: boolean;
  match?: proxmox_expect_match_result_t;
  elapsed_ms: number;
  consumed_event_count: number;
  output_excerpt: string;
  output_truncated: boolean;
}

export interface proxmox_expect_send_and_expect_input_i extends proxmox_expect_wait_for_input_i {
  send_input: string;
  sensitive_input?: boolean;
}

export interface proxmox_expect_step_i {
  step_id: string;
  send_input?: string;
  sensitive_input?: boolean;
  expect?: proxmox_expect_matcher_t | proxmox_expect_matcher_t[];
  timeout_ms?: number;
  poll_interval_ms?: number;
  inter_step_delay_ms?: number;
  max_retries?: number;
  fail_on_timeout?: boolean;
  fail_on_unexpected_output?: boolean;
  unexpected_matchers?: proxmox_expect_matcher_t[];
  capture_groups?: boolean;
  callback_timeout_ms?: number;
  next_step_id?: string;
  on_timeout_step_id?: string;
  on_unexpected_step_id?: string;
  next_step_by_matcher_id?: Record<string, string>;
}

export interface proxmox_expect_script_i {
  steps: proxmox_expect_step_t[];
  start_step_id?: string;
  default_timeout_ms?: number;
  default_poll_interval_ms?: number;
  default_callback_timeout_ms?: number;
  max_buffer_bytes?: number;
  max_step_retries?: number;
}

export interface proxmox_expect_transcript_entry_i {
  timestamp_iso: string;
  entry_type: "input" | "output" | "event";
  step_id?: string;
  text: string;
  redacted: boolean;
}

export interface proxmox_expect_transcript_summary_i {
  entries: proxmox_expect_transcript_entry_t[];
  total_output_bytes: number;
  total_input_bytes: number;
  truncated: boolean;
  max_buffer_bytes: number;
}

export interface proxmox_expect_step_result_i {
  step_id: string;
  status: proxmox_expect_step_status_t;
  attempt_count: number;
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  sent_input: boolean;
  sensitive_input: boolean;
  expect_defined: boolean;
  match?: proxmox_expect_match_result_t;
  timeout: boolean;
  unexpected_output: boolean;
  output_excerpt: string;
}

export interface proxmox_expect_session_target_i {
  session_id?: string;
  open_terminal_input?: proxmox_lxc_terminal_open_input_i;
  close_on_finish?: boolean;
}

export interface proxmox_expect_run_script_input_i {
  target: proxmox_expect_session_target_t;
  script: proxmox_expect_script_t;
  stream_target?: proxmox_expect_stream_target_t;
  abort_signal?: AbortSignal;
}

export interface proxmox_expect_script_result_i {
  session_id: string;
  opened_session: boolean;
  closed_session: boolean;
  succeeded: boolean;
  failed_step_id?: string;
  started_at: string;
  finished_at: string;
  elapsed_ms: number;
  step_results: proxmox_expect_step_result_t[];
  transcript: proxmox_expect_transcript_summary_t;
}

export type proxmox_expect_match_result_t = proxmox_expect_match_result_i;
export type proxmox_expect_callback_matcher_input_t = proxmox_expect_callback_matcher_input_i;
export type proxmox_expect_callback_matcher_result_t = proxmox_expect_callback_matcher_result_i;
export type proxmox_expect_wait_for_result_t = proxmox_expect_wait_for_result_i;
export type proxmox_expect_step_t = proxmox_expect_step_i;
export type proxmox_expect_script_t = proxmox_expect_script_i;
export type proxmox_expect_transcript_entry_t = proxmox_expect_transcript_entry_i;
export type proxmox_expect_transcript_summary_t = proxmox_expect_transcript_summary_i;
export type proxmox_expect_step_result_t = proxmox_expect_step_result_i;
export type proxmox_expect_session_target_t = proxmox_expect_session_target_i;
export type proxmox_expect_run_script_input_t = proxmox_expect_run_script_input_i;
export type proxmox_expect_script_result_t = proxmox_expect_script_result_i;
export type proxmox_expect_wait_for_input_t = proxmox_expect_wait_for_input_i;
export type proxmox_expect_send_and_expect_input_t = proxmox_expect_send_and_expect_input_i;
