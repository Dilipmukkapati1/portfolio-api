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
  tf_sql_database_for_env dev
}

# Validate deploy target: dev | prod
validate_deploy_env() {
  local env="$1"
  case "$env" in
    dev|prod) return 0 ;;
    *)
      echo "Invalid environment '$env'. Use: dev or prod" >&2
      return 1
      ;;
  esac
}

tf_resource_group_name() {
  local rg
  rg="$(tf_output_raw_optional resource_group_name)"
  if [[ -n "$rg" ]]; then
    echo "$rg"
    return
  fi
  echo "rg-portfolio"
}

tf_function_app_name() {
  local env="$1"
  validate_deploy_env "$env"
  require_tf_output "${env}_function_app_name" "Run: cd portfolio-infra && make apply-${env}"
  tf_output_raw "${env}_function_app_name"
}

tf_function_app_url() {
  local env="$1"
  validate_deploy_env "$env"
  require_tf_output "${env}_function_app_url" "Run: cd portfolio-infra && make apply-${env}"
  tf_output_raw "${env}_function_app_url"
}

tf_static_web_app_name() {
  local env="$1"
  validate_deploy_env "$env"
  require_tf_output "${env}_static_web_app_name" "Run: cd portfolio-infra && make apply-${env}"
  tf_output_raw "${env}_static_web_app_name"
}

tf_static_web_app_hostname() {
  local env="$1"
  validate_deploy_env "$env"
  require_tf_output "${env}_static_web_app_hostname" "Run: cd portfolio-infra && make apply-${env}"
  tf_output_raw "${env}_static_web_app_hostname"
}

tf_sql_database_for_env() {
  local env="$1"
  validate_deploy_env "$env"
  local db
  if [[ "$env" == "dev" ]]; then
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
    return
  fi
  db="$(terraform -chdir="${PORTFOLIO_INFRA_TF_DIR}" output -json sql_database_names 2>/dev/null | jq -r '.[] | select(endswith("-prod"))' | head -1)"
  if [[ -n "$db" ]]; then
    echo "$db"
    return
  fi
  echo "sqldb-prod"
}

tf_sql_server_fqdn() {
  require_tf_output sql_server_fqdn
  tf_output_raw sql_server_fqdn
}

tf_sql_admin_password() {
  require_tf_output sql_admin_password
  tf_output_raw sql_admin_password
}
