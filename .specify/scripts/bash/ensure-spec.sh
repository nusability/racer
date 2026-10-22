#!/usr/bin/env bash
# Single-spec replacement for create-new-feature.sh.
#
# The game is described by ONE spec (specs/spec.md). This script makes sure it
# exists — seeding it from the spec template on first run — and reports its
# path. It never creates per-feature directories or branches.

set -e

JSON_MODE=false
for arg in "$@"; do
    case "$arg" in
        --json) JSON_MODE=true ;;
        --help|-h)
            echo "Usage: $0 [--json]"
            echo "  Ensures specs/spec.md exists and prints its path."
            exit 0
            ;;
        *) echo "ERROR: Unknown option '$arg'" >&2; exit 1 ;;
    esac
done

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

_paths_output=$(get_feature_paths) || { echo "ERROR: Failed to resolve spec paths" >&2; exit 1; }
eval "$_paths_output"
unset _paths_output

mkdir -p "$FEATURE_DIR"

SPEC_EXISTED=true
if [[ ! -f "$FEATURE_SPEC" ]]; then
    SPEC_EXISTED=false
    if ! resolve_template_content "spec-template" "$REPO_ROOT" > "$FEATURE_SPEC"; then
        echo "Warning: Spec template not found; created empty spec file" >&2
        : > "$FEATURE_SPEC"
    fi
fi

if $JSON_MODE; then
    printf '{"SPEC_FILE":"%s","SPEC_DIR":"%s","SPEC_EXISTED":%s}\n' \
        "$(json_escape "$FEATURE_SPEC")" "$(json_escape "$FEATURE_DIR")" "$SPEC_EXISTED"
else
    echo "SPEC_FILE: $FEATURE_SPEC"
    echo "SPEC_DIR: $FEATURE_DIR"
    echo "SPEC_EXISTED: $SPEC_EXISTED"
fi
