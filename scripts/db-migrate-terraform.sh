#!/usr/bin/env bash
# Run Liquibase against Azure SQL using portfolio-infra Terraform outputs (dev|prod).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/terraform-outputs.sh
source "$ROOT/scripts/lib/terraform-outputs.sh"

DEPLOY_ENV="${1:-}"
CMD="${2:-update}"
PROPS="$ROOT/db/liquibase.deploy.properties"

usage() {
  echo "Usage: $0 <dev|prod> [liquibase-command]" >&2
  echo "  Default command: update" >&2
  exit 1
}

docker_daemon_ready() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

write_liquibase_properties() {
  local fqdn database login password host
  fqdn="$(tf_sql_server_fqdn)"
  database="$(tf_sql_database_for_env "$DEPLOY_ENV")"
  login="$(tf_sql_admin_login)"
  password="$(tf_sql_admin_password)"
  host="${fqdn%%,*}"

  cat > "$PROPS" <<EOF
changelogFile=changelog/db.changelog-master.yaml
url=jdbc:sqlserver://${host}:1433;databaseName=${database};encrypt=true;trustServerCertificate=false
username=${login}
password=${password}
driver=com.microsoft.sqlserver.jdbc.SQLServerDriver
EOF
  chmod 600 "$PROPS"
}

run_liquibase_docker() {
  local fqdn database login password jdbc_url
  fqdn="$(tf_sql_server_fqdn)"
  database="$(tf_sql_database_for_env "$DEPLOY_ENV")"
  login="$(tf_sql_admin_login)"
  password="$(tf_sql_admin_password)"
  jdbc_url="jdbc:sqlserver://${fqdn}:1433;databaseName=${database};encrypt=true;trustServerCertificate=false"

  docker run --rm \
    -v "$ROOT/db:/liquibase/changelog" \
    -w /liquibase/changelog \
    liquibase/liquibase:4.31 \
    --url="$jdbc_url" \
    --username="$login" \
    --password="$password" \
    --changelog-file=changelog/db.changelog-master.yaml \
    "$CMD"
}

run_liquibase_local() {
  if ! command -v liquibase >/dev/null 2>&1; then
    echo "Liquibase CLI not found. Install with: brew install liquibase" >&2
    return 1
  fi

  local lb_version
  lb_version="$(liquibase --version 2>/dev/null | head -1 || true)"
  if [[ -n "$lb_version" ]] && ! echo "$lb_version" | grep -qE '4\.31'; then
    echo "Warning: expected Liquibase 4.31.x (CI/Docker use 4.31). Found: $lb_version" >&2
  fi

  write_liquibase_properties
  (cd "$ROOT/db" && liquibase --defaults-file=liquibase.deploy.properties "$CMD")
}

main() {
  if [[ -z "$DEPLOY_ENV" ]]; then
    usage
  fi
  validate_deploy_env "$DEPLOY_ENV"
  require_terraform_outputs

  local fqdn database
  fqdn="$(tf_sql_server_fqdn)"
  database="$(tf_sql_database_for_env "$DEPLOY_ENV")"

  echo "Running Liquibase ${CMD} on ${database} @ ${fqdn}..."
  echo "If this fails with a firewall error, set sql_allow_current_client_ip = true in portfolio-infra/terraform/terraform.tfvars and re-apply." >&2

  if docker_daemon_ready; then
    echo "Using Liquibase via Docker (liquibase/liquibase:4.31)..."
    run_liquibase_docker
    return
  fi

  if command -v liquibase >/dev/null 2>&1; then
    echo "Docker not available; using local Liquibase CLI..." >&2
    run_liquibase_local
    return
  fi

  echo "No migration runner available." >&2
  echo "  Start Docker, or install Liquibase: brew install liquibase" >&2
  echo "  Or deploy without migrations: npm run deploy -- ${DEPLOY_ENV} --skip-migrate" >&2
  exit 1
}

main "$@"
