#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-urumi}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=========================================="
echo " Deploying Urumi Platform to Local Kubernetes"
echo " Target Namespace: ${NAMESPACE}"
echo "=========================================="

# Ensure Helm chart dependencies/syntax are valid
helm lint "${REPO_ROOT}/infra/helm/urumi-platform" -f "${REPO_ROOT}/infra/helm/urumi-platform/values-local.yaml"

# Deploy/Upgrade release
helm upgrade --install urumi-platform "${REPO_ROOT}/infra/helm/urumi-platform" \
  -f "${REPO_ROOT}/infra/helm/urumi-platform/values-local.yaml" \
  --create-namespace \
  --namespace "${NAMESPACE}" \
  --wait \
  --timeout 10m

echo "Deployment complete! Checking status..."
kubectl get pods,svc,pvc,ingress -n "${NAMESPACE}"
