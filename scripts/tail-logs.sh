#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-gateway}"
NAMESPACE="${2:-urumi}"

echo "Tailing logs for component: ${TARGET} in namespace: ${NAMESPACE}..."
kubectl logs -n "${NAMESPACE}" -l "app=${TARGET}" -f --tail=100 --max-log-requests=10
