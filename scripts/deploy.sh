#!/usr/bin/env bash
# Deploy portfolio-api to Azure Function App (dev or prod).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/terraform-outputs.sh
source "$ROOT/scripts/lib/terraform-outputs.sh"

DEPLOY_ENV=""
SKIP_MIGRATE=false
SKIP_BUILD=false

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh <dev|prod> [--skip-migrate] [--skip-build]

Deploy the API to Azure (zip deploy, same as CI).

Examples:
  npm run deploy:dev
  npm run deploy:prod
  npm run deploy -- dev --skip-migrate

Prerequisites:
  az login, terraform outputs (portfolio-infra applied), Node 20+, zip
  For migrations: Docker (liquibase/liquibase:4.31) or local Liquibase CLI (brew install liquibase)
EOF
  exit 1
}

confirm_prod_deploy() {
  local confirm=""
  read -r -p "Type 'prod' to deploy to production: " confirm
  if [[ "$confirm" != "prod" ]]; then
    echo "Aborted: production deploy not confirmed." >&2
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      dev|prod)
        DEPLOY_ENV="$1"
        shift
        ;;
      --skip-migrate) SKIP_MIGRATE=true; shift ;;
      --skip-build) SKIP_BUILD=true; shift ;;
      -h|--help) usage ;;
      *)
        echo "Unknown argument: $1" >&2
        usage
        ;;
    esac
  done
  if [[ -z "$DEPLOY_ENV" ]]; then
    echo "Environment required: dev or prod" >&2
    usage
  fi
}

require_az_cli() {
  if ! command -v az >/dev/null 2>&1; then
    echo "Azure CLI (az) is required. Install and run: az login" >&2
    exit 1
  fi
  if ! az account show >/dev/null 2>&1; then
    echo "Not logged in to Azure. Run: az login" >&2
    exit 1
  fi
}

require_zip() {
  if ! command -v zip >/dev/null 2>&1; then
    echo "zip is required on PATH." >&2
    exit 1
  fi
}

build_dependencies() {
  echo "Building portfolio-contracts..."
  (cd "$ROOT/../portfolio-contracts" && npm ci && npm run build)
  echo "Building portfolio-tax-engine..."
  (cd "$ROOT/../portfolio-tax-engine" && npm ci && npm run build)
  echo "Building portfolio-api..."
  (cd "$ROOT" && npm ci && npm run build)
}

run_liquibase_migrate() {
  bash "$ROOT/scripts/db-migrate-terraform.sh" "$DEPLOY_ENV" update
}

deploy_function_app() {
  local rg app_name app_url zip_path
  rg="$(tf_resource_group_name)"
  app_name="$(tf_function_app_name "$DEPLOY_ENV")"
  app_url="$(tf_function_app_url "$DEPLOY_ENV")"
  zip_path="$ROOT/api.zip"

  # Azure requires host.json at zip root; package.json main points at dist/src/index.js.
  rm -f "$zip_path"
  (cd "$ROOT" && zip -rq "$zip_path" host.json package.json dist node_modules \
    -x "node_modules/azure-functions-core-tools/*" \
    -x "node_modules/azurite/*" \
    -x "node_modules/@types/*" \
    -x "node_modules/typescript/*" \
    -x "node_modules/vitest/*")

  echo "Deploying to Function App: ${app_name} (${DEPLOY_ENV})..."
  az functionapp deployment source config-zip \
    -g "$rg" \
    -n "$app_name" \
    --src "$zip_path"

  rm -f "$zip_path"
  echo ""
  echo "Deploy complete."
  echo "  Health: ${app_url}/api/health"
}

main() {
  parse_args "$@"

  if [[ "$DEPLOY_ENV" == "prod" ]]; then
    confirm_prod_deploy
  fi

  require_az_cli
  require_zip
  require_terraform_outputs

  if [[ "$SKIP_BUILD" != true ]]; then
    build_dependencies
  elif [[ ! -d "$ROOT/dist" ]]; then
    echo "dist/ not found. Run without --skip-build or npm run build first." >&2
    exit 1
  fi

  if [[ "$SKIP_MIGRATE" != true ]]; then
    run_liquibase_migrate
  fi

  deploy_function_app
}

main "$@"
