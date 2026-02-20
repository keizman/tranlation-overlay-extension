#!/usr/bin/env python3
"""
add_i18n.py - i18n translation management script

Usage examples:
    python add_i18n.py --list-files
    python add_i18n.py --file en-US.json --keys
    python add_i18n.py --file en-US.json --keys settings
    python add_i18n.py --file en-US.json --keys settings --input '{"newKey":"value"}'
    python add_i18n.py --batch --keys settings --input '{"newKey":"value"}' --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Default i18n directory relative to this script
SCRIPT_DIR = Path(__file__).parent
I18N_DIR = SCRIPT_DIR.parent / "src" / "i18n" / "locales"


class AddI18NError(Exception):
    """Domain error for i18n script operations."""


@dataclass
class OperationResult:
    status: str
    file_name: str
    message: str


def configure_console_encoding() -> None:
    """Avoid UnicodeEncodeError on terminals using legacy encodings."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
        except Exception:
            # Keep default behavior when reconfigure is unavailable.
            pass


def safe_print(*args: object, sep: str = " ", end: str = "\n", file: Any = sys.stdout) -> None:
    """Print with a fallback path for environments with limited output encoding."""
    text = sep.join(str(arg) for arg in args) + end
    try:
        file.write(text)
    except UnicodeEncodeError:
        encoding = getattr(file, "encoding", None) or "utf-8"
        encoded = text.encode(encoding, errors="backslashreplace")
        buffer = getattr(file, "buffer", None)
        if buffer is not None:
            buffer.write(encoded)
        else:
            file.write(encoded.decode(encoding, errors="replace"))


def fail(message: str, exit_code: int = 1) -> None:
    safe_print(f"Error: {message}", file=sys.stderr)
    raise SystemExit(exit_code)


def load_json_file(file_path: Path) -> dict[str, Any]:
    if not file_path.exists():
        raise AddI18NError(f"File not found: {file_path}")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise AddI18NError(f"Invalid JSON in {file_path.name}: {exc}") from exc
    if not isinstance(data, dict):
        raise AddI18NError(f"Top-level JSON must be an object in {file_path.name}")
    return data


