# Shared helpers for reading portfolio-infra Terraform outputs.
# Source from other scripts: source "$(dirname "$0")/lib/terraform-outputs.sh"

_tf_outputs_lib_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

portfolio_api_resolve_infra_tf_dir() {
  local api_root
  api_root="$(_tf_outputs_lib_dir)"
  local infra_tf="${PORTFOLIO_INFRA_TF_DIR:-$api_root/../portfolio-infra/terraform}"
  cd "$infra_tf" && pwd
}

require_terraform_outputs() {
  if ! command -v terraform >/dev/null 2>&1; then
    echo "terraform is required on PATH." >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required. Install with: brew install jq" >&2
    exit 1
  fi
  local tf_dir
  tf_dir="$(portfolio_api_resolve_infra_tf_dir)"
  if [[ ! -d "$tf_dir" ]]; then
    echo "portfolio-infra/terraform not found at: $tf_dir" >&2
    echo "Clone portfolio-infra as a sibling of portfolio-api." >&2
    exit 1
  fi
  export PORTFOLIO_INFRA_TF_DIR="$tf_dir"
}

tf_output_raw() {
  local name="$1"
  terraform -chdir="${PORTFOLIO_INFRA_TF_DIR}" output -raw "$name"
}

# Returns empty string if output is missing (e.g. added in code but not yet applied).
tf_output_raw_optional() {
  local name="$1"
  tf_output_raw "$name" 2>/dev/null || true
}

require_tf_output() {
  local name="$1"
  local hint="${2:-Run: cd portfolio-infra && make apply-dev}"
  if ! tf_output_raw "$name" >/dev/null 2>&1; then
    echo "Terraform output '$name' not found. $hint" >&2
    exit 1
  fi
}

tf_sql_admin_login() {
  local login
  login="$(tf_output_raw_optional sql_admin_login)"
  if [[ -n "$login" ]]; then
    echo "$login"
    return
  fi
  echo "ppmadmin"
}

tf_sql_database_dev() {
  local db
  db="$(tf_output_raw_optional sql_database_dev)"
  if [[ -n "$db" ]]; then
    echo "$db"
    return
  fi
  db="$(terraform -chdir="${PORTFOLIO_INFRA_TF_DIR}" output -json sql_database_names 2>/dev/null | jq -r '.[] | select(endswith("-dev"))' | head -1)"
  if [[ -n "$db" ]]; then
    echo "$db"
    return
  fi
  echo "sqldb-dev"
}
