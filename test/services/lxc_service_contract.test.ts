import assert from "node:assert";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  proxmox_node_connection_i,
  proxmox_request_client_i,
  proxmox_request_i,
} from "../../src/core/request/proxmox_request_client";
import { proxmox_api_response_t } from "../../src/types/proxmox_http_types";
import { proxmox_lxc_shell_backend_i } from "../../src/core/lxc_shell/lxc_shell_backend";
import { LxcService } from "../../src/services/lxc_service";
import { ProxmoxLxcExecError, ProxmoxLxcUploadError, ProxmoxValidationError } from "../../src/errors/proxmox_error";
import {
  proxmox_lxc_get_process_list_input_i,
  proxmox_lxc_process_list_result_t,
  proxmox_lxc_run_command_result_t,
  proxmox_lxc_upload_directory_result_t,
  proxmox_lxc_upload_file_result_t,
  proxmox_lxc_terminal_event_t,
  proxmox_lxc_terminal_session_t,
} from "../../src/types/proxmox_service_types";

function LoadFirewallFixture(params: {
  file_name: string;
}): string {
  const fixture_path = path.resolve(__dirname, "..", "fixtures", "firewall", params.file_name);
  return fs.readFileSync(fixture_path, "utf8");
}

function BuildNftProbeTextFromFixture(params: {
  file_name: string;
}): string {
  const fixture_text = LoadFirewallFixture({
    file_name: params.file_name,
  });
  return fixture_text
    .split(/\r?\n/g)
    .filter((line_value) => line_value.trim().length > 0)
    .map((line_value) => `__NFT__\t${line_value}`)
    .join("\n");
}

class FakeAuthProvider {
  public async getAuthHeader(): Promise<string> {
    return "PVEAPIToken root@pam!builder=token-value";
  }

  public async getTokenFingerprint(): Promise<string> {
    return "fingerprint";
  }
}

class FakeRequestClient implements proxmox_request_client_i {
  public requests: proxmox_request_i[] = [];

  public isPrivilegedOperationEnabled(): boolean {
    return false;
  }

  public resolveNode(): proxmox_node_connection_i {
    return {
      node_id: "node-a",
      host: "pve-a.local",
      protocol: "https",
      verify_tls: true,
      auth_provider: new FakeAuthProvider(),
      shell_backend: "ssh_pct",
      ssh_shell: {
        username: "root",
        password_auth: {
          provider: "env",
          env_var: "PROXMOX_TEST_SSH_PASSWORD",
        },
      },
    };
  }

  public async request<T>(params: proxmox_request_i): Promise<proxmox_api_response_t<T>> {
    this.requests.push(params);
    if (params.path.includes("/status/current")) {
      return {
        data: {
          vmid: "105",
          status: "running",
        } as T,
        success: true,
        status_code: 200,
      };
    }
    return {
      data: "UPID:node-a:200:dcba" as T,
      success: true,
      status_code: 200,
    };
  }
}

interface fake_terminal_runtime_i {
  session: proxmox_lxc_terminal_session_t;
  events: proxmox_lxc_terminal_event_t[];
}

class FakeProcessErrorLxcService extends LxcService {
  public override async getProcessList(
    _params: proxmox_lxc_get_process_list_input_i,
  ): Promise<proxmox_lxc_process_list_result_t> {
    throw new Error("process_probe_failed");
  }
}

class FakeSshShellBackend implements proxmox_lxc_shell_backend_i {
  private readonly terminal_sessions: Map<string, fake_terminal_runtime_i>;
  public upload_should_fail_conflict: boolean;
  public upload_should_fail_checksum: boolean;
  public os_release_text: string;
  public usr_lib_os_release_text: string;
  public lsb_release_text: string;
  public kernel_release_text: string;
  public kernel_version_text: string;
  public system_cron_probe_text: string;
  public user_cron_probe_text: string;
  public process_ps_probe_text: string;
  public process_pid_fallback_text: string;
  public process_proc_details_text: string;
  public tcp_ss_probe_text: string;
  public tcp_netstat_probe_text: string;
  public tcp_proc_probe_text: string;
  public udp_ss_probe_text: string;
  public udp_netstat_probe_text: string;
  public udp_proc_probe_text: string;
  public service_systemd_probe_text: string;
  public service_openrc_probe_text: string;
  public service_sysv_probe_text: string;
  public service_static_probe_text: string;
  public hardware_probe_text: string;
  public disk_probe_text: string;
  public memory_probe_text: string;
  public cpu_probe_text: string;
  public cpu_top_snapshot_text: string;
  public identity_probe_text: string;
  public firewall_probe_text: string;
  public development_tooling_probe_text: string;
  public interface_ip_probe_text: string;
  public interface_ifconfig_probe_text: string;
  public interface_base_probe_text: string;

