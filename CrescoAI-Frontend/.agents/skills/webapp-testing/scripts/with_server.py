#!/usr/bin/env python3
"""
Start one or more local servers, wait for their ports, run a command, then clean up.
"""

import argparse
import os
import signal
import socket
import subprocess
import sys
import time


def port_ready(port, host="127.0.0.1", timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def stop_process(process):
    if process.poll() is not None:
        return

    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=5)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def main():
    parser = argparse.ArgumentParser(
        description="Run a command while one or more local servers are up."
    )
    parser.add_argument(
        "--server",
        action="append",
        required=True,
        help='Server command. Repeat with --port, for example: --server "npm run dev"',
    )
    parser.add_argument(
        "--port",
        action="append",
        type=int,
        required=True,
        help="Port that matches each --server entry.",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to probe for readiness. Defaults to 127.0.0.1.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=30,
        help="Seconds to wait for each server port. Defaults to 30.",
    )
    parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to run after servers are ready. Prefix with --.",
    )
    args = parser.parse_args()

    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("missing command to run after servers are ready")

    if len(args.server) != len(args.port):
        parser.error("--server and --port counts must match")

    processes = []
    try:
        for index, (server_cmd, port) in enumerate(zip(args.server, args.port), start=1):
            print(f"Starting server {index}/{len(args.server)}: {server_cmd}")
            process = subprocess.Popen(
                server_cmd,
                shell=True,
                start_new_session=True,
            )
            processes.append(process)

            print(f"Waiting for {args.host}:{port}...")
            if not port_ready(port, host=args.host, timeout=args.timeout):
                raise RuntimeError(
                    f"server did not become ready on {args.host}:{port} "
                    f"within {args.timeout}s"
                )
            print(f"Ready: {args.host}:{port}")

        print(f"Running: {' '.join(command)}")
        result = subprocess.run(command, check=False)
        return result.returncode
    finally:
        for process in reversed(processes):
            stop_process(process)


if __name__ == "__main__":
    sys.exit(main())
