#!/usr/bin/env python3
"""Basic sanity checks for the township configuration file."""

from __future__ import annotations

import sys
from pathlib import Path


REQUIRED_ROOT_KEYS = {"township", "jurisdictions", "issue_categories"}
REQUIRED_TOWNSHIP_KEYS = {"name", "primary_color", "secondary_color", "timezone"}


def main() -> int:
    if len(sys.argv) < 2:
        print("USAGE: validate_config.py <path-to-config>", file=sys.stderr)
        return 1

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"[ERROR] Config file not found: {path}", file=sys.stderr)
        return 1

    try:
        import yaml
    except ModuleNotFoundError:
        print("[WARN] PyYAML not installed; skipping config validation.")
        return 0

    data = yaml.safe_load(path.read_text())
    if not isinstance(data, dict):
        print("[ERROR] Config root must be a mapping", file=sys.stderr)
        return 1

    missing_root = REQUIRED_ROOT_KEYS - data.keys()
    if missing_root:
        print(f"[ERROR] Missing required top-level keys: {', '.join(sorted(missing_root))}", file=sys.stderr)
        return 1

    township = data["township"]
    if not isinstance(township, dict):
        print("[ERROR] 'township' section must be a mapping", file=sys.stderr)
        return 1

    missing_township = REQUIRED_TOWNSHIP_KEYS - township.keys()
    if missing_township:
        print(f"[ERROR] Missing township fields: {', '.join(sorted(missing_township))}", file=sys.stderr)
        return 1

    jurisdictions = data.get("jurisdictions", [])
    if not jurisdictions:
        print("[WARN] No jurisdictions configured. Smart triage will be limited.")

    issue_categories = data.get("issue_categories", [])
    if not issue_categories:
        print("[WARN] No issue categories configured.")

    print(f"[OK] {path.name} passed basic validation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