  constructor() {
    this.terminal_sessions = new Map<string, fake_terminal_runtime_i>();
    this.upload_should_fail_conflict = false;
    this.upload_should_fail_checksum = false;
    this.os_release_text = [
      'NAME="Ubuntu"',
      'VERSION="24.04 LTS (Noble Numbat)"',
      "ID=ubuntu",
      'VERSION_ID="24.04"',
      'PRETTY_NAME="Ubuntu 24.04 LTS"',
    ].join("\n");
    this.usr_lib_os_release_text = "";
    this.lsb_release_text = "";
    this.kernel_release_text = "6.8.0-52-generic";
    this.kernel_version_text = "#53-Ubuntu SMP PREEMPT_DYNAMIC";
    this.system_cron_probe_text = [
      "__SRC__\t/etc/crontab",
      "SHELL=/bin/sh",
      "*/5 * * * * root /usr/local/bin/health-check",
      "# 0 2 * * * root /usr/local/bin/nightly",
      "__SRC__\t/etc/cron.d/app",
      "@hourly root /opt/app/run-hourly",
      "not-a-valid-cron-line",
    ].join("\n");
    this.user_cron_probe_text = [
      "__SRC__\t/var/spool/cron/crontabs/alice",
      "# comment",
      "0 6 * * 1-5 /home/alice/bin/workday.sh",
      "@reboot /home/alice/bin/startup.sh",
    ].join("\n");
    this.process_ps_probe_text = [
      "1\t0\t1\t1\t0\t0\troot\troot\tS\t01:10\t0.1\t0.2\t1024\t4096\t?\tinit\t/sbin/init",
      "42\t1\t42\t42\t1000\t1000\talice\talice\tR\t00:05\t5.5\t1.0\t8192\t16384\tpts/0\tpython3\tpython3 /opt/app.py --token demo",
    ].join("\n");
    this.process_pid_fallback_text = "1\n42\n";
    this.process_proc_details_text = [
      "__PROC__\t1\t0\t0\t1\t25\tinit\t/sbin/init\t/sbin/init\t/\t/\tS\t1024\t4096\troot\troot\t12345",
      "__ENV__\t1\tPATH=/usr/sbin:/usr/bin__ENV_NL__LANG=C.UTF-8__ENV_NL__SECRET_TOKEN=abc123",
      "__PROC__\t42\t1000\t1000\t5\t64\tpython3\tpython3 /opt/app.py --token demo\t/usr/bin/python3\t/opt\t/\tR\t8192\t16384\talice\talice\t54321",
      "__ENV__\t42\tPATH=/usr/bin__ENV_NL__APP_MODE=prod__ENV_NL__API_KEY=secret",
    ].join("\n");
    this.tcp_ss_probe_text = [
      "LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
      "LISTEN 0 1024 127.0.0.1:5432 0.0.0.0:* users:((\"postgres\",pid=42,fd=5))",
    ].join("\n");
    this.tcp_netstat_probe_text = [
      "tcp        0      0 0.0.0.0:80            0.0.0.0:*               LISTEN      42/nginx",
    ].join("\n");
    this.tcp_proc_probe_text = [
      "__TCP__\t/proc/net/tcp\t0100007F:1F90\t0A\t9001",
      "__MAP__\t9001\t42\t19",
    ].join("\n");
    this.udp_ss_probe_text = [
      "UNCONN 0 0 0.0.0.0:53 0.0.0.0:* users:((\"systemd-resolve\",pid=53,fd=12))",
      "UNCONN 0 0 127.0.0.1:5353 0.0.0.0:* users:((\"avahi-daemon\",pid=111,fd=8))",
    ].join("\n");
    this.udp_netstat_probe_text = [
      "udp        0      0 0.0.0.0:123          0.0.0.0:*                           222/ntpd",
    ].join("\n");
    this.udp_proc_probe_text = [
      "__UDP__\t/proc/net/udp\t0100007F:14E9\t07\t9101",
      "__MAP__\t9101\t111\t8",
    ].join("\n");
    this.service_systemd_probe_text = [
      "__UNIT__\tsshd.service\tactive\trunning\tOpenSSH Daemon",
      "__UNIT__\tcron.service\tfailed\tfailed\tRegular background program processing daemon",
      "__UNITFILE__\tsshd.service\tenabled",
      "__UNITFILE__\tcron.service\tdisabled",
      "__SHOWLINE__\tId=sshd.service",
      "__SHOWLINE__\tMainPID=1",
      "__SHOWLINE__\tRestart=on-failure",
      "__SHOWLINE__\tTasksCurrent=8",
      "__SHOWLINE__\tMemoryCurrent=1048576",
      "__SHOWLINE__\tCPUUsageNSec=2500000",
      "__SHOWLINE__\tFragmentPath=/lib/systemd/system/sshd.service",
      "__SHOWLINE__\tUnitFilePreset=enabled",
      "__SHOWLINE__\tExecStart=/usr/sbin/sshd -D",
      "__SHOWLINE__\tExecReload=/bin/kill -HUP $MAINPID",
      "__SHOWLINE__\t",
      "__SHOWLINE__\tId=cron.service",
      "__SHOWLINE__\tMainPID=0",
      "__SHOWLINE__\tRestart=on-failure",
      "__SHOWLINE__\tTasksCurrent=0",
      "__SHOWLINE__\tMemoryCurrent=0",
      "__SHOWLINE__\tCPUUsageNSec=0",
      "__SHOWLINE__\tFragmentPath=/lib/systemd/system/cron.service",
      "__SHOWLINE__\tUnitFilePreset=enabled",
      "__SHOWLINE__\tExecStart=/usr/sbin/cron -f",
      "__SHOWLINE__\tExecReload=",
      "__SHOWLINE__\t",
    ].join("\n");
    this.service_openrc_probe_text = "__ERR__\topenrc_unavailable";
    this.service_sysv_probe_text = "__ERR__\tsysv_service_unavailable";
    this.service_static_probe_text = "__STATIC__\tsshd.service\t/lib/systemd/system/sshd.service";
    this.hardware_probe_text = [
      "__NET__\teth0\t52:54:00:12:34:56\tup\t1000\tvirtio_net\t/sys/class/net/eth0",
      "__BLK__\tvda\t1048576\t1\tQEMU HARDDISK\tQEMU\t/sys/block/vda",
      "__MNT__\t/dev/vda\t/\text4",
      "__PCI_RAW__\t0000:00:02.0 VGA compatible controller [0300]: Red Hat, Inc. QXL paravirtual graphic card [1b36:0100]",
      "__USB_RAW__\tBus 001 Device 002: ID 1d6b:0002 Linux Foundation 2.0 root hub",
      "__DRI__\trenderD128",
      "__CPU__\tIntel(R) Xeon(R)\t2",
      "__MEM__\t2048000",
    ].join("\n");
    this.disk_probe_text = [
      "__LSBLK_JSON_BEGIN__",
      "{\"blockdevices\":[{\"name\":\"vda\",\"kname\":\"vda\",\"path\":\"/dev/vda\",\"type\":\"disk\",\"size\":10737418240,\"ro\":0,\"rm\":0,\"model\":\"QEMU HARDDISK\",\"vendor\":\"QEMU\",\"tran\":\"virtio\",\"mountpoints\":[null],\"children\":[{\"name\":\"vda1\",\"kname\":\"vda1\",\"path\":\"/dev/vda1\",\"type\":\"part\",\"size\":10736369664,\"fstype\":\"ext4\",\"uuid\":\"1111-2222\",\"label\":\"rootfs\",\"mountpoints\":[\"/\"]}]}]}",
      "__LSBLK_JSON_END__",
      "__FINDMNT_JSON_BEGIN__",
      "{\"filesystems\":[{\"source\":\"/dev/vda1\",\"target\":\"/\",\"fstype\":\"ext4\",\"options\":\"rw,relatime\",\"size\":10736369664,\"used\":2048000,\"avail\":10000000000,\"use%\":\"1%\"}]}",
      "__FINDMNT_JSON_END__",
      "__BLKID__\t/dev/vda1: UUID=\"1111-2222\" TYPE=\"ext4\" LABEL=\"rootfs\"",
      "__PROC_PART__\t252\t0\t10485760\tvda",
      "__PROC_PART__\t252\t1\t10484736\tvda1",
      "__PROC_MNT__\t/dev/vda1\t/\text4\trw,relatime",
      "__SYSBLK__\tvda\t10737418240\t0\t0\tQEMU HARDDISK\tQEMU\t/sys/block/vda\t1",
      "__DF__\t/dev/vda1\text4\t10484736\t2048\t10482688\t1%\t/",
    ].join("\n");
    this.memory_probe_text = [
      "__MEMINFO__\tMemTotal\t4096000",
      "__MEMINFO__\tMemAvailable\t2048000",
      "__MEMINFO__\tMemFree\t1024000",
      "__MEMINFO__\tBuffers\t64000",
      "__MEMINFO__\tCached\t512000",
      "__MEMINFO__\tSReclaimable\t128000",
      "__MEMINFO__\tShmem\t256000",
      "__MEMINFO__\tActive\t512000",
      "__MEMINFO__\tInactive\t768000",
      "__MEMINFO__\tSwapTotal\t2097152",
      "__MEMINFO__\tSwapFree\t1048576",
      "__MEMINFO__\tKernelStack\t8192",
      "__MEMINFO__\tPageTables\t16384",
      "__MEMINFO__\tSlab\t65536",
      "__MEMINFO__\tSUnreclaim\t32768",
      "__SWAPDEV__\t/swapfile\tfile\t2097152\t1048576\t-2",
      "__PSI__\tsome\tsome avg10=0.20 avg60=0.10 avg300=0.01 total=1000",
      "__PSI__\tfull\tfull avg10=0.05 avg60=0.02 avg300=0.00 total=200",
      "__CGROUP__\tmemory.max\t2147483648",
      "__CGROUP__\tmemory.current\t1073741824",
      "__CGROUP__\tmemory.swap.max\t4294967296",
      "__CGROUP__\tmemory.swap.current\t536870912",
    ].join("\n");
    this.cpu_probe_text = [
      "__CPUINFO__\tprocessor\t: 0",
      "__CPUINFO__\tvendor_id\t: GenuineIntel",
      "__CPUINFO__\tcpu family\t: 6",
      "__CPUINFO__\tmodel\t: 158",
      "__CPUINFO__\tmodel name\t: Intel(R) Xeon(R) CPU",
      "__CPUINFO__\tstepping\t: 10",
      "__CPUINFO__\tmicrocode\t: 0xffffffff",
      "__CPUINFO__\tcpu MHz\t: 2394.454",
      "__CPUINFO__\tbogomips\t: 4788.90",
      "__CPUINFO__\tsiblings\t: 2",
      "__CPUINFO__\tcpu cores\t: 2",
      "__CPUINFO__\tflags\t: fpu vme de pse tsc msr pae mce cx8 apic sep",
      "__CPUINFO__\t",
      "__CPUINFO__\tprocessor\t: 1",
      "__CPUINFO__\tvendor_id\t: GenuineIntel",
      "__CPUINFO__\tcpu family\t: 6",
      "__CPUINFO__\tmodel\t: 158",
      "__CPUINFO__\tmodel name\t: Intel(R) Xeon(R) CPU",
      "__CPUINFO__\tstepping\t: 10",
      "__CPUINFO__\tmicrocode\t: 0xffffffff",
      "__CPUINFO__\tcpu MHz\t: 2394.454",
      "__CPUINFO__\tbogomips\t: 4788.90",
      "__CPUINFO__\tsiblings\t: 2",
      "__CPUINFO__\tcpu cores\t: 2",
      "__CPUINFO__\tflags\t: fpu vme de pse tsc msr pae mce cx8 apic sep",
      "__CPUINFO__\t",
      "__CPUSTAT__\tcpu  100 0 50 1000 10 0 0 0 0 0",
      "__CPUSTAT__\tcpu0 50 0 25 500 5 0 0 0 0 0",
      "__CPUSTAT__\tcpu1 50 0 25 500 5 0 0 0 0 0",
      "__CPUONLINE__\t0-1",
      "__CPUOFFLINE__\t",
      "__CPUCGROUP__\tcpu.max\t200000 100000",
      "__CPUCGROUP__\tcpuset.cpus.effective\t0-1",
      "__CPULOAD__\t0.20 0.10 0.05 1/100 999",
      "__CPUPSI__\tsome\tsome avg10=0.10 avg60=0.02 avg300=0.01 total=1000",
      "__CPUPSI__\tfull\tfull avg10=0.00 avg60=0.00 avg300=0.00 total=50",
      "__CPUARCH__\tx86_64",
    ].join("\n");
    this.cpu_top_snapshot_text = [
      "__CPUTOP__\t42\talice\t33.3\tpython3\tpython3 /opt/app.py",
      "__CPUTOP__\t1\troot\t0.5\tinit\t/sbin/init",
    ].join("\n");
    this.identity_probe_text = [
      "__PASSWD__\tgetent\troot:x:0:0:root:/root:/bin/bash",
      "__PASSWD__\tgetent\talice:x:1000:1000:Alice:/home/alice:/bin/bash",
      "__PASSWD__\tgetent\tbob:x:1001:1001:Bob:/home/bob:/bin/bash",
      "__PASSWD__\tgetent\tdaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin",
      "__GROUP__\tgetent\troot:x:0:",
      "__GROUP__\tgetent\talice:x:1000:alice",
      "__GROUP__\tgetent\tbob:x:1001:bob",
      "__GROUP__\tgetent\tsudo:x:27:alice",
      "__PWS__\troot\troot P 03/01/2026 0 99999 7 -1",
      "__PWS__\talice\talice L 03/01/2026 0 99999 7 -1",
      "__PWS__\tbob\tbob P 03/01/2026 0 99999 7 -1",
      "__CHAGE__\talice\tAccount expires                                        : never;Password expires                                    : never",
      "__SUDOINCLUDE__\t/etc/sudoers\t/etc/sudoers.d",
      "__SUDOER__\t/etc/sudoers\t%sudo ALL=(ALL:ALL) ALL",
      "__SUDOER__\t/etc/sudoers.d/app-admins\tbob ALL=(ALL) NOPASSWD:ALL",
      "__LASTLOG__\talice pts/0 192.168.1.9 Mon Mar  1 12:00:00 +0000 2026",
    ].join("\n");
    this.firewall_probe_text = [
      "__IPT4S__\t-P INPUT DROP",
      "__IPT4S__\t-P FORWARD DROP",
      "__IPT4S__\t-P OUTPUT ACCEPT",
      "__IPT4S__\t-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
      "__IPT4S__\t-A INPUT -i lo -j ACCEPT",
      "__IPT4S__\t-A INPUT -p tcp --dport 22 -j ACCEPT",
      "__IPT4S__\t-A INPUT -p udp --dport 53 -j ACCEPT",
      "__IPT4S__\t-A INPUT -p icmp --icmp-type echo-request -j ACCEPT",
      "__SYSCTL__\ticmp_echo_ignore_all\t0",
    ].join("\n");
    this.development_tooling_probe_text = [
      "__PKGMGR__\tsystem\tapt\t/usr/bin/apt\tapt 2.7.1",
      "__PKGMGR__\tsystem\tdpkg\t/usr/bin/dpkg\tdpkg 1.22.6",
      "__DISTROPKG_MANAGER__\tdpkg",
      "__DISTROPKG__\tdpkg\tlibssl-dev\t3.0.13-1",
      "__DISTROPKG__\tdpkg\tnodejs\t22.4.0-1",
      "__DISTROPKG__\tdpkg\tpython3-requests\t2.32.3-1",
      "__DISTROPKG__\tdpkg\trustc\t1.82.0-1",
      "__ECO__\tc_cpp",
      "__TOOL__\tc_cpp\tgcc\t/usr/bin/gcc\tgcc (Ubuntu 13.2.0)",
      "__TOOL__\tc_cpp\tclang\t/usr/bin/clang\tclang version 18.1.3",
      "__PKGMGR__\tc_cpp\tpkg-config\t/usr/bin/pkg-config\t0.29.2",
      "__MODULE__\tc_cpp\topenssl\t3.0.13\tpkg-config",
      "__MODULE__\tc_cpp\tzlib\t1.2.13\tpkg-config",
      "__PATH__\tc_cpp\tsearch_dirs\t=/usr/lib/gcc:/usr/local/lib",
      "__ECO__\tnodejs",
      "__TOOL__\tnodejs\tnode\t/usr/bin/node\tv22.4.0",
      "__PKGMGR__\tnodejs\tnpm\t/usr/bin/npm\t10.8.0",
      "__MODULE__\tnodejs\ttypescript\t5.6.2\tnpm_global",
      "__MODULE__\tnodejs\tws\t8.18.0\tnpm_global",
      "__PATH__\tnodejs\truntime_global_paths\t/usr/lib/node_modules:/usr/local/lib/node_modules",
      "__ECO__\tpython",
      "__TOOL__\tpython\tpython3\t/usr/bin/python3\tPython 3.12.3",
      "__PKGMGR__\tpython\tpip3\t/usr/bin/pip3\t24.0",
      "__MODULE__\tpython\trequests\t2.32.3\tpip",
      "__MODULE__\tpython\turllib3\t2.2.2\tpip",
      "__ECO__\truby",
      "__TOOL__\truby\truby\t/usr/bin/ruby\truby 3.2.2p53",
      "__PKGMGR__\truby\tgem\t/usr/bin/gem\t3.5.9",
      "__MODULE__\truby\trake\t13.2.1\tgem",
      "__ECO__\tgo",
      "__TOOL__\tgo\tgo\t/usr/local/go/bin/go\tgo version go1.23.0 linux/amd64",
      "__PATH__\tgo\truntime_gopath\t/root/go",
      "__ECO__\trust",
      "__TOOL__\trust\trustc\t/usr/bin/rustc\trustc 1.82.0 (f6e511eec 2024-10-15)",
      "__PKGMGR__\trust\tcargo\t/usr/bin/cargo\tcargo 1.82.0",
      "__MODULE__\trust\tripgrep\t14.1.1\tcargo_install",
      "__ERR__\tpackage_inventory\tdevtool_partial_data:module_cap_applied",
    ].join("\n");
    this.interface_ip_probe_text = [
      "__IFACE__\tlo\tinet\t127.0.0.1/8",
      "__IFACE__\teth0\tinet\t192.168.10.20/24",
      "__IFACE__\tlo\tinet6\t::1/128",
      "__IFACE__\teth0\tinet6\tfe80::20/64",
    ].join("\n");
    this.interface_ifconfig_probe_text = "";
    this.interface_base_probe_text = "__IFBASE__\tlo\n__IFBASE__\teth0\n";
  }

