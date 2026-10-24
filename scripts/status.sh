#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:-urumi}"

echo "=========================================="
echo " Urumi Platform Cluster Status"
echo " Namespace: ${NAMESPACE}"
echo "=========================================="

echo "--> [1] Pods Status & Health Probes:"
kubectl get pods -n "${NAMESPACE}" -o wide

echo ""
echo "--> [2] PersistentVolumeClaims (PVCs):"
kubectl get pvc -n "${NAMESPACE}"

echo ""
echo "--> [3] Services (ClusterIP & Ingress Endpoints):"
kubectl get svc -n "${NAMESPACE}"

echo ""
echo "--> [4] Ingress Routes:"
kubectl get ingress -n "${NAMESPACE}"

echo ""
echo "--> [5] Bootstrap Job Status:"
kubectl get jobs -n "${NAMESPACE}"
