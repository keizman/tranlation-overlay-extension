#!/usr/bin/env python3
"""
add_i18n.py - Efficient i18n translation management script

Usage:
    python add_i18n.py --list-files                    # List all locale files
    python add_i18n.py --file en-US.json --keys        # List top-level keys
    python add_i18n.py --file en-US.json --keys settings  # List keys under 'settings'
    python add_i18n.py --file en-US.json --keys settings.lazyLoading --input '{"newKey": "value"}'
    python add_i18n.py --batch --keys settings --input '{"newKey": "value"}'  # Add to all locales
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Default i18n directory relative to this script
SCRIPT_DIR = Path(__file__).parent
I18N_DIR = SCRIPT_DIR.parent / "src" / "i18n" / "locales"


def list_files():
    """List all available locale files."""
    if not I18N_DIR.exists():
        print(f"Error: i18n directory not found: {I18N_DIR}")
        sys.exit(1)
    
    files = sorted(I18N_DIR.glob("*.json"))
    print("Available locale files:")
    for f in files:
        print(f"  - {f.name}")
    return [f.name for f in files]


def get_nested_value(data: dict, key_path: str):
    """Get value at a nested key path like 'settings.lazyLoading'."""
    if not key_path:
        return data
    
    keys = key_path.split(".")
    current = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def set_nested_value(data: dict, key_path: str, updates: dict):
    """Set values at a nested key path."""
    if not key_path:
        # Merge at root level
        data.update(updates)
        return
    
    keys = key_path.split(".")
    current = data
    for key in keys[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    
    last_key = keys[-1]
    if last_key not in current:
        current[last_key] = {}
    
    if isinstance(current[last_key], dict):
        current[last_key].update(updates)
    else:
        print(f"Error: {key_path} is not a dict, cannot add nested keys")
        sys.exit(1)


def add_key(file_path: Path, parent_path: str, new_key: str):
    """Add a new empty key section at the specified path.
    
    Args:
        file_path: Path to the JSON file
        parent_path: Parent path where to add the key (empty string for root)
        new_key: Name of the new key to create
    """
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Navigate to parent
    if parent_path:
        parent = get_nested_value(data, parent_path)
        if parent is None:
            print(f"Error: Parent path '{parent_path}' not found")
            sys.exit(1)
        if not isinstance(parent, dict):
            print(f"Error: Parent path '{parent_path}' is not a dict")
            sys.exit(1)
    else:
        parent = data
    
    # Check if key already exists
    if new_key in parent:
        print(f"Error: Key '{new_key}' already exists at '{parent_path or '(root)'}'")
        sys.exit(1)
    
    # Add new empty dict
    parent[new_key] = {}
    
    # Write back
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    full_path = f"{parent_path}.{new_key}" if parent_path else new_key
    print(f"Created key '{full_path}' in {file_path.name}")


def batch_add_key(parent_path: str, new_key: str):
    """Add a new empty key section to all locale files."""
    if not I18N_DIR.exists():
        print(f"Error: i18n directory not found: {I18N_DIR}")
        sys.exit(1)
    
    files = sorted(I18N_DIR.glob("*.json"))
    if not files:
        print("Error: No locale files found")
        sys.exit(1)
    
    print(f"Batch adding key to {len(files)} locale files...")
    for file_path in files:
        add_key(file_path, parent_path, new_key)
    
    print(f"\nBatch operation complete: {len(files)} files updated")


def list_keys(file_path: Path, key_path: str = "", line_count: int = 0):
    """List keys at a specific path in the JSON file.
    
    Args:
        file_path: Path to the JSON file
        key_path: Dot-separated path to navigate (e.g., 'settings.lazyLoading')
        line_count: Show N items with values (0 = all keys without values)
    """
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    value = get_nested_value(data, key_path)
    
    if value is None:
        print(f"Error: Key path '{key_path}' not found")
        sys.exit(1)
    
    if isinstance(value, dict):
        path_display = key_path if key_path else "(root)"
        keys_list = sorted(value.keys())
        
        # Check if all children are leaf values (non-dict)
        all_leaves = all(not isinstance(value[k], dict) for k in keys_list)
        
        if line_count > 0 and all_leaves:
            # For leaf-only sections, limit displayed items
            print(f"Keys at '{path_display}' (showing {min(line_count, len(keys_list))}/{len(keys_list)}):")
            for key in keys_list[:line_count]:
                v = value[key]
                str_v = str(v)
                if len(str_v) > 50:
                    str_v = str_v[:50] + "..."
                print(f"{key}: {str_v}")
            if len(keys_list) > line_count:
                print(f"... +{len(keys_list) - line_count} more")
        else:
            # Normal mode: show all keys
            print(f"Keys at '{path_display}':")
            for key in keys_list:
                v = value[key]
                if isinstance(v, dict):
                    if line_count > 0:
                        # Show N child key:value pairs for this dict
                        child_items = list(v.items())[:line_count]
                        child_preview = ", ".join(
                            f"{k}={repr(cv)[:30]}" if not isinstance(cv, dict) else f"{k}=(...)"
                            for k, cv in child_items
                        )
                        if len(v) > line_count:
                            child_preview += f" +{len(v)-line_count} more"
                        print(f"{key} ({len(v)} items): {{{child_preview}}}")
                    else:
                        print(f"{key} ({len(v)} items)")
                else:
                    if line_count > 0:
                        str_v = str(v)
                        if len(str_v) > 50:
                            str_v = str_v[:50] + "..."
                        print(f"{key}: {str_v}")
                    else:
                        print(f"{key}")
    else:
        print(f"Value at '{key_path}': {value}")


def add_translation(file_path: Path, key_path: str, input_json: str):
    """Add translation entries to a specific path."""
    if not file_path.exists():
        print(f"Error: File not found: {file_path}")
        sys.exit(1)
    
    # Parse input JSON
    try:
        updates = json.loads(input_json)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}")
        sys.exit(1)
    
    # Read file
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Update data
    set_nested_value(data, key_path, updates)
    
    # Write back with pretty formatting
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    
    print(f"Added to {file_path.name} at '{key_path or '(root)'}': {list(updates.keys())}")


def batch_add_translation(key_path: str, input_json: str):
    """Add translation entries to all locale files."""
    if not I18N_DIR.exists():
        print(f"Error: i18n directory not found: {I18N_DIR}")
        sys.exit(1)
    
    files = sorted(I18N_DIR.glob("*.json"))
    if not files:
        print("Error: No locale files found")
        sys.exit(1)
    
    print(f"Batch adding to {len(files)} locale files...")
    for file_path in files:
        add_translation(file_path, key_path, input_json)
    
    print(f"\n Batch operation complete: {len(files)} files updated")


def main():
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
  %(prog)s --batch --keys settings --input '{"newKey": "New Value"}'
  %(prog)s --batch --add-key newSection
        """
    )
    
    parser.add_argument("--list-files", action="store_true",
                        help="List all available locale files")
    parser.add_argument("--file", "-f", type=str,
                        help="Locale file to work with (e.g., en-US.json)")
    parser.add_argument("--keys", "-k", type=str, nargs="?", const="",
                        help="Key path to list/navigate (e.g., 'settings.lazyLoading')")
    parser.add_argument("--line", "-l", type=int, default=0,
                        help="Show N lines of value preview (0=keys only, 1+=show content)")
    parser.add_argument("--input", "-i", type=str,
                        help="JSON object to add (e.g., '{\"key\": \"value\"}')")
    parser.add_argument("--add-key", "-a", type=str,
                        help="Create a new empty key section (use with --keys for nested)")
    parser.add_argument("--batch", "-b", action="store_true",
                        help="Apply operation to all locale files")
    parser.add_argument("--i18n-dir", type=str,
                        help="Custom i18n directory path")
    parser.add_argument("--input-file", type=str,
                        help="Read JSON input from file (avoid shell escaping issues)")
    
    args = parser.parse_args()
    
    # Resolve input JSON if provided
    input_json = args.input
    if args.input_file:
        try:
            with open(args.input_file, 'r', encoding='utf-8') as f:
                input_json = f.read()
        except Exception as e:
            print(f"Error reading input file: {e}")
            sys.exit(1)
            
    # Override i18n directory if specified
    global I18N_DIR
    if args.i18n_dir:
        I18N_DIR = Path(args.i18n_dir)
    
    # Handle --list-files
    if args.list_files:
        list_files()
        return
    
    # Handle batch mode
    if args.batch:
        if args.add_key:
            # Batch add new key
            parent_path = args.keys if args.keys else ""
            batch_add_key(parent_path, args.add_key)
        elif args.keys is not None:
            if input_json:
                batch_add_translation(args.keys, input_json)
            else:
                # Just list keys from first file
                files = sorted(I18N_DIR.glob("*.json"))
                if files:
                    list_keys(files[0], args.keys, args.line)
        else:
            print("Error: --batch requires --keys or --add-key")
            sys.exit(1)
        return
    
    # Handle single file mode
    if args.file:
        file_path = I18N_DIR / args.file
        
        if args.add_key:
            # Add new key section
            parent_path = args.keys if args.keys else ""
            add_key(file_path, parent_path, args.add_key)
        elif args.keys is not None:
            if input_json:
                add_translation(file_path, args.keys, input_json)
            else:
                list_keys(file_path, args.keys, args.line)
        else:
            print(f"Selected file: {args.file}")
            print("Use --keys to list keys or --add-key to create new section")
        return
    
    # No valid command
    parser.print_help()


if __name__ == "__main__":
    main()