  public async runCommand(params: {
    node_connection: proxmox_node_connection_i;
    command_input: {
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
    };
  }): Promise<proxmox_lxc_run_command_result_t> {
    const command_label = params.command_input.shell_mode
      ? (params.command_input.shell_command ?? "")
      : params.command_input.command_argv.join(" ");
    let stdout = "hello from container\n";
    if (params.command_input.command_argv[0] === "cat" && params.command_input.command_argv[1] === "/etc/os-release") {
      stdout = this.os_release_text;
    } else if (
      params.command_input.command_argv[0] === "cat"
      && params.command_input.command_argv[1] === "/usr/lib/os-release"
    ) {
      stdout = this.usr_lib_os_release_text;
    } else if (
      params.command_input.command_argv[0] === "lsb_release"
      && params.command_input.command_argv[1] === "-a"
    ) {
      stdout = this.lsb_release_text;
    } else if (params.command_input.command_argv[0] === "uname" && params.command_input.command_argv[1] === "-r") {
      stdout = this.kernel_release_text;
    } else if (params.command_input.command_argv[0] === "uname" && params.command_input.command_argv[1] === "-v") {
      stdout = this.kernel_version_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_CRON_PROBE_SYSTEM__")
    ) {
      stdout = this.system_cron_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_CRON_PROBE_USER__")
    ) {
      stdout = this.user_cron_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_PROCESS_PS__")
    ) {
      stdout = this.process_ps_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_PROCESS_PID_FALLBACK__")
    ) {
      stdout = this.process_pid_fallback_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_PROCESS_PROC_DETAILS__")
    ) {
      stdout = this.process_proc_details_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_TCP_SS__")
    ) {
      stdout = this.tcp_ss_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_TCP_NETSTAT__")
    ) {
      stdout = this.tcp_netstat_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_TCP_PROC__")
    ) {
      stdout = this.tcp_proc_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_INTERFACE_IP__")
    ) {
      stdout = this.interface_ip_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_INTERFACE_IFCONFIG__")
    ) {
      stdout = this.interface_ifconfig_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_INTERFACE_BASE__")
    ) {
      stdout = this.interface_base_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_UDP_SS__")
    ) {
      stdout = this.udp_ss_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_UDP_NETSTAT__")
    ) {
      stdout = this.udp_netstat_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_UDP_PROC__")
    ) {
      stdout = this.udp_proc_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_SERVICE_SYSTEMD__")
    ) {
      stdout = this.service_systemd_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_SERVICE_OPENRC__")
    ) {
      stdout = this.service_openrc_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_SERVICE_SYSV__")
    ) {
      stdout = this.service_sysv_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_SERVICE_STATIC__")
    ) {
      stdout = this.service_static_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_HARDWARE_PROBE__")
    ) {
      stdout = this.hardware_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_DISK_PROBE__")
    ) {
      stdout = this.disk_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_MEMORY_PROBE__")
    ) {
      stdout = this.memory_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_CPU_PROBE__")
    ) {
      stdout = this.cpu_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_CPU_TOP_SNAPSHOT__")
    ) {
      stdout = this.cpu_top_snapshot_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_IDENTITY_PROBE__")
    ) {
      const is_signals_only = params.command_input.shell_command.includes("__PROXMOX_IDENTITY_PRIVILEGE_DETAIL_MODE__\tsignals_only");
      if (is_signals_only) {
        stdout = this.identity_probe_text
          .split("\n")
          .filter((line_value) => !line_value.startsWith("__SUDOER__\t") && !line_value.startsWith("__SUDOINCLUDE__\t"))
          .join("\n");
      } else {
        stdout = this.identity_probe_text;
      }
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_FIREWALL_PROBE__")
    ) {
      stdout = this.firewall_probe_text;
    } else if (
      params.command_input.shell_mode
      && typeof params.command_input.shell_command === "string"
      && params.command_input.shell_command.includes("__PROXMOX_DEVTOOLS_PROBE__")
    ) {
      stdout = this.development_tooling_probe_text;
    }
    const session_id = `${params.command_input.node_id}:${params.command_input.container_id}:command`;
    return {
      session_id,
      node_id: params.command_input.node_id,
      container_id: params.command_input.container_id,
      command: command_label,
      execution_mode: "ssh_pct",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: 15,
      succeeded: true,
      timed_out: false,
      exit_code: 0,
      stdout,
      stderr: "",
      combined_output: stdout,
      truncated_output: false,
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async openInteractiveSession(params: {
    node_connection: proxmox_node_connection_i;
    session_input: {
      node_id: string;
      container_id: string;
      command: string;
      columns: number;
      rows: number;
      timeout_ms?: number;
    };
  }): Promise<proxmox_lxc_terminal_session_t> {
    const session_id = `${params.session_input.node_id}:${params.session_input.container_id}:terminal`;
    const session: proxmox_lxc_terminal_session_t = {
      session_id,
      node_id: params.session_input.node_id,
      container_id: params.session_input.container_id,
      command: params.session_input.command,
      columns: params.session_input.columns,
      rows: params.session_input.rows,
      opened_at: new Date().toISOString(),
      status: "open",
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
    const events: proxmox_lxc_terminal_event_t[] = [
      {
        session_id,
        event_type: "open",
        timestamp_iso: new Date().toISOString(),
      },
    ];
    this.terminal_sessions.set(session_id, {
      session,
      events,
    });
    return { ...session };
  }

  public async uploadFile(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: {
      node_id: string;
      container_id: string;
      source_file_path: string;
      target_file_path: string;
      owner_user?: string;
      owner_group?: string;
      mode_octal?: string;
      create_parent_directories: boolean;
      overwrite: boolean;
      verify_checksum: boolean;
      timeout_ms: number;
      chunk_size_bytes: number;
      high_water_mark_bytes: number;
    };
  }): Promise<proxmox_lxc_upload_file_result_t> {
    if (this.upload_should_fail_conflict) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_conflict",
        message: "Target exists.",
        details: {
          field: "target_file_path",
          value: params.upload_input.target_file_path,
        },
      });
    }
    if (this.upload_should_fail_checksum) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_checksum_mismatch",
        message: "Checksum mismatch.",
        details: {
          field: "verify_checksum",
        },
      });
    }
    return {
      session_id: `${params.upload_input.node_id}:${params.upload_input.container_id}:upload`,
      node_id: params.upload_input.node_id,
      container_id: params.upload_input.container_id,
      source_file_path: params.upload_input.source_file_path,
      target_file_path: params.upload_input.target_file_path,
      bytes_uploaded: 1024,
      elapsed_ms: 50,
      throughput_bytes_per_sec: 20480,
      overwrite: params.upload_input.overwrite,
      verify_checksum: params.upload_input.verify_checksum,
      checksum_source: params.upload_input.verify_checksum ? "a".repeat(64) : undefined,
      checksum_target: params.upload_input.verify_checksum ? "a".repeat(64) : undefined,
      retries: 0,
      truncated: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async uploadDirectory(params: {
    node_connection: proxmox_node_connection_i;
    upload_input: {
      node_id: string;
      container_id: string;
      source_directory_path: string;
      target_directory_path: string;
      create_parent_directories: boolean;
      overwrite: boolean;
      verify_checksum: boolean;
      timeout_ms: number;
      chunk_size_bytes: number;
      high_water_mark_bytes: number;
      include_patterns?: string[];
      exclude_patterns?: string[];
      pattern_mode: "regex" | "glob";
      symlink_policy: "skip" | "dereference" | "preserve";
      include_hidden: boolean;
    };
  }): Promise<proxmox_lxc_upload_directory_result_t> {
    if (this.upload_should_fail_conflict) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_conflict",
        message: "Target exists.",
        details: {
          field: "target_directory_path",
          value: params.upload_input.target_directory_path,
        },
      });
    }
    if (this.upload_should_fail_checksum) {
      throw new ProxmoxLxcUploadError({
        code: "proxmox.lxc.upload_checksum_mismatch",
        message: "Checksum mismatch.",
        details: {
          field: "verify_checksum",
        },
      });
    }
    return {
      session_id: `${params.upload_input.node_id}:${params.upload_input.container_id}:upload_dir`,
      node_id: params.upload_input.node_id,
      container_id: params.upload_input.container_id,
      source_directory_path: params.upload_input.source_directory_path,
      target_directory_path: params.upload_input.target_directory_path,
      files_uploaded: 3,
      directories_created: 2,
      bytes_uploaded: 4096,
      elapsed_ms: 100,
      throughput_bytes_per_sec: 40960,
      skipped_count: 0,
      failed_count: 0,
      checksum_verified_count: params.upload_input.verify_checksum ? 3 : 0,
      overwrite: params.upload_input.overwrite,
      verify_checksum: params.upload_input.verify_checksum,
      checksum_source: params.upload_input.verify_checksum ? "b".repeat(64) : undefined,
      checksum_target: params.upload_input.verify_checksum ? "b".repeat(64) : undefined,
      retries: 0,
      truncated: false,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      failed_entries: [],
      metrics: {
        logical_bytes_uploaded: 4096,
        wire_bytes_uploaded: 2048,
        logical_throughput_bytes_per_sec: 40960,
        wire_throughput_bytes_per_sec: 20480,
        phase_timings: {
          prepare_ms: 10,
          manifest_ms: 10,
          archive_ms: 20,
          transfer_ms: 30,
          extract_ms: 20,
          checksum_ms: params.upload_input.verify_checksum ? 10 : 0,
          total_ms: 100,
        },
      },
      handshake: {
        backend: "ssh_pct",
        transport: "ssh",
        endpoint: `ssh://${params.node_connection.host}:22`,
      },
    };
  }

  public async sendInput(params: {
    session_id: string;
    input_text: string;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.events.push({
      session_id: params.session_id,
      event_type: "output",
      output_chunk: params.input_text,
      timestamp_iso: new Date().toISOString(),
    });
  }

  public async resize(params: {
    session_id: string;
    columns: number;
    rows: number;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.session.columns = params.columns;
    runtime.session.rows = params.rows;
  }

  public async readEvents(params: {
    session_id: string;
    max_events?: number;
  }): Promise<proxmox_lxc_terminal_event_t[]> {
    const runtime = this.resolveRuntime(params.session_id);
    const max_events = params.max_events === undefined
      ? runtime.events.length
      : Math.max(0, Math.floor(params.max_events));
    if (max_events === 0) {
      return [];
    }
    const selected_events = runtime.events.slice(0, max_events);
    runtime.events.splice(0, selected_events.length);
    return selected_events;
  }

  public async close(params: {
    session_id: string;
    reason?: string;
    code?: number;
  }): Promise<void> {
    const runtime = this.resolveRuntime(params.session_id);
    runtime.session.status = "closed";
    runtime.session.closed_at = new Date().toISOString();
    runtime.events.push({
      session_id: params.session_id,
      event_type: "close",
      close_code: params.code ?? 1000,
      close_reason: params.reason ?? "test_close",
      timestamp_iso: runtime.session.closed_at,
    });
    this.terminal_sessions.delete(params.session_id);
  }

  public getSession(params: {
    session_id: string;
  }): proxmox_lxc_terminal_session_t | undefined {
    const runtime = this.terminal_sessions.get(params.session_id);
    if (!runtime) {
      return undefined;
    }
    return { ...runtime.session };
  }

  public ownsSession(session_id: string): boolean {
    return this.terminal_sessions.has(session_id);
  }

  private resolveRuntime(session_id: string): fake_terminal_runtime_i {
    const runtime = this.terminal_sessions.get(session_id);
    if (!runtime) {
      throw new Error(`Missing runtime for session: ${session_id}`);
    }
    return runtime;
  }
}

test("LXC create and start methods use typed request contracts and return task IDs.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const create_result = await service.createContainer({
    node_id: "node-a",
    container_id: 101,
    config: {
      hostname: "app-01",
      memory: 1024,
      ostemplate: "local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst",
    },
  });

  const create_request = request_client.requests.at(-1) as proxmox_request_i;
  const create_request_http = create_request as { method: string; path: string; body?: Record<string, unknown> };
  assert.equal(create_request_http.method, "POST");
  assert.equal(create_request_http.path, "/api2/json/nodes/node-a/lxc");
  assert.equal((create_request_http.body as Record<string, unknown>).vmid, "101");
  assert.equal(create_result.task_id, "UPID:node-a:200:dcba");
  assert.equal(create_result.operation, "create");

  const start_result = await service.startContainer({
    node_id: "node-a",
    container_id: 101,
    retry_allowed: true,
  });

  const start_request = request_client.requests.at(-1) as proxmox_request_i;
  const start_request_http = start_request as { method: string; path: string };
  assert.equal(start_request_http.method, "POST");
  assert.equal(start_request_http.path, "/api2/json/nodes/node-a/lxc/101/status/start");
  assert.equal(start_result.operation, "start");
});

