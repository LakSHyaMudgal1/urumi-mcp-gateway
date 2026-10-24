import { URL } from 'node:url';
import net from 'node:net';

export interface SSRFPolicyConfig {
  allowedProtocols?: string[];
  allowedClusterHostnames?: string[];
  allowClusterLocalDNS?: boolean;
  allowedExternalHosts?: string[];
  allowPublicIPs?: boolean;
}

export const DEFAULT_SSRF_CONFIG: SSRFPolicyConfig = {
  allowedProtocols: ['http:', 'https:'],
  allowedClusterHostnames: [
    'woocommerce-mcp',
    'inventory-mcp',
    'shipping-mcp',
    'woocommerce',
    'wordpress',
    'localhost.test' // For deterministic test fixtures if needed
  ],
  allowClusterLocalDNS: true,
  allowPublicIPs: true
};

export class SSRFValidationError extends Error {
  constructor(message: string) {
    super(`SSRF Protection: ${message}`);
    this.name = 'SSRFValidationError';
  }
}

/**
 * Checks if an IPv4 address belongs to a private, loopback, or link-local range.
 */
function isRestrictedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;

  // 0.0.0.0/8 (Current network)
  if (parts[0] === 0) return true;

  // 169.254.0.0/16 (Link-local / Cloud metadata e.g. 169.254.169.254)
  if (parts[0] === 169 && parts[1] === 254) return true;

  // 10.0.0.0/8 (Private)
  if (parts[0] === 10) return true;

  // 172.16.0.0/12 (Private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16 (Private)
  if (parts[0] === 192 && parts[1] === 168) return true;

  // 100.64.0.0/10 (Carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;

  return false;
}

/**
 * Checks if an IPv6 address is loopback, unique local, or link-local.
 */
function isRestrictedIPv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase();
  if (cleanIp === '::1' || cleanIp === '::') return true;
  if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:')) return true;
  return false;
}

/**
 * Validates an admin-supplied upstream URL against SSRF vulnerabilities while
 * permitting legitimate Kubernetes internal service discovery.
 */
export function validateUpstreamUrl(
  rawUrl: string,
  config: SSRFPolicyConfig = DEFAULT_SSRF_CONFIG
): { valid: boolean; url: URL; reason?: string } {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, url: null as unknown as URL, reason: 'Invalid URL format' };
  }

  // 1. Enforce allowed schemes
  const allowedProtocols = config.allowedProtocols ?? ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    return { valid: false, url: parsed, reason: `Protocol ${parsed.protocol} is forbidden` };
  }

  // 2. Reject credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, url: parsed, reason: 'Userinfo credentials in URL are prohibited' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 3. Reject known dangerous cloud metadata domains and loopback aliases
  const dangerousNames = [
    'localhost',
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
    '169.254.169.254'
  ];

  if (dangerousNames.includes(hostname) || hostname.endsWith('.localhost')) {
    return { valid: false, url: parsed, reason: `Host ${hostname} is restricted` };
  }

  // 4. In-cluster service checks
  // Allow configured cluster service names (e.g., 'woocommerce-mcp', 'inventory-mcp')
  const allowedCluster = config.allowedClusterHostnames ?? [];
  if (allowedCluster.includes(hostname)) {
    return { valid: true, url: parsed };
  }

  // Allow standard Kubernetes cluster DNS (e.g. *.svc.cluster.local, *.default.svc)
  if (config.allowClusterLocalDNS) {
    if (
      hostname.endsWith('.svc.cluster.local') ||
      hostname.endsWith('.svc') ||
      hostname.endsWith('.cluster.local')
    ) {
      return { valid: true, url: parsed };
    }
  }

  // 5. IP Address validation
  const isIP = net.isIP(hostname);
  if (isIP === 4) {
    if (isRestrictedIPv4(hostname)) {
      return { valid: false, url: parsed, reason: `Private/Loopback/Metadata IPv4 address ${hostname} is prohibited` };
    }
    return { valid: true, url: parsed };
  } else if (isIP === 6) {
    if (isRestrictedIPv6(hostname)) {
      return { valid: false, url: parsed, reason: `Private/Loopback IPv6 address ${hostname} is prohibited` };
    }
    return { valid: true, url: parsed };
  }

  // 6. External domain names
  // Must have a valid TLD or be in allowed external hosts
  if (hostname.includes('.')) {
    return { valid: true, url: parsed };
  }

  return { valid: false, url: parsed, reason: `Unrecognized or isolated hostname ${hostname}` };
}
