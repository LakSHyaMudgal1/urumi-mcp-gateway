param (
    [string]$ClusterType = "none" # "kind", "minikube", "k3d", or "none"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Building Urumi MCP Gateway Platform Images" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "--> [1/5] Building Gateway image: urumi-gateway:latest..." -ForegroundColor Yellow
docker build -f docker/Dockerfile.gateway -t urumi-gateway:latest .

Write-Host "--> [2/5] Building WooCommerce MCP image: urumi-woocommerce-mcp:latest..." -ForegroundColor Yellow
docker build -f docker/Dockerfile.woocommerce-mcp -t urumi-woocommerce-mcp:latest .

Write-Host "--> [3/5] Building Inventory MCP image: urumi-inventory-mcp:latest..." -ForegroundColor Yellow
docker build -f docker/Dockerfile.inventory-mcp -t urumi-inventory-mcp:latest .

Write-Host "--> [4/5] Building Shipping MCP image: urumi-shipping-mcp:latest..." -ForegroundColor Yellow
docker build -f docker/Dockerfile.shipping-mcp -t urumi-shipping-mcp:latest .

Write-Host "--> [5/5] Building Dashboard image: urumi-dashboard:latest..." -ForegroundColor Yellow
docker build -f docker/Dockerfile.dashboard -t urumi-dashboard:latest .

Write-Host "All images built successfully!" -ForegroundColor Green

if ($ClusterType -eq "kind") {
    Write-Host "Loading images into Kind cluster..." -ForegroundColor Cyan
    kind load docker-image urumi-gateway:latest urumi-woocommerce-mcp:latest urumi-inventory-mcp:latest urumi-shipping-mcp:latest urumi-dashboard:latest
} elseif ($ClusterType -eq "minikube") {
    Write-Host "Loading images into Minikube..." -ForegroundColor Cyan
    minikube image load urumi-gateway:latest
    minikube image load urumi-woocommerce-mcp:latest
    minikube image load urumi-inventory-mcp:latest
    minikube image load urumi-shipping-mcp:latest
    minikube image load urumi-dashboard:latest
} elseif ($ClusterType -eq "k3d") {
    Write-Host "Loading images into k3d cluster..." -ForegroundColor Cyan
    k3d image import urumi-gateway:latest urumi-woocommerce-mcp:latest urumi-inventory-mcp:latest urumi-shipping-mcp:latest urumi-dashboard:latest
}

Write-Host "Image build and load complete." -ForegroundColor Green
