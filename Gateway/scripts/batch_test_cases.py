"""CMD: python C:\\git\\Career-Agent\\Gateway\\scripts\\batch_test_cases.py

Requires an already running backend and Gateway with format=messages_list support.
Uses Python's standard library only. All configuration is in this file.
"""

import json
import socket
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


# ---------------- Edit configuration here; no command-line arguments required. ----------------
PROJECT_ROOT = Path(r"C:\git\Career-Agent")
GATEWAY_URL = "http://127.0.0.1:8787"
API_TOKEN = ""  # Can be hardcoded here; empty reads ONLY GATEWAY_API_TOKEN from ENV_FILE.
ENV_FILE = PROJECT_ROOT / "Gateway" / ".env.training"
CASE_DIR = PROJECT_ROOT / "Gateway" / "examples" / "cases"
CASE_FILES = [
    "resume_edit_fact_preserving.json",
    "application_document_audit.json",
    "career_direction_validation.json",
    "learning_progress_review.json",
    "opportunity_resume_tailoring.json",
]
OUTPUT_ROOT = PROJECT_ROOT / "Gateway" / "data" / "batch-tests"
HTTP_TIMEOUT_SECONDS = 60
POLL_SECONDS = 3
RUN_TIMEOUT_SECONDS = 900  # Overall client wait, independent of case limits.timeoutMs.
FINALIZE_AFTER_RUN = True  # Seals text trajectories; disable when late token ingestion is needed.
# Backend users/workspaces are retained for inspecting actual output files.
# -------------------------------------------------------------------------------------------

TERMINAL = {"completed", "failed", "cancelled", "timed_out"}


