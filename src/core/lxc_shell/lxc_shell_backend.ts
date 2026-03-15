import { proxmox_node_connection_i } from "../request/proxmox_request_client";
import {
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_session_t,
} from "../../types/proxmox_service_types";

export interface proxmox_lxc_shell_backend_command_input_i {
  node_id: string;
  container_id: string;
  command_argv: string[];
  shell_mode: boolean;
  shell_command?: string;
  env?: Record<string, string>;
  cwd?: string;
  user?: string;
  stdin_text?: string;
  timeout_ms?: number;
  max_output_bytes?: number;
  fail_on_non_zero_exit?: boolean;
}

export interface proxmox_lxc_shell_backend_open_input_i {
  node_id: string;
  container_id: string;
  command: string;
  columns: number;
  rows: number;
  timeout_ms?: number;
}

export interface proxmox_lxc_shell_backend_i {
  runCommand(params: {
    node_connection: proxmox_node_connection_i;
    command_input: proxmox_lxc_shell_backend_command_input_i;
  }): Promise<proxmox_lxc_run_command_result_t>;
  openInteractiveSession(params: {
    node_connection: proxmox_node_connection_i;
    session_input: proxmox_lxc_shell_backend_open_input_i;
  }): Promise<proxmox_lxc_terminal_session_t>;
  sendInput(params: {
    session_id: string;
    input_text: string;
  }): Promise<void>;
  resize(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<void>;
  readEvents(params: {
    session_id: string;
    max_events?: number;
  }): Promise<proxmox_lxc_terminal_event_t[]>;
  close(params: {
    session_id: string;
    reason?: string;
    code?: number;
  }): Promise<void>;
  getSession(params: { session_id: string }): proxmox_lxc_terminal_session_t | undefined;
  ownsSession(session_id: string): boolean;
}
