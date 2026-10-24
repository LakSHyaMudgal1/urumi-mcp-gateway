param (
    [string]$Namespace = "urumi"
)

$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Urumi Platform Cluster Status" -ForegroundColor Cyan
Write-Host " Namespace: $Namespace" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

Write-Host "`n--> [1] Pods Status & Health Probes:" -ForegroundColor Yellow
kubectl get pods -n $Namespace -o wide

Write-Host "`n--> [2] PersistentVolumeClaims (PVCs):" -ForegroundColor Yellow
kubectl get pvc -n $Namespace

Write-Host "`n--> [3] Services (ClusterIP & Ingress Endpoints):" -ForegroundColor Yellow
kubectl get svc -n $Namespace

Write-Host "`n--> [4] Ingress Routes:" -ForegroundColor Yellow
kubectl get ingress -n $Namespace

Write-Host "`n--> [5] Bootstrap Job Status:" -ForegroundColor Yellow
kubectl get jobs -n $Namespace