test("runCommand validates input and returns SSH command result.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const result = await service.runCommand({
    node_id: "node-a",
    container_id: 101,
    command_argv: ["echo", "hello from container"],
    timeout_ms: 3000,
  });

  assert.equal(result.succeeded, true);
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout.includes("hello from container"), true);
  assert.equal(result.execution_mode, "ssh_pct");

  await assert.rejects(
    async () => service.runCommand({
      node_id: "node-a",
      container_id: 101,
      command_argv: [],
    }),
    {
      name: "ProxmoxValidationError",
      message: /command_argv/i,
    },
  );
});

test("getSystemInfo resolves distro and kernel from /etc/os-release and uname.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const system_info = await service.getSystemInfo({
    node_id: "node-a",
    container_id: 101,
  });

  assert.equal(system_info.distribution_id, "ubuntu");
  assert.equal(system_info.distribution_pretty_name, "Ubuntu 24.04 LTS");
  assert.equal(system_info.kernel_release, "6.8.0-52-generic");
  assert.equal(system_info.source_fields.distribution_id, "os_release");
  assert.equal(system_info.source_fields.kernel_release, "uname");
});

test("getSystemInfo falls back to /usr/lib/os-release when /etc/os-release is unavailable.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.os_release_text = "";
  ssh_backend.usr_lib_os_release_text = [
    'NAME="Alpine Linux"',
    "ID=alpine",
    'VERSION_ID="3.20.3"',
    'PRETTY_NAME="Alpine Linux v3.20"',
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const system_info = await service.getSystemInfo({
    node_id: "node-a",
    container_id: 101,
  });

  assert.equal(system_info.distribution_id, "alpine");
  assert.equal(system_info.distribution_pretty_name, "Alpine Linux v3.20");
  assert.equal(system_info.source_fields.distribution_id, "usr_lib_os_release");
});

test("getSystemInfo falls back to lsb_release when os-release metadata is unavailable.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.os_release_text = "";
  ssh_backend.usr_lib_os_release_text = "";
  ssh_backend.lsb_release_text = [
    "Distributor ID:\tDebian",
    "Description:\tDebian GNU/Linux 12 (bookworm)",
    "Release:\t12",
    "Codename:\tbookworm",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const system_info = await service.getSystemInfo({
    node_id: "node-a",
    container_id: 101,
  });

  assert.equal(system_info.distribution_id, "debian");
  assert.equal(system_info.distribution_version, "12");
  assert.equal(system_info.source_fields.distribution_name, "lsb_release");
});

test("getSystemInfo returns typed exec error when distro metadata cannot be resolved.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.os_release_text = "";
  ssh_backend.usr_lib_os_release_text = "";
  ssh_backend.lsb_release_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getSystemInfo({
      node_id: "node-a",
      container_id: 101,
    }),
    {
      name: "ProxmoxLxcExecError",
      message: /distribution/i,
    },
  );
});

test("getCronJobs parses mixed cron sources, disabled entries, special schedules, and warnings.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const cron_jobs_result = await service.getCronJobs({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(cron_jobs_result.jobs.length, 5);
  assert.equal(cron_jobs_result.jobs.some((job_record) => job_record.is_disabled), true);
  assert.equal(
    cron_jobs_result.jobs.some((job_record) => job_record.special_schedule === "@hourly"),
    true,
  );
  assert.equal(
    cron_jobs_result.jobs.some((job_record) => job_record.special_schedule === "@reboot"),
    true,
  );
  assert.equal(cron_jobs_result.parse_warnings.length, 1);
  assert.equal(cron_jobs_result.sources_scanned.includes("/etc/crontab"), true);
  assert.equal(
    cron_jobs_result.sources_scanned.includes("/var/spool/cron/crontabs/alice"),
    true,
  );
});

test("getCronJobs supports user-only mode and derives run_as_user from spool path.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const cron_jobs_result = await service.getCronJobs({
    node_id: "node-a",
    container_id: 105,
    include_system_cron: false,
    include_user_cron: true,
  });

  assert.equal(
    cron_jobs_result.jobs.every((job_record) => job_record.source_kind === "user_spool"),
    true,
  );
  assert.equal(
    cron_jobs_result.jobs.every((job_record) => job_record.run_as_user === "alice"),
    true,
  );
});

test("getCronJobs validates include flags to prevent empty source selection.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.getCronJobs({
      node_id: "node-a",
      container_id: 105,
      include_system_cron: false,
      include_user_cron: false,
    }),
    {
      name: "ProxmoxValidationError",
      message: /source group/i,
    },
  );
});

test("getProcessList parses ps + proc details and returns summary metadata.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const process_result = await service.getProcessList({
    node_id: "node-a",
    container_id: 105,
    include_environment: true,
    environment_mode: "keys_only",
    process_limit: 50,
  });

  assert.equal(process_result.processes.length, 2);
  assert.equal(process_result.summary.total_process_count, 2);
  assert.equal(process_result.probe_metadata.primary_source, "ps");
  assert.equal(process_result.summary.top_cpu_pids[0], 42);
  const alice_process = process_result.processes.find((process_record) => process_record.pid === 42);
  assert.equal(alice_process?.username, "alice");
  assert.equal(alice_process?.comm, "python3");
  assert.equal(Array.isArray(alice_process?.environment_keys), true);
});

test("getProcessList supports user filter and sanitized environment values.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const process_result = await service.getProcessList({
    node_id: "node-a",
    container_id: 105,
    include_environment: true,
    environment_mode: "sanitized_values",
    user_filter: ["alice"],
  });

  assert.equal(process_result.processes.length, 1);
  const process_record = process_result.processes[0];
  assert.equal(process_record.pid, 42);
  assert.equal(process_record.environment?.API_KEY, "[REDACTED]");
});

test("getProcessList falls back to proc pid list when ps output is empty.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.process_ps_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const process_result = await service.getProcessList({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(process_result.probe_metadata.fallback_used, true);
  assert.equal(process_result.processes.length >= 1, true);
});

test("getOpenTcpPorts parses ss listeners and enriches process metadata.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const tcp_result = await service.getOpenTcpPorts({
    node_id: "node-a",
    container_id: 105,
    include_loopback: true,
  });

  assert.equal(tcp_result.listeners.length, 2);
  assert.equal(tcp_result.summary.total_listeners, 2);
  assert.equal(tcp_result.summary.unique_ports, 2);
  assert.equal(tcp_result.probe_metadata.primary_source, "ss");
  assert.equal(tcp_result.listeners.some((listener) => listener.port === 22), true);
  assert.equal(tcp_result.listeners.some((listener) => listener.process?.comm === "python3"), true);
  assert.equal(
    tcp_result.listeners.some((listener) => listener.interface_match_kind === "wildcard_any"),
    true,
  );
  assert.equal(
    tcp_result.listeners.some((listener) => listener.interface_match_kind === "loopback_default"),
    true,
  );
});

test("getOpenTcpPorts falls back to netstat when ss has no listeners.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.tcp_ss_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const tcp_result = await service.getOpenTcpPorts({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(tcp_result.probe_metadata.primary_source, "netstat");
  assert.equal(tcp_result.summary.total_listeners >= 1, true);
});

