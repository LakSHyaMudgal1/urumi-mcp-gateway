# Security & Threat Model

## 1. Upstream Credential Confidentiality
- **Threat**: Malicious clients or eavesdroppers extracting WooCommerce API keys or upstream auth tokens.
- **Mitigation**: Upstream credentials (`authToken`, WooCommerce Consumer Key/Secret) are stored securely in database/Kubernetes Secrets and injected strictly server-side by the Gateway client manager. The browser and external MCP clients never receive or forward upstream credentials. The Gateway REST API redacts `authToken` from JSON responses.

## 2. API Key Security & Immediate Revocation
- **Threat**: Stolen or compromised API keys used to access internal tools indefinitely; timing attacks during key verification.
- **Mitigation**:
  - Keys are generated with 256 bits of cryptographic entropy prefixed with `mcp_live_<prefix>_<secret>`.
  - The database stores only `key_prefix` (first 8 hex characters for admin identification) and a SHA-256 `key_hash`.
  - Raw keys are returned exactly once upon creation.
  - Revocation sets `revoked_at = CURRENT_TIMESTAMP`. Every MCP and API request queries the key's revocation status on the next request, guaranteeing zero-latency revocation without relying on stale tokens.
  - Constant-time comparison (`crypto.timingSafeEqual`) is used for hash comparisons.

## 3. Server-Side Request Forgery (SSRF) Protection
- **Threat**: Admin or attacker configuring malicious upstream URLs targeting internal cloud metadata (`169.254.169.254`), host loopback (`127.0.0.1`), or unauthorized internal infrastructure.
- **Mitigation Policy**:
  - **Forbidden Schemes**: Only `http:` and `https:` are permitted. Schemes like `file:`, `gopher:`, `ftp:`, `data:` are blocked.
  - **No Userinfo**: URLs with embedded credentials (`http://user:pass@host/`) are rejected.
  - **Restricted Hostnames & IPs**:
    - Loopback addresses (`127.0.0.0/8`, `localhost`, `::1`, `0.0.0.0`) are forbidden.
    - Link-local and cloud metadata IPs (`169.254.0.0/16`, `169.254.169.254`, `metadata.google.internal`) are forbidden.
    - Private network IP literals (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked unless resolved via permitted Kubernetes DNS.
  - **Permitted In-Cluster DNS**:
    - Pre-configured cluster service names (`woocommerce-mcp`, `inventory-mcp`, `shipping-mcp`).
    - Standard Kubernetes internal service DNS (`*.svc.cluster.local`, `*.svc`).
  - **Redirect Protection**: All redirects during upstream HTTP requests are subjected to the same SSRF validation policy to prevent redirect-based filter evasion.

## 4. Untrusted Content & Prompt Injection
- **Threat**: Malicious responses from compromised upstream tools attempting to hijack LLM instructions.
- **Mitigation**:
  - Tool outputs and descriptions are treated as untrusted data.
  - The Chat Agent encapsulates tool responses in structured delimiters and warns the LLM system prompt against executing instructions inside tool outputs.
  - All input parameters are validated against strict Zod schemas before being dispatched to upstreams.

## 5. Audit Log Hygiene & Data Leakage
- **Threat**: Sensitive customer data, passwords, or credit card numbers leaking into audit logs.
- **Mitigation**:
  - A recursive sanitizer redacts known sensitive fields (`password`, `token`, `secret`, `authorization`, `card`, `cvv`) before writing audit records to the database.
