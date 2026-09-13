from __future__ import annotations

from typing import Any


SUPPORTED_ARTIFACT_FORMATS = {"json", "markdown", "html", "docx", "pdf"}
DOWNLOAD_ARTIFACT_FORMATS = {"docx", "pdf"}


def artifact_publishers(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        tool
        for tool in candidate.get("harness_tools") or []
        if isinstance(tool, dict)
        and tool.get("kind") == "artifact_publisher"
        and tool.get("phase") == "after_skill"
    ]


def artifact_delivery_issues(candidate: dict[str, Any]) -> list[dict[str, str]]:
    """Validate that a promised file has an executable producer and delivery path."""
    contract = (candidate.get("operating_model") or {}).get("artifact_contract") or {}
    if contract.get("mode") != "write_file":
        return []

    issues: list[dict[str, str]] = []
    artifact_format = str(contract.get("format") or "")
    delivery = str(contract.get("delivery") or "workspace_file")
    producer = str(contract.get("producer") or "")
    child_tools = set(map(str, candidate.get("child_tools") or []))
    publishers = artifact_publishers(candidate)

    if artifact_format and artifact_format not in SUPPORTED_ARTIFACT_FORMATS:
        issues.append({
            "code": "artifact_format_unsupported",
            "message": f"artifact format {artifact_format!r} is not supported",
        })
    if delivery not in {"workspace_file", "user_download"}:
        issues.append({
            "code": "artifact_delivery_invalid",
            "message": "write_file artifact delivery must be workspace_file or user_download",
        })
    if producer not in {"child_tools", "harness_tool"}:
        issues.append({
            "code": "artifact_producer_missing",
            "message": "write_file artifact must declare producer as child_tools or harness_tool",
        })
        return issues

    if producer == "child_tools" and not {"Read", "Write"}.issubset(child_tools):
        issues.append({
            "code": "artifact_child_tools_missing",
            "message": "child_tools artifact production requires both Read and Write",
        })
    if producer == "harness_tool" and not publishers:
        issues.append({
            "code": "artifact_publisher_missing",
            "message": "harness_tool artifact production requires an after_skill artifact_publisher",
        })
    if delivery == "user_download" and producer != "harness_tool":
        issues.append({
            "code": "download_artifact_requires_harness",
            "message": "a downloadable artifact must be published by an after_skill Harness Tool",
        })
    if artifact_format in DOWNLOAD_ARTIFACT_FORMATS and delivery != "user_download":
        issues.append({
            "code": "binary_artifact_delivery_invalid",
            "message": f"{artifact_format} artifacts must use user_download delivery",
        })

    for publisher in publishers:
        if not publisher.get("input") or not publisher.get("output"):
            issues.append({
                "code": "artifact_publisher_contract_incomplete",
                "message": f"artifact publisher {publisher.get('tool_name')} needs non-empty typed input and output contracts",
            })
    return issues