test("getOpenTcpPorts falls back to procfs and supports listener filters.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.tcp_ss_probe_text = "";
  ssh_backend.tcp_netstat_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const tcp_result = await service.getOpenTcpPorts({
    node_id: "node-a",
    container_id: 105,
    include_loopback: true,
    port_filter: [8080],
  });

  assert.equal(tcp_result.probe_metadata.primary_source, "procfs");
  assert.equal(tcp_result.listeners.length, 1);
  assert.equal(tcp_result.listeners[0].port, 8080);
});

test("getOpenTcpPorts resolves exact interface matches and summary interface counts.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.tcp_ss_probe_text = [
    "LISTEN 0 4096 192.168.10.20:22 0.0.0.0:* users:((\"sshd\",pid=1,fd=3))",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const tcp_result = await service.getOpenTcpPorts({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(tcp_result.listeners.length, 1);
  assert.equal(tcp_result.listeners[0].interface_match_kind, "exact_ip");
  assert.equal(tcp_result.listeners[0].interface_name, "eth0");
  assert.equal(tcp_result.summary.interface_resolved_count, 1);
  assert.equal(tcp_result.summary.interface_unresolved_count, 0);
});

test("getOpenUdpPorts parses ss listeners and correlates interfaces.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const udp_result = await service.getOpenUdpPorts({
    node_id: "node-a",
    container_id: 105,
    include_loopback: true,
  });

  assert.equal(udp_result.listeners.length, 2);
  assert.equal(udp_result.summary.total_listeners, 2);
  assert.equal(udp_result.probe_metadata.primary_source, "ss");
  assert.equal(
    udp_result.listeners.some((listener_record) => listener_record.interface_match_kind === "wildcard_any"),
    true,
  );
  assert.equal(
    udp_result.listeners.some((listener_record) => listener_record.interface_match_kind === "loopback_default"),
    true,
  );
});

test("getOpenUdpPorts falls back to netstat when ss has no records.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.udp_ss_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const udp_result = await service.getOpenUdpPorts({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(udp_result.probe_metadata.primary_source, "netstat");
  assert.equal(udp_result.summary.total_listeners >= 1, true);
});

test("getOpenUdpPorts falls back to procfs and supports port filtering.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.udp_ss_probe_text = "";
  ssh_backend.udp_netstat_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const udp_result = await service.getOpenUdpPorts({
    node_id: "node-a",
    container_id: 105,
    port_filter: [5353],
    include_loopback: true,
  });

  assert.equal(udp_result.probe_metadata.primary_source, "procfs");
  assert.equal(udp_result.listeners.length, 1);
  assert.equal(udp_result.listeners[0].port, 5353);
});

test("getServicesAndDaemons parses systemd services and summary metadata.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_process_details: true,
  });

  assert.equal(services_result.service_manager, "systemd");
  assert.equal(services_result.summary.total_services >= 2, true);
  assert.equal(services_result.summary.running_count >= 1, true);
  assert.equal(services_result.summary.failed_count >= 1, true);
  assert.equal(services_result.services.some((service_record) => service_record.service_name === "sshd.service"), true);
  assert.equal(services_result.services.some((service_record) => service_record.process?.pid === 1), true);
});

test("getServicesAndDaemons falls back to sysv when systemd is unavailable.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.service_systemd_probe_text = "__ERR__\tsystemd_unavailable";
  ssh_backend.service_openrc_probe_text = "__ERR__\topenrc_unavailable";
  ssh_backend.service_sysv_probe_text = [
    "__SYSV__\tcron\t+",
    "__SYSV__\tnetworking\t-",
    "__INITD__\tcron",
    "__INITD__\tnetworking",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(services_result.service_manager, "sysvinit");
  assert.equal(services_result.summary.total_services >= 2, true);
  assert.equal(services_result.services.some((service_record) => service_record.manager_kind === "sysvinit"), true);
});

test("getServicesAndDaemons applies include_inactive and name filters deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_inactive: false,
    name_filter: ["ssh"],
  });

  assert.equal(services_result.services.length, 1);
  assert.equal(services_result.services[0].service_name, "sshd.service");
  assert.equal(services_result.services[0].is_running, true);
});

test("getServicesAndDaemons supports detail_level summary_only and full deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const summary_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    detail_level: "summary_only",
  });
  const full_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    detail_level: "full",
  });

  const summary_sshd = summary_result.services.find((service_record) => service_record.service_name === "sshd.service");
  const full_sshd = full_result.services.find((service_record) => service_record.service_name === "sshd.service");
  assert.equal(summary_sshd?.exec_start, undefined);
  assert.equal(summary_sshd?.exec_reload, undefined);
  assert.equal(full_sshd?.exec_start !== undefined, true);
});

test("getServicesAndDaemons falls back to openrc and preserves useful status fields.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.service_systemd_probe_text = "__ERR__\tsystemd_unavailable";
  ssh_backend.service_openrc_probe_text = [
    "__OPENRC__\tnetworking\tstarted\tenabled",
    "__OPENRC__\tcron\tstopped\tdisabled",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(services_result.service_manager, "openrc");
  assert.equal(services_result.services.some((service_record) => service_record.manager_kind === "openrc"), true);
  assert.equal(services_result.services.some((service_record) => service_record.start_on_boot === true), true);
});

test("getServicesAndDaemons tolerates variant systemd show formatting and emits parse warnings.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.service_systemd_probe_text = [
    "__UNIT__\tbeta.service\tactive\trunning\tBeta Service",
    "__UNITFILE__\tbeta.service\tenabled",
    "__SHOWLINE__\tRestart=always",
    "__SHOWLINE__\tId=beta.service",
    "__SHOWLINE__\tmalformed_line_without_equals",
    "__SHOWLINE__\tMainPID=42",
    "__SHOWLINE__\tExecStart=/usr/bin/beta --serve",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    detail_level: "full",
  });

  assert.equal(services_result.services.length >= 1, true);
  assert.equal(services_result.parse_warnings.length >= 1, true);
  assert.equal(services_result.services[0].service_name, "beta.service");
});

test("getServicesAndDaemons applies service_limit with deterministic ordering and truncation.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.service_systemd_probe_text = [
    "__UNIT__\tzeta.service\tactive\trunning\tZeta Service",
    "__UNIT__\talpha.service\tactive\trunning\tAlpha Service",
    "__UNIT__\tbeta.service\tinactive\tdead\tBeta Service",
    "__UNITFILE__\tzeta.service\tenabled",
    "__UNITFILE__\talpha.service\tenabled",
    "__UNITFILE__\tbeta.service\tdisabled",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    service_limit: 2,
  });

  assert.equal(services_result.services.length, 2);
  assert.equal(services_result.truncated, true);
  assert.equal(services_result.services[0].service_name, "alpha.service");
  assert.equal(services_result.services[1].service_name, "beta.service");
});

test("getServicesAndDaemons supports process_enrichment_mode none without process payloads.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_process_details: true,
    process_enrichment_mode: "none",
  });

  assert.equal(
    services_result.services.every((service_record) => service_record.process === undefined),
    true,
  );
  assert.equal(services_result.limits_applied.process_enrichment_mode, "none");
});

test("getServicesAndDaemons supports process_enrichment_mode main_pid_only vs full.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.service_systemd_probe_text = [
    "__UNIT__\tdelta.service\tactive\trunning\tDelta Service",
    "__UNITFILE__\tdelta.service\tenabled",
    "__SHOWLINE__\tId=delta.service",
    "__SHOWLINE__\tMainPID=999",
    "__SHOWLINE__\tControlPID=42",
    "__SHOWLINE__\t",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const main_pid_only_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_process_details: true,
    process_enrichment_mode: "main_pid_only",
  });
  const full_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_process_details: true,
    process_enrichment_mode: "full",
  });

  assert.equal(main_pid_only_result.services[0].process, undefined);
  assert.equal(full_result.services[0].process?.pid, 42);
});

test("getServicesAndDaemons rejects invalid process_enrichment_mode.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.getServicesAndDaemons({
      node_id: "node-a",
      container_id: 105,
      process_enrichment_mode: "invalid_mode" as unknown as "none",
    }),
    (error: unknown) => error instanceof ProxmoxValidationError,
  );
});

test("getServicesAndDaemons keeps discovery results when process enrichment fails.", async () => {
  const request_client = new FakeRequestClient();
  const service = new FakeProcessErrorLxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const services_result = await service.getServicesAndDaemons({
    node_id: "node-a",
    container_id: 105,
    include_process_details: true,
    process_enrichment_mode: "full",
  });

  assert.equal(services_result.summary.total_services > 0, true);
  assert.equal(
    services_result.scan_errors.some((scan_error) => scan_error.reason.includes("service_process_enrichment_failed:full")),
    true,
  );
});

test("getHardwareInventory parses mixed probe sources into normalized device records.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const hardware_result = await service.getHardwareInventory({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(hardware_result.probe_metadata.primary_source, "probe");
  assert.equal(hardware_result.devices.length > 0, true);
  assert.equal(hardware_result.summary.network_device_count >= 1, true);
  assert.equal(hardware_result.summary.storage_device_count >= 1, true);
  assert.equal(hardware_result.summary.graphics_device_count >= 1, true);
  const block_device = hardware_result.devices.find((device_record) => device_record.block_name === "vda");
  assert.equal(block_device?.mountpoints?.includes("/"), true);
});

test("getHardwareInventory applies include filters and device_limit deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.hardware_probe_text = [
    "__NET__\teth0\t52:54:00:12:34:56\tup\t1000\te1000\t/sys/class/net/eth0",
    "__NET__\teth1\t52:54:00:12:34:57\tdown\t1000\te1000\t/sys/class/net/eth1",
    "__PCI_RAW__\t0000:00:02.0 VGA compatible controller [0300]: Test GPU [1234:5678]",
    "__CPU__\tGeneric CPU\t4",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const hardware_result = await service.getHardwareInventory({
    node_id: "node-a",
    container_id: 105,
    include_graphics: false,
    device_limit: 1,
  });

  assert.equal(hardware_result.devices.length, 1);
  assert.equal(hardware_result.truncated, true);
  assert.equal(
    hardware_result.scan_errors.some((scan_error) => scan_error.reason === "hardware_partial_data:device_limit_applied"),
    true,
  );
  assert.equal(hardware_result.devices.some((device_record) => device_record.is_graphics), false);
});

test("getHardwareInventory fails with typed exec error when no device records are collected.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.hardware_probe_text = "__ERR__\tlspci\thardware_probe_unavailable";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getHardwareInventory({
      node_id: "node-a",
      container_id: 105,
      include_network: false,
      include_storage: false,
      include_pci: true,
      include_usb: false,
      include_graphics: false,
      include_virtual_devices: false,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect hardware inventory from container.");
    },
  );
});

