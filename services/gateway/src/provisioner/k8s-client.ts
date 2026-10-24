import { KubernetesResource } from './types.js';

export interface IKubernetesClient {
  applyManifest(manifest: KubernetesResource): Promise<void>;
  deleteNamespace(namespace: string): Promise<void>;
  getNamespace(namespace: string): Promise<KubernetesResource | null>;
  listNamespaceResources(namespace: string): Promise<KubernetesResource[]>;
  waitForDeploymentReady(namespace: string, name: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean>;
  canCommunicate(fromNamespace: string, fromPodComponent: string, toNamespace: string, toPodComponent: string, port: number): boolean;
}

export class InMemoryKubernetesClient implements IKubernetesClient {
  private namespaces: Map<string, KubernetesResource> = new Map();
  private resources: Map<string, Map<string, KubernetesResource>> = new Map();
  private networkPolicies: Map<string, KubernetesResource[]> = new Map();
  public readinessDelayMs: number = 20;
  public simulateFailureForSlug?: string;

  async applyManifest(manifest: KubernetesResource): Promise<void> {
    const kind = manifest.kind;
    const name = manifest.metadata.name;
    const ns = manifest.metadata.namespace || 'default';

    if (kind === 'Namespace') {
      this.namespaces.set(name, manifest);
      if (!this.resources.has(name)) {
        this.resources.set(name, new Map());
      }
      return;
    }

    if (!this.resources.has(ns)) {
      this.resources.set(ns, new Map());
    }

    const key = `${kind}/${name}`;
    this.resources.get(ns)!.set(key, manifest);

    if (kind === 'NetworkPolicy') {
      const list = this.networkPolicies.get(ns) || [];
      list.push(manifest);
      this.networkPolicies.set(ns, list);
    }
  }

  async deleteNamespace(namespace: string): Promise<void> {
    this.namespaces.delete(namespace);
    this.resources.delete(namespace);
    this.networkPolicies.delete(namespace);
  }

  async getNamespace(namespace: string): Promise<KubernetesResource | null> {
    return this.namespaces.get(namespace) || null;
  }

  async listNamespaceResources(namespace: string): Promise<KubernetesResource[]> {
    const map = this.resources.get(namespace);
    if (!map) return [];
    return Array.from(map.values());
  }

  async waitForDeploymentReady(
    namespace: string,
    name: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    if (this.simulateFailureForSlug && namespace.includes(this.simulateFailureForSlug)) {
      throw new Error(`Simulated deployment failure for namespace '${namespace}': Pod CrashLoopBackOff`);
    }

    if (this.readinessDelayMs > 0) {
      await new Promise(r => setTimeout(r, Math.min(this.readinessDelayMs, timeoutMs)));
    }

    if (signal?.aborted) {
      throw new Error('Deployment readiness check aborted by signal');
    }

    const map = this.resources.get(namespace);
    const key = `Deployment/${name}`;
    return Boolean(map && map.has(key));
  }

  /**
   * Evaluates NetworkPolicy ingress isolation between namespaces and components
   */
  canCommunicate(
    fromNamespace: string,
    fromPodComponent: string,
    toNamespace: string,
    toPodComponent: string,
    port: number
  ): boolean {
    // If target namespace does not exist, communication fails
    if (!this.namespaces.has(toNamespace)) return false;

    // Check if target namespace has isolation network policies
    const policies = this.networkPolicies.get(toNamespace) || [];
    if (policies.length === 0) return true; // Default allow if no policies

    // Zero-Trust Isolation Check:
    // Inter-namespace communication is BLOCKED by default unless explicitly allowed
    if (fromNamespace !== toNamespace) {
      // Only the gateway namespace is allowed to reach WooCommerce MCP on port 4001
      if (toPodComponent === 'store-woocommerce-mcp' && port === 4001 && fromPodComponent === 'gateway') {
        return true;
      }
      // Ingress controller can reach WordPress on port 80
      if (toPodComponent === 'store-wordpress' && port === 80 && fromNamespace === 'ingress-nginx') {
        return true;
      }
      // All other cross-namespace traffic is strictly forbidden
      return false;
    }

    // Intra-namespace rules:
    // WooCommerce MCP can reach WordPress on port 80
    if (fromPodComponent === 'store-woocommerce-mcp' && toPodComponent === 'store-wordpress' && port === 80) {
      return true;
    }
    // WordPress can reach MariaDB on port 3306
    if (fromPodComponent === 'store-wordpress' && toPodComponent === 'store-mariadb' && port === 3306) {
      return true;
    }
    // Direct MCP to MariaDB is blocked (must go through WordPress REST API)
    if (fromPodComponent === 'store-woocommerce-mcp' && toPodComponent === 'store-mariadb') {
      return false;
    }

    return false;
  }
}
