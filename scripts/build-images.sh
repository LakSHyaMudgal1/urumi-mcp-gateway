#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo " Building Urumi MCP Gateway Platform Images"
echo "=========================================="

# Repository root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "--> [1/5] Building Gateway image: urumi-gateway:latest..."
docker build -f docker/Dockerfile.gateway -t urumi-gateway:latest .

echo "--> [2/5] Building WooCommerce MCP image: urumi-woocommerce-mcp:latest..."
docker build -f docker/Dockerfile.woocommerce-mcp -t urumi-woocommerce-mcp:latest .

echo "--> [3/5] Building Inventory MCP image: urumi-inventory-mcp:latest..."
docker build -f docker/Dockerfile.inventory-mcp -t urumi-inventory-mcp:latest .

echo "--> [4/5] Building Shipping MCP image: urumi-shipping-mcp:latest..."
docker build -f docker/Dockerfile.shipping-mcp -t urumi-shipping-mcp:latest .

echo "--> [5/5] Building Dashboard image: urumi-dashboard:latest..."
docker build -f docker/Dockerfile.dashboard -t urumi-dashboard:latest .

echo "All images built successfully!"

# Optional cluster image load
CLUSTER_TYPE="${1:-none}"
if [ "${CLUSTER_TYPE}" == "kind" ]; then
  echo "Loading images into Kind cluster..."
  kind load docker-image urumi-gateway:latest urumi-woocommerce-mcp:latest urumi-inventory-mcp:latest urumi-shipping-mcp:latest urumi-dashboard:latest
elif [ "${CLUSTER_TYPE}" == "minikube" ]; then
  echo "Loading images into Minikube..."
  minikube image load urumi-gateway:latest
  minikube image load urumi-woocommerce-mcp:latest
  minikube image load urumi-inventory-mcp:latest
  minikube image load urumi-shipping-mcp:latest
  minikube image load urumi-dashboard:latest
elif [ "${CLUSTER_TYPE}" == "k3d" ]; then
  echo "Loading images into k3d cluster..."
  k3d image import urumi-gateway:latest urumi-woocommerce-mcp:latest urumi-inventory-mcp:latest urumi-shipping-mcp:latest urumi-dashboard:latest
fi

echo "Image build and load complete."