test("getDiskAndBlockDevices parses lsblk/findmnt/blkid into typed disk inventory records.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const disk_result = await service.getDiskAndBlockDevices({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(disk_result.probe_metadata.primary_source, "lsblk");
  assert.equal(disk_result.block_devices.length >= 1, true);
  assert.equal(disk_result.partitions.length >= 1, true);
  assert.equal(disk_result.filesystems.length >= 1, true);
  assert.equal(disk_result.mounts.length >= 1, true);
  assert.equal(disk_result.summary.total_block_devices >= 1, true);
  assert.equal(disk_result.summary.total_partitions >= 1, true);
  assert.equal(disk_result.summary.total_filesystems >= 1, true);
  assert.equal(disk_result.summary.mounted_filesystem_count >= 1, true);
  assert.equal(disk_result.summary.filesystem_type_counts.ext4 >= 1, true);
});

test("getDiskAndBlockDevices falls back to proc/sys probes when lsblk data is unavailable.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.disk_probe_text = [
    "__ERR__\tlsblk\tdisk_probe_unavailable",
    "__PROC_PART__\t8\t0\t2097152\tsda",
    "__PROC_PART__\t8\t1\t2096128\tsda1",
    "__PROC_MNT__\t/dev/sda1\t/\text4\trw,relatime",
    "__SYSBLK__\tsda\t2147483648\t0\t0\tVirtual Disk\tVendorX\t/sys/block/sda\t1",
    "__DF__\t/dev/sda1\text4\t2096128\t1024\t2095104\t1%\t/",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const disk_result = await service.getDiskAndBlockDevices({
    node_id: "node-a",
    container_id: 105,
    include_usage: true,
  });

  assert.equal(disk_result.probe_metadata.primary_source !== "lsblk", true);
  assert.equal(disk_result.summary.total_block_devices >= 1, true);
  assert.equal(disk_result.summary.total_partitions >= 1, true);
  assert.equal(disk_result.summary.total_mounts >= 1, true);
  assert.equal(disk_result.scan_errors.some((scan_error) => scan_error.reason.includes("disk_probe_unavailable")), true);
});

test("getDiskAndBlockDevices applies limits and include flags deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.disk_probe_text = [
    "__LSBLK_JSON_BEGIN__",
    "{\"blockdevices\":[{\"name\":\"loop0\",\"path\":\"/dev/loop0\",\"type\":\"loop\",\"size\":1024,\"ro\":0,\"rm\":0,\"mountpoints\":[\"/snap/a\"]},{\"name\":\"vdb\",\"path\":\"/dev/vdb\",\"type\":\"disk\",\"size\":4096,\"ro\":0,\"rm\":0,\"children\":[{\"name\":\"vdb1\",\"path\":\"/dev/vdb1\",\"type\":\"part\",\"size\":3072,\"fstype\":\"ext4\",\"mountpoints\":[\"/data\"]}]}]}",
    "__LSBLK_JSON_END__",
    "__PROC_MNT__\t/dev/vdb1\t/data\text4\trw,relatime",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const disk_result = await service.getDiskAndBlockDevices({
    node_id: "node-a",
    container_id: 105,
    include_loop_devices: false,
    include_filesystems: false,
    include_mounts: false,
    device_limit: 1,
  });

  assert.equal(disk_result.block_devices.length, 1);
  assert.equal(disk_result.partitions.length >= 1, true);
  assert.equal(disk_result.filesystems.length, 0);
  assert.equal(disk_result.mounts.length, 0);
  assert.equal(disk_result.truncated, false);
  assert.equal(disk_result.block_devices.some((device_record) => device_record.device_type === "loop"), false);
});

test("getDiskAndBlockDevices applies filesystem_scope for pseudo filesystem filtering.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.disk_probe_text = [
    "__PROC_MNT__\ttmpfs\t/run\ttmpfs\trw,nosuid,nodev",
    "__PROC_MNT__\t/dev/vda1\t/\text4\trw,relatime",
    "__DF__\ttmpfs\ttmpfs\t1024\t64\t960\t6%\t/run",
    "__DF__\t/dev/vda1\text4\t2048\t1024\t1024\t50%\t/",
    "__PROC_PART__\t252\t1\t2096128\tvda1",
    "__SYSBLK__\tvda\t2147483648\t0\t0\tQEMU HARDDISK\tQEMU\t/sys/block/vda\t1",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const device_backed_result = await service.getDiskAndBlockDevices({
    node_id: "node-a",
    container_id: 105,
    filesystem_scope: "device_backed_only",
  });
  const persistent_result = await service.getDiskAndBlockDevices({
    node_id: "node-a",
    container_id: 105,
    filesystem_scope: "persistent_only",
  });

  assert.equal(
    device_backed_result.filesystems.some((filesystem_record) => filesystem_record.filesystem_type === "tmpfs"),
    false,
  );
  assert.equal(
    persistent_result.filesystems.some((filesystem_record) => filesystem_record.filesystem_type === "tmpfs"),
    false,
  );
  assert.equal(
    persistent_result.filesystems.some((filesystem_record) => filesystem_record.filesystem_type === "ext4"),
    true,
  );
});

test("getMemoryInfo parses meminfo, swap, psi, cgroup, and process memory telemetry.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const memory_result = await service.getMemoryInfo({
    node_id: "node-a",
    container_id: 105,
    include_process_breakdown: true,
    include_kernel_breakdown: true,
    include_cgroup_limits: true,
    process_limit: 200,
  });

  assert.equal(memory_result.memory.mem_total_kb, 4096000);
  assert.equal(memory_result.memory.mem_available_kb, 2048000);
  assert.equal(memory_result.swap.swap_total_kb, 2097152);
  assert.equal(memory_result.swap.swap_used_kb, 1048576);
  assert.equal(memory_result.kernel.kernel_stack_kb, 8192);
  assert.equal(memory_result.kernel.kernel_memory_estimate_kb !== undefined, true);
  assert.equal(memory_result.summary.memory_pressure_available, true);
  assert.equal(memory_result.summary.cgroup_limit_kb, 2097152);
  assert.equal(memory_result.summary.cgroup_current_kb, 1048576);
  assert.equal(memory_result.processes.length > 0, true);
  assert.equal(memory_result.summary.top_rss_pids.length > 0, true);
});

test("getMemoryInfo applies process filters and include flags deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const memory_result = await service.getMemoryInfo({
    node_id: "node-a",
    container_id: 105,
    include_process_breakdown: true,
    include_kernel_breakdown: false,
    include_cgroup_limits: false,
    process_limit: 1,
    min_process_rss_kb: 7000,
    include_zero_swap_entries: false,
  });

  assert.equal(memory_result.processes.length <= 1, true);
  assert.equal(memory_result.processes.every((process_record) => (process_record.rss_kb ?? 0) >= 7000), true);
  assert.equal(Object.keys(memory_result.kernel).length, 0);
  assert.equal(memory_result.swap.devices.every((device_record) => (device_record.size_kb ?? 0) > 0), true);
});

test("getMemoryInfo fails with typed exec error when probe returns no meaningful memory data.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.memory_probe_text = "__ERR__\tmeminfo\tmemory_probe_unavailable";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getMemoryInfo({
      node_id: "node-a",
      container_id: 105,
      include_process_breakdown: false,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect memory telemetry from container.");
    },
  );
});

test("getCpuInfo parses cpuinfo/stat/load/cgroup and top snapshot deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const cpu_result = await service.getCpuInfo({
    node_id: "node-a",
    container_id: 105,
    include_per_core: true,
    include_flags: true,
    include_top_snapshot: true,
    include_cgroup_limits: true,
    include_cpu_pressure: true,
    core_limit: 512,
  });

  assert.equal(cpu_result.cpu.vendor_id, "GenuineIntel");
  assert.equal(cpu_result.cpu.model_name?.includes("Intel"), true);
  assert.equal(cpu_result.cpu.logical_cpu_count, 2);
  assert.equal(cpu_result.cpu.online_cpu_count, 2);
  assert.equal(cpu_result.cpu.cpuset_cpu_count, 2);
  assert.equal(cpu_result.cpu.effective_quota_cores, 2);
  assert.equal(cpu_result.summary.total_bogomips !== undefined, true);
  assert.equal(cpu_result.summary.loadavg_1m, 0.2);
  assert.equal(cpu_result.summary.cpu_pressure_available, true);
  assert.equal(cpu_result.top_snapshot.length > 0, true);
});

test("getCpuInfo applies include flags and core limits deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.cpu_probe_text = [
    "__CPUINFO__\tprocessor\t: 0",
    "__CPUINFO__\tbogomips\t: 1000.00",
    "__CPUINFO__\tflags\t: fpu tsc",
    "__CPUINFO__\t",
    "__CPUINFO__\tprocessor\t: 1",
    "__CPUINFO__\tbogomips\t: 1000.00",
    "__CPUINFO__\tflags\t: fpu tsc",
    "__CPUINFO__\t",
    "__CPUONLINE__\t0",
    "__CPUOFFLINE__\t1",
    "__CPULOAD__\t0.01 0.01 0.01 1/10 10",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const cpu_result = await service.getCpuInfo({
    node_id: "node-a",
    container_id: 105,
    include_per_core: true,
    include_flags: false,
    include_top_snapshot: false,
    include_cgroup_limits: false,
    include_cpu_pressure: false,
    include_offline_cores: false,
    core_limit: 1,
  });

  assert.equal(cpu_result.cores.length <= 1, true);
  if (cpu_result.cores.length === 1) {
    assert.equal(cpu_result.cores[0].core_id, 0);
  }
  assert.equal(cpu_result.cpu.flags, undefined);
  assert.equal(cpu_result.top_snapshot.length, 0);
  assert.equal(cpu_result.truncated, false);
});

test("getCpuInfo fails with typed exec error when probe returns no meaningful cpu data.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.cpu_probe_text = "__ERR__\tcpuinfo\tcpu_probe_unavailable";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getCpuInfo({
      node_id: "node-a",
      container_id: 105,
      include_per_core: false,
      include_top_snapshot: false,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect CPU telemetry from container.");
    },
  );
});

test("getUsersAndGroups parses users/groups/status and privilege signals deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const identity_result = await service.getUsersAndGroups({
    node_id: "node-a",
    container_id: 105,
    include_shadow_status: true,
    include_last_login: true,
    include_sudo_privilege_signals: true,
    include_group_memberships: true,
  });

  assert.equal(identity_result.summary.total_users, 4);
  assert.equal(identity_result.summary.total_groups, 4);
  assert.equal(identity_result.summary.sudo_signal_user_count, 2);
  assert.equal(identity_result.groups.some((group_record) => group_record.group_name === "sudo"), true);
  const alice_record = identity_result.users.find((user_record) => user_record.username === "alice");
  assert.equal(alice_record?.is_locked, true);
  assert.equal(alice_record?.has_sudo_signal, true);
  assert.equal(alice_record?.supplementary_groups?.includes("sudo"), true);
  assert.equal(alice_record?.status_source_confidence.account_status, "high");
  const bob_record = identity_result.users.find((user_record) => user_record.username === "bob");
  assert.equal(bob_record?.has_sudo_signal, true);
  assert.equal(
    bob_record?.sudo_signal_sources.some((source_value) => source_value.includes("/etc/sudoers.d/app-admins")),
    true,
  );
});

