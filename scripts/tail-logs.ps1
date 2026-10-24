param (
    [string]$Target = "gateway",
    [string]$Namespace = "urumi"
)

Write-Host "Tailing logs for component: $Target in namespace: $Namespace..." -ForegroundColor Cyan
kubectl logs -n $Namespace -l "app=$Target" -f --tail=100 --max-log-requests=10