class ApiError(Exception):
    def __init__(self, method, path, status=None, code="request_failed"):
        self.status = status
        super().__init__(f"{method} {path}: {status or 'network'} {code}")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Client:
    def __init__(self, url, token):
        self.url = url.rstrip("/")
        self.token = token
        self.opener = build_opener(NoRedirect())

    def request(self, method, path, body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Authorization": f"Bearer {self.token}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        # POST is deliberately never retried: an unconfirmed create may have succeeded.
        for attempt in range(3 if method == "GET" else 1):
            try:
                req = Request(self.url + path, data=data, headers=headers, method=method)
                with self.opener.open(req, timeout=HTTP_TIMEOUT_SECONDS) as response:
                    return json.load(response)
            except HTTPError as error:
                if method == "GET" and error.code in {429, 502, 503, 504} and attempt < 2:
                    error.close()
                    time.sleep(POLL_SECONDS)
                    continue
                # Do not persist arbitrary upstream response bodies or credentials.
                raise ApiError(method, path, error.code, "http_error") from None
            except (URLError, TimeoutError, socket.timeout, ConnectionError, OSError):
                if method == "GET" and attempt < 2:
                    time.sleep(POLL_SECONDS)
                    continue
                raise ApiError(method, path, code="connection_or_timeout") from None
            except (ValueError, UnicodeError):
                raise ApiError(method, path, code="invalid_json_response") from None


def read_token():
    if API_TOKEN:
        return API_TOKEN
    # Never evaluate a .env file as shell code, nor print its contents.
    token = None
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if separator and key.strip() == "GATEWAY_API_TOKEN":
            value = value.strip()
            if value[:1] in {"'", '"'}:
                quote = value[0]
                end = value.find(quote, 1)
                if end == -1:
                    raise ValueError("GATEWAY_API_TOKEN has an unclosed quote")
                value = value[1:end]
            else:
                value = value.split("#", 1)[0].strip()
            token = value
    if not token:
        raise ValueError("Set API_TOKEN in script or GATEWAY_API_TOKEN in ENV_FILE")
    return token


def save(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def export_messages(client, run_id, folder):
    trajectory = client.request("GET", f"/v1/runs/{run_id}/trajectory?format=messages_list")
    save(folder / "trajectory.json", trajectory)
    messages = trajectory.get("messages_list")
    if not isinstance(messages, list):
        raise ValueError("messages_list missing: update Gateway or inspect trajectory.issues")
    # Directly consumable list plus a named-field document, without calls or SSE chunks.
    save(folder / "messages_list.json", messages)
    save(folder / "messages.json", {"runId": run_id, "messages_list": messages})
    return trajectory


def cancel(client, run_id, folder, result):
    try:
        snapshot = client.request("POST", f"/v1/runs/{run_id}/cancel")
        save(folder / "cancel.json", snapshot)
        result["cancelConfirmed"] = snapshot.get("status") in TERMINAL
    except (ApiError, OSError, ValueError) as error:
        result["cancelConfirmed"] = False
        result["cancelError"] = str(error)


def run_case(client, filename, task, folder, result):
    folder.mkdir()
    save(folder / "input.json", task)
    run_id = None
    terminal_seen = False
    try:
        result["creationUnconfirmed"] = True
        snapshot = client.request("POST", "/v1/runs", task)
        run_id = str(uuid.UUID(snapshot["runId"]))
        result.update(runId=run_id, creationUnconfirmed=False)
        save(folder / "created.json", snapshot)
        save(folder / "result.json", result)
        deadline = time.monotonic() + RUN_TIMEOUT_SECONDS
        last_status = None
        while True:
            save(folder / "run.json", snapshot)
            status = snapshot.get("status")
            result["status"] = status
            if status != last_status:
                print(f"  {run_id}: {status}", flush=True)
                last_status = status
            if status in TERMINAL:
                terminal_seen = True
                break
            if snapshot.get("execution", {}).get("available") is False:
                raise ValueError("harness_not_configured")
            if time.monotonic() >= deadline:
                raise TimeoutError("batch_client_wait_timeout")
            time.sleep(POLL_SECONDS)
            snapshot = client.request("GET", f"/v1/runs/{run_id}")
        result["workspaceRoot"] = (snapshot.get("harness") or {}).get("workspaceRoot")
        result["backendError"] = snapshot.get("error")
        # Save text before sealing, so data survives a failed finalize request.
        trajectory = export_messages(client, run_id, folder)
        if FINALIZE_AFTER_RUN:
            manifest = client.request("POST", f"/v1/runs/{run_id}/finalize")
            save(folder / "manifest.json", manifest)
            trajectory = export_messages(client, run_id, folder)
        result.update(
            messageCount=len(trajectory["messages_list"]),
            issues=trajectory.get("issues", []),
            trainingReady=trajectory.get("trainingReady", False),
            trainingReasons=trajectory.get("reasons", []),
            executionAndExportPassed=status == "completed" and bool(trajectory["messages_list"]) and not trajectory.get("issues"),
        )
    except (Exception, KeyboardInterrupt) as error:
        result["executionAndExportPassed"] = False
        result["error"] = "interrupted" if isinstance(error, KeyboardInterrupt) else str(error)
        if run_id:
            if not terminal_seen:
                cancel(client, run_id, folder, result)
            try:
                export_messages(client, run_id, folder)
            except (ApiError, ValueError, OSError) as export_error:
                result["exportError"] = str(export_error)
        if isinstance(error, KeyboardInterrupt):
            raise
    finally:
        save(folder / "result.json", result)


def main():
    # Validate every local case before starting any paid model execution.
    tasks = [(name, json.loads((CASE_DIR / name).read_text(encoding="utf-8-sig"))) for name in CASE_FILES]
    client = Client(GATEWAY_URL, read_token())
    readiness = client.request("GET", "/v1/readiness")
    if readiness.get("ready") is not True:
        raise ValueError("Gateway/backend not ready; start services and run doctor first")
    folder = OUTPUT_ROOT / (datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True)
    save(folder / "readiness.json", readiness)
    report = {"output": str(folder), "businessAcceptance": "not_evaluated", "results": []}
    print(f"Output: {folder}", flush=True)
    try:
        for i, (filename, task) in enumerate(tasks, 1):
            print(f"[{i}/{len(tasks)}] {filename}", flush=True)
            result = {"case": filename, "taskId": task.get("taskId")}
            report["results"].append(result)
            run_case(client, filename, task, folder / Path(filename).stem, result)
            save(folder / "report.json", report)
    except KeyboardInterrupt:
        report["interrupted"] = True
        print("Interrupted; known active run cancellation attempted.", flush=True)
    finally:
        save(folder / "report.json", report)
    passed = sum(r.get("executionAndExportPassed", False) for r in report["results"])
    print(f"Execution/export passed: {passed}/{len(tasks)}; report: {folder / 'report.json'}", flush=True)
    return 0 if passed == len(tasks) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ApiError, ValueError, OSError) as error:
        print(f"Startup/output error: {error}", file=sys.stderr)
        sys.exit(2)