test("getUsersAndGroups applies filters and limits deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const identity_result = await service.getUsersAndGroups({
    node_id: "node-a",
    container_id: 105,
    include_system_accounts: false,
    include_shadow_status: false,
    include_sudo_privilege_signals: false,
    include_group_memberships: false,
    username_filter: "ali",
    user_limit: 1,
    group_limit: 1,
  });

  assert.equal(identity_result.users.length, 1);
  assert.equal(identity_result.users[0]?.username, "alice");
  assert.equal(identity_result.users[0]?.supplementary_groups, undefined);
  assert.equal(identity_result.groups.length <= 1, true);
});

test("getUsersAndGroups supports privilege_detail_mode signals_only without sudoers-expanded provenance.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const identity_result = await service.getUsersAndGroups({
    node_id: "node-a",
    container_id: 105,
    include_sudo_privilege_signals: true,
    privilege_detail_mode: "signals_only",
  });

  const bob_record = identity_result.users.find((user_record) => user_record.username === "bob");
  assert.equal(bob_record?.has_sudo_signal, false);
  assert.equal(bob_record?.status_source_confidence.privilege_signal, "low");
  assert.equal(identity_result.limits_applied.privilege_detail_mode, "signals_only");
});

test("getUsersAndGroups fails with typed exec error when no identity records are collected.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.identity_probe_text = [
    "__ERR__\tfile_fallback\tidentity_probe_unavailable:passwd",
    "__ERR__\tfile_fallback\tidentity_probe_unavailable:group",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getUsersAndGroups({
      node_id: "node-a",
      container_id: 105,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect user/group identity telemetry from container.");
    },
  );
});

test("getFirewallInfo parses normalized rules, posture, and findings deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const firewall_result = await service.getFirewallInfo({
    node_id: "node-a",
    container_id: 105,
    include_raw_rules: false,
    include_nat: true,
    include_ipv6: true,
    include_security_findings: true,
  });

  assert.equal(firewall_result.firewall.backend_primary, "iptables");
  assert.equal(firewall_result.rules.length >= 4, true);
  assert.equal(firewall_result.posture.ingress_default_deny, true);
  assert.equal(firewall_result.posture.ingress_tcp_posture, "allow_restricted");
  assert.equal(firewall_result.posture.ingress_udp_posture, "allow_restricted");
  assert.equal(firewall_result.posture.icmp_echo_request_allowed, true);
  assert.equal(firewall_result.summary.action_counts.accept >= 1, true);
  assert.equal(firewall_result.posture.notable_findings.length >= 1, true);
});

test("getFirewallInfo parses nft chain policy, set/map expansion, and rule indexes from fixture.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.firewall_probe_text = BuildNftProbeTextFromFixture({
    file_name: "nft_default_drop_with_sets.ruleset",
  });
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const firewall_result = await service.getFirewallInfo({
    node_id: "node-a",
    container_id: 105,
    include_security_findings: false,
  });

  assert.equal(firewall_result.firewall.backend_primary, "nftables");
  assert.equal(firewall_result.firewall.default_policy_input, "drop");
  assert.equal(firewall_result.posture.ingress_default_deny, true);
  assert.equal(firewall_result.posture.ingress_tcp_posture, "allow_restricted");
  assert.equal(firewall_result.posture.ingress_udp_posture, "allow_restricted");
  assert.equal(
    firewall_result.rules.some((rule_record) => rule_record.chain === "input" && rule_record.hook === "input"),
    true,
  );
  assert.equal(
    firewall_result.rules.some(
      (rule_record) => typeof rule_record.dport === "string" && rule_record.dport.includes("22") && rule_record.dport.includes("443"),
    ),
    true,
  );
  assert.equal(
    firewall_result.rules.some(
      (rule_record) => typeof rule_record.dport === "string" && rule_record.dport.includes("53") && rule_record.dport.includes("123"),
    ),
    true,
  );
  assert.equal(
    firewall_result.rules.every((rule_record, index_value) => {
      if (index_value === 0) {
        return typeof rule_record.rule_index === "number";
      }
      const previous_index = firewall_result.rules[index_value - 1]?.rule_index;
      return typeof rule_record.rule_index === "number"
        && typeof previous_index === "number"
        && rule_record.rule_index >= previous_index;
    }),
    true,
  );
});

test("getFirewallInfo fixture with input accept policy reports allow_any posture.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.firewall_probe_text = BuildNftProbeTextFromFixture({
    file_name: "nft_input_accept_open.ruleset",
  });
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const firewall_result = await service.getFirewallInfo({
    node_id: "node-a",
    container_id: 105,
    include_security_findings: false,
  });

  assert.equal(firewall_result.firewall.default_policy_input, "accept");
  assert.equal(firewall_result.posture.ingress_default_deny, false);
  assert.equal(firewall_result.posture.ingress_tcp_posture, "allow_any");
  assert.equal(firewall_result.posture.ingress_udp_posture, "allow_any");
});

test("getFirewallInfo applies rule and finding limits deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.firewall_probe_text = [
    "__IPT4S__\t-P INPUT ACCEPT",
    "__IPT4S__\t-A INPUT -p tcp --dport 22 -j ACCEPT",
    "__IPT4S__\t-A INPUT -p tcp --dport 80 -j ACCEPT",
    "__IPT4S__\t-A INPUT -p tcp --dport 443 -j ACCEPT",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const firewall_result = await service.getFirewallInfo({
    node_id: "node-a",
    container_id: 105,
    include_security_findings: true,
    rule_limit: 2,
    finding_limit: 1,
  });

  assert.equal(firewall_result.rules.length, 2);
  assert.equal(firewall_result.posture.notable_findings.length, 1);
  assert.equal(firewall_result.truncated, true);
});

test("getFirewallInfo fails with typed exec error when no firewall telemetry is collected.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.firewall_probe_text = [
    "__ERR__\tnft\tfirewall_probe_unavailable:nft",
    "__ERR__\tiptables\tfirewall_probe_unavailable:iptables",
    "__ERR__\tip6tables\tfirewall_partial_data:ip6tables_unavailable",
    "__ERR__\tufw\tfirewall_partial_data:ufw_unavailable",
    "__ERR__\tfirewalld\tfirewall_partial_data:firewalld_unavailable",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getFirewallInfo({
      node_id: "node-a",
      container_id: 105,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect firewall telemetry from container.");
    },
  );
});

test("getDevelopmentToolingInfo parses ecosystem toolchains, package managers, and modules deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const development_result = await service.getDevelopmentToolingInfo({
    node_id: "node-a",
    container_id: 105,
    include_package_inventory: true,
    include_compiler_search_paths: true,
    include_distro_package_enrichment: true,
  });

  assert.equal(development_result.toolchains.length, 6);
  assert.equal(development_result.summary.ecosystems_present.includes("nodejs"), true);
  assert.equal(development_result.summary.ecosystems_present.includes("python"), true);
  assert.equal(development_result.summary.package_inventory_completeness !== "none", true);
  const nodejs_toolchain = development_result.toolchains.find((toolchain_record) => toolchain_record.ecosystem_kind === "nodejs");
  assert.equal(nodejs_toolchain?.is_present, true);
  assert.equal(
    nodejs_toolchain?.libraries_or_modules.some((module_record) => module_record.name === "typescript"),
    true,
  );
  assert.equal(
    nodejs_toolchain?.distro_packages?.some((package_record) => package_record.package_name === "nodejs"),
    true,
  );
  assert.equal(development_result.system_package_providers.length >= 1, true);
  assert.equal(development_result.probe_metadata.primary_source, "probe");
  assert.equal(development_result.probe_metadata.distro_package_enrichment_enabled, true);
  assert.equal(development_result.probe_metadata.distro_package_manager_used, "dpkg");
  assert.equal(development_result.probe_metadata.distro_packages_scanned_count >= 4, true);
});

test("getDevelopmentToolingInfo applies ecosystem selection and runtime module limits deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const development_result = await service.getDevelopmentToolingInfo({
    node_id: "node-a",
    container_id: 105,
    include_ruby: false,
    include_package_inventory: true,
    module_limit_per_runtime: 1,
    package_limit_per_runtime: 1,
    include_system_package_providers: false,
    include_distro_package_enrichment: true,
    distro_package_limit_total: 2,
    distro_package_limit_per_ecosystem: 1,
    distro_package_name_filters: ["python", "node"],
  });

  assert.equal(development_result.toolchains.some((toolchain_record) => toolchain_record.ecosystem_kind === "ruby"), false);
  const nodejs_toolchain = development_result.toolchains.find((toolchain_record) => toolchain_record.ecosystem_kind === "nodejs");
  assert.equal((nodejs_toolchain?.libraries_or_modules.length ?? 0) <= 1, true);
  assert.equal((nodejs_toolchain?.distro_packages?.length ?? 0) <= 1, true);
  assert.equal(development_result.system_package_providers.length, 0);
  assert.equal(development_result.truncated, true);
  assert.equal(development_result.probe_metadata.distro_packages_mapped_count <= 2, true);
  assert.equal(development_result.probe_metadata.distro_packages_truncated, false);
});

test("getDevelopmentToolingInfo parses apk/rpm/pacman distro package stubs without fatal errors.", async () => {
  const manager_cases: Array<{ manager_name: "apk" | "rpm" | "pacman"; package_line: string; }> = [
    {
      manager_name: "apk",
      package_line: "__DISTROPKG__\tapk\tpython3\t3.12.3-r0",
    },
    {
      manager_name: "rpm",
      package_line: "__DISTROPKG__\trpm\tgolang\t1.22.5-1.el9",
    },
    {
      manager_name: "pacman",
      package_line: "__DISTROPKG__\tpacman\tcargo\t1.82.0-2",
    },
  ];

  for (const manager_case of manager_cases) {
    const request_client = new FakeRequestClient();
    const ssh_backend = new FakeSshShellBackend();
    ssh_backend.development_tooling_probe_text = [
      "__ECO__\tpython",
      "__TOOL__\tpython\tpython3\t/usr/bin/python3\tPython 3.12.3",
      `__DISTROPKG_MANAGER__\t${manager_case.manager_name}`,
      manager_case.package_line,
    ].join("\n");

    const service = new LxcService({
      request_client,
      ssh_shell_backend: ssh_backend,
    });
    const development_result = await service.getDevelopmentToolingInfo({
      node_id: "node-a",
      container_id: 105,
      include_package_inventory: false,
      include_distro_package_enrichment: true,
    });
    assert.equal(development_result.probe_metadata.distro_package_manager_used, manager_case.manager_name);
    assert.equal(development_result.probe_metadata.distro_packages_scanned_count >= 1, true);
    assert.equal(
      development_result.toolchains.some((toolchain_record) => (toolchain_record.distro_packages?.length ?? 0) >= 1),
      true,
    );
  }
});

