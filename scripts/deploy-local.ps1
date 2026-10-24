param (
    [string]$Namespace = "urumi"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Deploying Urumi Platform to Local Kubernetes" -ForegroundColor Cyan
Write-Host " Target Namespace: $Namespace" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Linting Helm chart..." -ForegroundColor Yellow
helm lint "$RepoRoot/infra/helm/urumi-platform" -f "$RepoRoot/infra/helm/urumi-platform/values-local.yaml"

Write-Host "Installing or upgrading Helm release..." -ForegroundColor Yellow
helm upgrade --install urumi-platform "$RepoRoot/infra/helm/urumi-platform" `
  -f "$RepoRoot/infra/helm/urumi-platform/values-local.yaml" `
  --create-namespace `
  --namespace $Namespace `
  --wait `
  --timeout 10m

Write-Host "Deployment complete! Checking status..." -ForegroundColor Green
kubectl get pods,svc,pvc,ingress -n $Namespace
