# Production Deployment on k3s / Cloud Kubernetes

This document explains how to deploy the Urumi MCP Gateway platform to a production-grade k3s VPS or managed Kubernetes cluster using the unified Helm chart.

## Key Differences: Local vs. Production

| Feature | Local (`values-local.yaml`) | Production (`values-prod.yaml`) |
| :--- | :--- | :--- |
| **Cluster Target** | Kind, k3d, Minikube | k3s VPS, EKS, GKE, Civo |
| **Ingress Controller** | `nginx` | `traefik` (k3s native) or cloud ingress |
| **TLS Certificates** | Disabled (plain HTTP) | Enabled via `cert-manager` (Let's Encrypt automated ACME) |
| **Domains** | `store.local.test`, `gateway.local.test` | Fully qualified domains (`store.yourdomain.com`, etc.) |
| **Storage Class** | `standard` (hostPath) | `local-path` (k3s persistent storage) or cloud CSI (e.g. `gp3`) |
| **Replica Count** | 1 (single pod per service) | 2+ (High Availability with rolling updates) |
| **WooCommerce Fallback** | `mockFallback: true` | `mockFallback: false` (strictly requires live store API) |
| **Secrets Management** | In-values local defaults | ExternalSecrets, SealedSecrets, or Helm `--set` injection |

---

## Production Prerequisites
1. **k3s Cluster**: A running k3s instance or VPS.
2. **DNS Records**: A/CNAME records pointing your domains to your cluster's external IP:
   - `store.yourdomain.com` -> `<CLUSTER_IP>`
   - `gateway.yourdomain.com` -> `<CLUSTER_IP>`
3. **Cert-Manager**: Installed for automated SSL/TLS provisioning.
   ```bash
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.2/cert-manager.yaml
   ```
4. **ClusterIssuer**: Create a Let's Encrypt production ClusterIssuer:
   ```yaml
   apiVersion: cert-manager.io/v1
   kind: ClusterIssuer
   metadata:
     name: letsencrypt-prod
   spec:
     acme:
       server: https://acme-v02.api.letsencrypt.org/directory
       email: devops@yourdomain.com
       privateKeySecretRef:
         name: letsencrypt-prod-account-key
       solvers:
         - http01:
             ingress:
               class: traefik
   ```

---

## Deployment Steps

### 1. Configure Domains
Edit `infra/helm/urumi-platform/values-prod.yaml` and set your actual domain names:
```yaml
domains:
  storefront: store.yourdomain.com
  dashboard: gateway.yourdomain.com
```

### 2. Inject Production Secrets Securely
Do not commit actual production secrets to source control. Inject them at deployment time using `--set` or an ignored secret values file:

```bash
helm upgrade --install urumi-platform ./infra/helm/urumi-platform \
  -f ./infra/helm/urumi-platform/values-prod.yaml \
  --set secrets.mariadbRootPassword="$(openssl rand -base64 24)" \
  --set secrets.mariadbUserPassword="$(openssl rand -base64 24)" \
  --set secrets.postgresPassword="$(openssl rand -base64 24)" \
  --set secrets.wordpressAdminPassword="$(openssl rand -base64 24)" \
  --set secrets.woocommerceConsumerKey="ck_$(openssl rand -hex 24)" \
  --set secrets.woocommerceConsumerSecret="cs_$(openssl rand -hex 24)" \
  --set secrets.jwtSecret="$(openssl rand -base64 32)" \
  --set secrets.initialAdminPassword="YourStrongAdminPassword2026!" \
  --set secrets.initialAdminEmail="admin@yourdomain.com" \
  --create-namespace \
  --namespace urumi \
  --wait \
  --timeout 12m
```

### 3. Verify Pod Readiness & TLS
```bash
kubectl get pods,ingress,pvc -n urumi
kubectl get certificate -n urumi
```
Once the certificates show `READY: True`, the storefront is live at `https://store.yourdomain.com` and the dashboard & gateway are live at `https://gateway.yourdomain.com`.