def write_json_file(file_path: Path, data: dict[str, Any], dry_run: bool) -> None:
    if dry_run:
        return
    temp_path = file_path.with_suffix(file_path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(temp_path, file_path)


def list_locale_files() -> list[Path]:
    if not I18N_DIR.exists():
        raise AddI18NError(f"i18n directory not found: {I18N_DIR}")
    files = sorted(I18N_DIR.glob("*.json"))
    if not files:
        raise AddI18NError("No locale files found")
    return files


def list_files() -> list[str]:
    files = list_locale_files()
    safe_print("Available locale files:")
    for f in files:
        safe_print(f"  - {f.name}")
    return [f.name for f in files]


def get_nested_value(data: dict[str, Any], key_path: str) -> Any:
    if not key_path:
        return data

    current: Any = data
    for key in key_path.split("."):
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def resolve_target_dict(data: dict[str, Any], key_path: str, strict_path: bool) -> dict[str, Any]:
    if not key_path:
        return data

    current: Any = data
    traversed: list[str] = []
    for key in key_path.split("."):
        traversed.append(key)
        current_path = ".".join(traversed)
        if not isinstance(current, dict):
            raise AddI18NError(f"Path '{current_path}' is not an object")
        if key not in current:
            if strict_path:
                raise AddI18NError(f"Path '{current_path}' does not exist")
            current[key] = {}
        if not isinstance(current[key], dict):
            raise AddI18NError(f"Path '{current_path}' is not an object")
        current = current[key]

    return current


def add_key(file_path: Path, parent_path: str, new_key: str, dry_run: bool, strict_path: bool) -> OperationResult:
    data = load_json_file(file_path)
    parent = resolve_target_dict(data, parent_path, strict_path)

    if new_key in parent:
        return OperationResult(
            status="skipped",
            file_name=file_path.name,
            message=f"Key '{new_key}' already exists at '{parent_path or '(root)'}'",
        )

    parent[new_key] = {}
    write_json_file(file_path, data, dry_run)

    full_path = f"{parent_path}.{new_key}" if parent_path else new_key
    suffix = " (dry-run)" if dry_run else ""
    return OperationResult(
        status="updated",
        file_name=file_path.name,
        message=f"Created key '{full_path}'{suffix}",
    )


def list_keys(file_path: Path, key_path: str = "", line_count: int = 0) -> None:
    data = load_json_file(file_path)
    value = get_nested_value(data, key_path)

    if value is None:
        raise AddI18NError(f"Key path '{key_path}' not found")

    if not isinstance(value, dict):
        safe_print(f"Value at '{key_path}': {value}")
        return

    path_display = key_path if key_path else "(root)"
    keys_list = sorted(value.keys())
    all_leaves = all(not isinstance(value[k], dict) for k in keys_list)

    if line_count > 0 and all_leaves:
        safe_print(f"Keys at '{path_display}' (showing {min(line_count, len(keys_list))}/{len(keys_list)}):")
        for key in keys_list[:line_count]:
            item_value = value[key]
            text = str(item_value)
            if len(text) > 50:
                text = text[:50] + "..."
            safe_print(f"{key}: {text}")
        if len(keys_list) > line_count:
            safe_print(f"... +{len(keys_list) - line_count} more")
        return

    safe_print(f"Keys at '{path_display}':")
    for key in keys_list:
        item_value = value[key]
        if isinstance(item_value, dict):
            if line_count > 0:
                child_items = list(item_value.items())[:line_count]
                child_preview_parts: list[str] = []
                for child_key, child_value in child_items:
                    if isinstance(child_value, dict):
                        child_preview_parts.append(f"{child_key}=(...)")
                    else:
                        child_preview_parts.append(f"{child_key}={repr(child_value)[:30]}")
                child_preview = ", ".join(child_preview_parts)
                if len(item_value) > line_count:
                    child_preview += f" +{len(item_value)-line_count} more"
                safe_print(f"{key} ({len(item_value)} items): {{{child_preview}}}")
            else:
                safe_print(f"{key} ({len(item_value)} items)")
        else:
            if line_count > 0:
                text = str(item_value)
                if len(text) > 50:
                    text = text[:50] + "..."
                safe_print(f"{key}: {text}")
            else:
                safe_print(key)


def parse_updates(input_json: str) -> dict[str, Any]:
    try:
        parsed = json.loads(input_json)
    except json.JSONDecodeError as exc:
        raise AddI18NError(f"Invalid JSON input: {exc}") from exc
    if not isinstance(parsed, dict):
        raise AddI18NError("Input JSON must be an object, for example: {\"key\":\"value\"}")
    return parsed


def add_translation(
    file_path: Path,
    key_path: str,
    updates: dict[str, Any],
    dry_run: bool,
    strict_path: bool,
) -> OperationResult:
    data = load_json_file(file_path)
    target = resolve_target_dict(data, key_path, strict_path)

    changed_keys: list[str] = []
    for key, new_value in updates.items():
        old_value = target.get(key, object())
        if old_value != new_value:
            target[key] = new_value
            changed_keys.append(key)

    if not changed_keys:
        return OperationResult(
            status="skipped",
            file_name=file_path.name,
            message=f"No changes at '{key_path or '(root)'}' (all values already match)",
        )

    write_json_file(file_path, data, dry_run)
    suffix = " (dry-run)" if dry_run else ""
    return OperationResult(
        status="updated",
        file_name=file_path.name,
        message=f"Updated at '{key_path or '(root)'}': {changed_keys}{suffix}",
    )


def confirm_batch_operation(description: str, file_count: int) -> bool:
    if not sys.stdin.isatty():
        raise AddI18NError("Batch write requires --yes in non-interactive mode")

    safe_print(f"About to apply batch operation to {file_count} locale files.")
    safe_print(f"Operation: {description}")
    try:
        answer = input("Continue? [y/N]: ").strip().lower()
    except EOFError as exc:
        raise AddI18NError("No interactive input available. Use --yes or --dry-run for batch operations") from exc
    return answer in {"y", "yes"}


def print_result(result: OperationResult) -> None:
    safe_print(f"[{result.status.upper()}] {result.file_name}: {result.message}")


def print_batch_summary(updated: int, skipped: int, failed: int, dry_run: bool) -> None:
    suffix = " (dry-run)" if dry_run else ""
    safe_print("")
    safe_print(
        f"Batch summary{suffix}: updated={updated}, skipped={skipped}, failed={failed}"
    )


def batch_add_key(parent_path: str, new_key: str, dry_run: bool, assume_yes: bool, strict_path: bool) -> int:
    files = list_locale_files()

    if not dry_run and not assume_yes:
        if not confirm_batch_operation(f"Create key '{new_key}' under '{parent_path or '(root)'}'", len(files)):
            safe_print("Batch operation cancelled.")
            return 0

    updated = 0
    skipped = 0
    failed = 0
    for file_path in files:
        try:
            result = add_key(file_path, parent_path, new_key, dry_run=dry_run, strict_path=strict_path)
            print_result(result)
            if result.status == "updated":
                updated += 1
            else:
                skipped += 1
        except AddI18NError as exc:
            failed += 1
            safe_print(f"[FAILED] {file_path.name}: {exc}", file=sys.stderr)

    print_batch_summary(updated, skipped, failed, dry_run=dry_run)
    return 1 if failed else 0


def batch_add_translation(
    key_path: str,
    updates: dict[str, Any],
    dry_run: bool,
    assume_yes: bool,
    strict_path: bool,
) -> int:
    files = list_locale_files()

    if not dry_run and not assume_yes:
        if not confirm_batch_operation(f"Update path '{key_path or '(root)'}' with keys {list(updates.keys())}", len(files)):
            safe_print("Batch operation cancelled.")
            return 0

    updated = 0
    skipped = 0
    failed = 0
    for file_path in files:
        try:
            result = add_translation(
                file_path=file_path,
                key_path=key_path,
                updates=updates,
                dry_run=dry_run,
                strict_path=strict_path,
            )
            print_result(result)
            if result.status == "updated":
                updated += 1
            else:
                skipped += 1
        except AddI18NError as exc:
            failed += 1
            safe_print(f"[FAILED] {file_path.name}: {exc}", file=sys.stderr)

    print_batch_summary(updated, skipped, failed, dry_run=dry_run)
    return 1 if failed else 0


def main() -> None:
    configure_console_encoding()

    parser = argparse.ArgumentParser(
        description="Efficient i18n translation management script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --list-files
  %(prog)s --file en-US.json --keys
  %(prog)s --file en-US.json --keys settings
  %(prog)s --file en-US.json --keys settings --input '{"newKey": "New Value"}'
  %(prog)s --file en-US.json --add-key newSection
  %(prog)s --file en-US.json --keys settings --add-key newSubSection
  %(prog)s --batch --keys settings --input '{"newKey": "New Value"}' --dry-run
  %(prog)s --batch --add-key newSection --yes
        """,
    )

    parser.add_argument("--list-files", action="store_true", help="List all available locale files")
    parser.add_argument("--file", "-f", type=str, help="Locale file to work with (e.g., en-US.json)")
    parser.add_argument(
        "--keys",
        "-k",
        type=str,
        nargs="?",
        const="",
        help="Key path to list/navigate (e.g., 'settings.lazyLoading')",
    )
    parser.add_argument("--line", "-l", type=int, default=0, help="Show N lines of value preview (0=keys only)")
    parser.add_argument("--input", "-i", type=str, help="JSON object to add (e.g., '{\"key\": \"value\"}')")
    parser.add_argument("--add-key", "-a", type=str, help="Create a new empty key section (use with --keys for nested)")
    parser.add_argument("--batch", "-b", action="store_true", help="Apply operation to all locale files")
    parser.add_argument("--i18n-dir", type=str, help="Custom i18n directory path")
    parser.add_argument("--input-file", type=str, help="Read JSON input from file (avoid shell escaping issues)")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing files")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation for batch writes")
    parser.add_argument(
        "--strict-path",
        action="store_true",
        help="Require target key path to exist (do not auto-create missing path objects)",
    )

    args = parser.parse_args()

    input_json = args.input
    if args.input_file:
        try:
            with open(args.input_file, "r", encoding="utf-8") as f:
                input_json = f.read()
        except Exception as exc:
            fail(f"reading input file failed: {exc}")

    global I18N_DIR
    if args.i18n_dir:
        I18N_DIR = Path(args.i18n_dir)

    try:
        if args.list_files:
            list_files()
            return

        if args.batch:
            if args.add_key:
                parent_path = args.keys if args.keys else ""
                exit_code = batch_add_key(
                    parent_path=parent_path,
                    new_key=args.add_key,
                    dry_run=args.dry_run,
                    assume_yes=args.yes,
                    strict_path=args.strict_path,
                )
                raise SystemExit(exit_code)

            if args.keys is not None:
                if input_json:
                    updates = parse_updates(input_json)
                    exit_code = batch_add_translation(
                        key_path=args.keys,
                        updates=updates,
                        dry_run=args.dry_run,
                        assume_yes=args.yes,
                        strict_path=args.strict_path,
                    )
                    raise SystemExit(exit_code)

                files = list_locale_files()
                list_keys(files[0], args.keys, args.line)
                return

            fail("--batch requires --keys or --add-key")

        if args.file:
            file_path = I18N_DIR / args.file

            if args.add_key:
                parent_path = args.keys if args.keys else ""
                result = add_key(
                    file_path=file_path,
                    parent_path=parent_path,
                    new_key=args.add_key,
                    dry_run=args.dry_run,
                    strict_path=args.strict_path,
                )
                print_result(result)
                return

            if args.keys is not None:
                if input_json:
                    updates = parse_updates(input_json)
                    result = add_translation(
                        file_path=file_path,
                        key_path=args.keys,
                        updates=updates,
                        dry_run=args.dry_run,
                        strict_path=args.strict_path,
                    )
                    print_result(result)
                else:
                    list_keys(file_path, args.keys, args.line)
                return

            safe_print(f"Selected file: {args.file}")
            safe_print("Use --keys to list keys or --add-key to create new section")
            return

        parser.print_help()
    except AddI18NError as exc:
        fail(str(exc))


if __name__ == "__main__":
    main()