test("getDevelopmentToolingInfo keeps distro enrichment disabled by default.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const development_result = await service.getDevelopmentToolingInfo({
    node_id: "node-a",
    container_id: 105,
    include_package_inventory: true,
  });
  assert.equal(development_result.probe_metadata.distro_package_enrichment_enabled, false);
  assert.equal(development_result.probe_metadata.distro_packages_scanned_count, 0);
  assert.equal(
    development_result.toolchains.every((toolchain_record) => toolchain_record.distro_packages === undefined),
    true,
  );
});

test("getDevelopmentToolingInfo fails with typed exec error when no meaningful development telemetry is collected.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.development_tooling_probe_text = "";
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.getDevelopmentToolingInfo({
      node_id: "node-a",
      container_id: 105,
    }),
    (error: unknown) => {
      return error instanceof ProxmoxLxcExecError
        && error.message.includes("Unable to collect development tooling telemetry from container.");
    },
  );
});

test("generateSystemReportHtml returns complete HTML with inline assets and section anchors.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const report_result = await service.generateSystemReportHtml({
    node_id: "node-a",
    container_id: 105,
  });

  assert.equal(report_result.html.includes("<!doctype html>"), true);
  assert.equal(report_result.html.includes("<style>"), true);
  assert.equal(report_result.html.includes("<script>"), true);
  assert.equal(report_result.html.includes("id=\"section-system_info\""), true);
  assert.equal(report_result.html.includes("id=\"section-cron_jobs\""), true);
  assert.equal(report_result.html.includes("id=\"section-processes\""), true);
  assert.equal(report_result.html.includes("id=\"section-tcp_ports\""), true);
  assert.equal(report_result.html.includes("id=\"section-udp_ports\""), true);
  assert.equal(report_result.html.includes("id=\"section-services\""), true);
  assert.equal(report_result.html.includes("id=\"section-hardware\""), true);
  assert.equal(report_result.html.includes("id=\"section-disk\""), true);
  assert.equal(report_result.html.includes("id=\"section-memory\""), true);
  assert.equal(report_result.html.includes("id=\"section-cpu\""), true);
  assert.equal(report_result.html.includes("id=\"section-identity\""), true);
  assert.equal(report_result.html.includes("id=\"section-firewall\""), true);
  assert.equal(report_result.html.includes("id=\"section-devtools\""), true);
  assert.equal(report_result.metadata.sections.length, 13);
});

test("generateSystemReportFile writes report file and returns bytes/path metadata.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });
  const output_dir = fs.mkdtempSync(path.join("/tmp", "proxmox-lxc-report-test-"));

  try {
    const report_result = await service.generateSystemReportFile({
      node_id: "node-a",
      container_id: 105,
      output_dir,
      file_name_prefix: "report-contract",
      sections: {
        include_system_info: true,
        include_cron_jobs: false,
        include_processes: false,
        include_tcp_ports: false,
        include_udp_ports: false,
        include_services: false,
        include_hardware: false,
        include_disk: false,
        include_memory: false,
        include_cpu: false,
        include_identity: false,
        include_firewall: false,
        include_devtools: false,
      },
    });

    assert.equal(report_result.report_path.startsWith(output_dir), true);
    assert.equal(report_result.bytes_written > 0, true);
    assert.equal(fs.existsSync(report_result.report_path), true);
    const written_html = fs.readFileSync(report_result.report_path, "utf8");
    assert.equal(Buffer.byteLength(written_html, "utf8"), report_result.bytes_written);
    assert.equal(written_html.includes("id=\"section-system_info\""), true);
  } finally {
    fs.rmSync(output_dir, {
      recursive: true,
      force: true,
    });
  }
});

test("generateSystemReportHtml applies section disable flags deterministically.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const report_result = await service.generateSystemReportHtml({
    node_id: "node-a",
    container_id: 105,
    sections: {
      include_system_info: true,
      include_cron_jobs: false,
      include_processes: false,
      include_tcp_ports: false,
      include_udp_ports: false,
      include_services: false,
      include_hardware: false,
      include_disk: false,
      include_memory: false,
      include_cpu: false,
      include_identity: false,
      include_firewall: false,
      include_devtools: false,
    },
  });

  assert.equal(report_result.metadata.section_status_counts.disabled, 12);
  assert.equal(report_result.metadata.section_status_counts.success >= 1, true);
  assert.equal(report_result.html.includes("id=\"section-system_info\""), true);
  assert.equal(report_result.html.includes("id=\"section-cron_jobs\""), false);
  assert.equal(report_result.html.includes("id=\"section-devtools\""), false);
});

test("generateSystemReportHtml keeps rendering when telemetry is partial and reports section warnings.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const report_result = await service.generateSystemReportHtml({
    node_id: "node-a",
    container_id: 105,
  });
  const devtools_section = report_result.metadata.sections.find(
    (section_record) => section_record.section_id === "devtools",
  );
  assert.equal(devtools_section !== undefined, true);
  assert.equal(devtools_section?.status === "partial", true);
  assert.equal((devtools_section?.error_count ?? 0) >= 1, true);
  assert.equal(report_result.html.includes("id=\"section-devtools\""), true);
});

test("generateSystemReportHtml escapes telemetry content to prevent HTML injection.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.os_release_text = [
    "ID=ubuntu",
    "VERSION_ID=\"24.04\"",
    "PRETTY_NAME=\"Ubuntu <script>alert(1)</script>\"",
  ].join("\n");
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const report_result = await service.generateSystemReportHtml({
    node_id: "node-a",
    container_id: 105,
    sections: {
      include_system_info: true,
      include_cron_jobs: false,
      include_processes: false,
      include_tcp_ports: false,
      include_udp_ports: false,
      include_services: false,
      include_hardware: false,
      include_disk: false,
      include_memory: false,
      include_cpu: false,
      include_identity: false,
      include_firewall: false,
      include_devtools: false,
    },
  });
  assert.equal(report_result.html.includes("<script>alert(1)</script>"), false);
  assert.equal(report_result.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
});

test("openTerminalSession supports send, resize, read events, and close with SSH backend.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const session = await service.openTerminalSession({
    node_id: "node-a",
    container_id: 105,
    shell_mode: true,
    shell_command: "/bin/bash -il",
    columns: 140,
    rows: 45,
  });

  assert.equal(session.node_id, "node-a");
  assert.equal(session.container_id, "105");
  assert.equal(session.handshake.backend, "ssh_pct");

  await service.sendTerminalInput({
    session_id: session.session_id,
    input_text: "ls -la\n",
  });

  const resized_session = await service.resizeTerminal({
    session_id: session.session_id,
    columns: 180,
    rows: 50,
  });
  assert.equal(resized_session.columns, 180);
  assert.equal(resized_session.rows, 50);

  const events = await service.readTerminalEvents({
    session_id: session.session_id,
    max_events: 10,
  });
  assert.equal(events.some((event_record) => event_record.event_type === "open"), true);
  assert.equal(events.some((event_record) => event_record.event_type === "output"), true);

  await service.closeTerminalSession({
    session_id: session.session_id,
    reason: "test_complete",
    code: 1000,
  });

  await assert.rejects(
    async () => service.getTerminalSession({
      session_id: session.session_id,
    }),
    {
      name: "ProxmoxTerminalSessionError",
      message: /not found/i,
    },
  );
});

test("uploadFile validates request and returns typed upload metadata.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const upload_result = await service.uploadFile({
    node_id: "node-a",
    container_id: 105,
    source_file_path: "/tmp/sample-upload.txt",
    target_file_path: "/root/sample-upload.txt",
    verify_checksum: true,
    chunk_size_bytes: 128 * 1024,
    high_water_mark_bytes: 128 * 1024,
  });

  assert.equal(upload_result.node_id, "node-a");
  assert.equal(upload_result.container_id, "105");
  assert.equal(upload_result.bytes_uploaded > 0, true);
  assert.equal(upload_result.verify_checksum, true);
});

test("uploadFile rejects non-absolute target path.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "relative/path.txt",
    }),
    {
      name: "ProxmoxValidationError",
      message: /absolute path/i,
    },
  );
});

test("uploadFile surfaces overwrite=false conflict as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_conflict = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "/root/sample-upload.txt",
      overwrite: false,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /target exists/i,
    },
  );
});

test("uploadFile surfaces checksum mismatch as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_checksum = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadFile({
      node_id: "node-a",
      container_id: 105,
      source_file_path: "/tmp/sample-upload.txt",
      target_file_path: "/root/sample-upload.txt",
      verify_checksum: true,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /checksum mismatch/i,
    },
  );
});

test("uploadDirectory validates request and returns typed upload metadata.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  const upload_result = await service.uploadDirectory({
    node_id: "node-a",
    container_id: 105,
    source_directory_path: "/tmp/source-dir",
    target_directory_path: "/root/target-dir",
    verify_checksum: true,
      include_patterns: ["^nested/"],
      exclude_patterns: ["\\.tmp$"],
      pattern_mode: "regex",
      symlink_policy: "skip",
      include_hidden: true,
  });

  assert.equal(upload_result.node_id, "node-a");
  assert.equal(upload_result.container_id, "105");
  assert.equal(upload_result.files_uploaded > 0, true);
  assert.equal(upload_result.verify_checksum, true);
});

test("uploadDirectory rejects parent traversal in target path.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/tmp/../etc",
    }),
    {
      name: "ProxmoxValidationError",
      message: /parent path traversal/i,
    },
  );
});

test("uploadDirectory accepts glob matcher mode and patterns.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  const upload_result = await service.uploadDirectory({
    node_id: "node-a",
    container_id: 105,
    source_directory_path: "/tmp/source-dir",
    target_directory_path: "/root/target-dir",
    pattern_mode: "glob",
    include_patterns: ["nested/**", "root.txt"],
    exclude_patterns: ["**/*.tmp"],
    symlink_policy: "dereference",
  });

  assert.equal(upload_result.files_uploaded, 3);
});

test("uploadDirectory rejects invalid include regex patterns.", async () => {
  const request_client = new FakeRequestClient();
  const service = new LxcService({
    request_client,
    ssh_shell_backend: new FakeSshShellBackend(),
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/root/target-dir",
      include_patterns: ["("],
    }),
    {
      name: "ProxmoxValidationError",
      message: /invalid regex pattern/i,
    },
  );
});

test("uploadDirectory surfaces overwrite=false conflict as typed upload error.", async () => {
  const request_client = new FakeRequestClient();
  const ssh_backend = new FakeSshShellBackend();
  ssh_backend.upload_should_fail_conflict = true;
  const service = new LxcService({
    request_client,
    ssh_shell_backend: ssh_backend,
  });

  await assert.rejects(
    async () => service.uploadDirectory({
      node_id: "node-a",
      container_id: 105,
      source_directory_path: "/tmp/source-dir",
      target_directory_path: "/root/target-dir",
      overwrite: false,
    }),
    {
      name: "ProxmoxLxcUploadError",
      message: /target exists/i,
    },
  );
});
