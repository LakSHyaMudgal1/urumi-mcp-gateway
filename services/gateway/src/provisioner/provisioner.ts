import { Store, StoreStatus } from '@urumi/shared';
import { StoreRepository, UpstreamRepository } from '../db/repositories.js';
import { UpstreamManager } from '../mcp/upstreamManager.js';
import { IKubernetesClient, InMemoryKubernetesClient } from './k8s-client.js';
import { generateStoreManifests } from './manifests.js';
import { IStoreProvisioner, ProvisionResult, DeprovisionResult, KubernetesResource } from './types.js';

export interface StoreProvisionerOptions {
  maxConcurrent?: number;
  defaultTimeoutMs?: number;
  maxStoresPerUser?: number;
  ingressDomain?: string;
  gatewayNamespace?: string;
}

export class StoreProvisioner implements IStoreProvisioner {
  private activeOperations: Map<string, Promise<ProvisionResult>> = new Map();
  public k8sClient: IKubernetesClient;
  public maxStoresPerUser: number;
  public defaultTimeoutMs: number;
  private ingressDomain: string;
  private gatewayNamespace: string;

  constructor(
    private storeRepo: StoreRepository,
    private upstreamRepo: UpstreamRepository,
    private upstreamManager: UpstreamManager,
    k8sClient?: IKubernetesClient,
    options?: StoreProvisionerOptions
  ) {
    this.k8sClient = k8sClient || new InMemoryKubernetesClient();
    this.maxStoresPerUser = options?.maxStoresPerUser ?? 3;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 300000; // 5 minutes
    this.ingressDomain = options?.ingressDomain ?? 'store.local.test';
    this.gatewayNamespace = options?.gatewayNamespace ?? 'default';
  }

  async checkQuota(userId: string, role: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const current = await this.storeRepo.countByOwner(userId, true);
    const max = role === 'admin' ? 50 : this.maxStoresPerUser;
    return {
      allowed: current < max,
      current,
      max
    };
  }

  async provision(store: Store, signal?: AbortSignal): Promise<ProvisionResult> {
    // If an operation is already in flight for this store, join it (idempotency)
    const existing = this.activeOperations.get(store.id);
    if (existing) {
      return existing;
    }

    const opPromise = this.executeProvisioning(store, signal).finally(() => {
      this.activeOperations.delete(store.id);
    });

    this.activeOperations.set(store.id, opPromise);
    return opPromise;
  }

  private async executeProvisioning(store: Store, signal?: AbortSignal): Promise<ProvisionResult> {
    try {
      // 1. Deadline / Timeout Check
      if (store.timeoutAt && new Date(store.timeoutAt).getTime() < Date.now()) {
        const error = `Provisioning deadline exceeded for store '${store.slug}'`;
        await this.handlePartialFailure(store, error);
        return { success: false, error };
      }

      // 2. Generate Kubernetes manifests
      const manifests = generateStoreManifests(store, {
        ingressDomain: this.ingressDomain,
        gatewayNamespace: this.gatewayNamespace
      });

      // 3. Apply Namespace and Isolation Policies
      await this.k8sClient.applyManifest(manifests.namespace);
      await this.k8sClient.applyManifest(manifests.serviceAccount);
      await this.k8sClient.applyManifest(manifests.resourceQuota);
      await this.k8sClient.applyManifest(manifests.limitRange);

      for (const np of manifests.networkPolicies) {
        await this.k8sClient.applyManifest(np);
      }

      // 4. Apply Secrets and PVCs
      for (const secret of manifests.secrets) {
        await this.k8sClient.applyManifest(secret);
      }
      for (const pvc of manifests.pvcs) {
        await this.k8sClient.applyManifest(pvc);
      }

      // 5. Apply Workloads and Services
      for (const deployment of manifests.deployments) {
        await this.k8sClient.applyManifest(deployment);
      }
      for (const service of manifests.services) {
        await this.k8sClient.applyManifest(service);
      }
      await this.k8sClient.applyManifest(manifests.ingress);

      // 6. Wait for deployments to become healthy
      const timeoutMs = 60000;
      await this.k8sClient.waitForDeploymentReady(store.namespace, 'store-mariadb', timeoutMs, signal);
      await this.k8sClient.waitForDeploymentReady(store.namespace, 'store-wordpress', timeoutMs, signal);
      await this.k8sClient.waitForDeploymentReady(store.namespace, 'store-woocommerce-mcp', timeoutMs, signal);

      // 7. Auto-register dedicated WooCommerce MCP server in Gateway
      const existingUpstream = await this.upstreamRepo.findBySlug(store.upstreamSlug);
      if (!existingUpstream) {
        await this.upstreamRepo.create({
          name: `${store.name} (WooCommerce MCP)`,
          slug: store.upstreamSlug,
          url: store.mcpServerUrl,
          enabled: true,
          timeoutMs: 15000
        });
      } else if (!existingUpstream.enabled) {
        await this.upstreamRepo.update(existingUpstream.id, { enabled: true });
      }

      // Refresh gateway upstream manager cache so tools are immediately available
      try {
        this.upstreamManager.invalidateCache();
        await this.upstreamManager.getAggregatedTools(true);
      } catch {
        // Upstream tool discovery non-blocking
      }

      // 8. Update Store status to Ready
      await this.storeRepo.updateStatus(store.id, 'ready', null);

      return {
        success: true,
        mcpServerUrl: store.mcpServerUrl
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Unknown provisioning error';
      await this.handlePartialFailure(store, errorMsg);
      return {
        success: false,
        error: errorMsg
      };
    }
  }

  private async handlePartialFailure(store: Store, reason: string): Promise<void> {
    try {
      // Cleanup partially created Kubernetes namespace
      await this.k8sClient.deleteNamespace(store.namespace);
    } catch {
      // Ignore cleanup error
    }

    try {
      // Remove any partial upstream registration
      const upstream = await this.upstreamRepo.findBySlug(store.upstreamSlug);
      if (upstream) {
        await this.upstreamRepo.delete(upstream.id);
        this.upstreamManager.invalidateCache();
        await this.upstreamManager.getAggregatedTools(true).catch(() => {});
      }
    } catch {
      // Ignore upstream deregistration error
    }

    // Set terminal failed status with reason
    await this.storeRepo.updateStatus(store.id, 'failed', reason);
  }

  async deprovision(store: Store): Promise<DeprovisionResult> {
    try {
      // 1. Mark status as deleting
      await this.storeRepo.updateStatus(store.id, 'deleting', null);

      // 2. Deregister MCP upstream from Gateway (tools immediately disappear from clients & chat)
      const upstream = await this.upstreamRepo.findBySlug(store.upstreamSlug);
      if (upstream) {
        await this.upstreamRepo.delete(upstream.id);
        try {
          this.upstreamManager.invalidateCache();
          await this.upstreamManager.getAggregatedTools(true);
        } catch {
          // Non-blocking
        }
      }

      // 3. Delete Kubernetes namespace, purging all pods, services, secrets, and PVCs per data retention policy
      await this.k8sClient.deleteNamespace(store.namespace);

      // 4. Remove store record from database
      await this.storeRepo.delete(store.id);

      return { success: true };
    } catch (err: any) {
      const error = err?.message || 'Unknown deprovisioning error';
      await this.storeRepo.updateStatus(store.id, 'failed', `Deprovisioning failed: ${error}`);
      return { success: false, error };
    }
  }

  async getNamespaceResources(namespace: string): Promise<KubernetesResource[]> {
    return this.k8sClient.listNamespaceResources(namespace);
  }

  async isNamespaceReady(namespace: string): Promise<boolean> {
    const ns = await this.k8sClient.getNamespace(namespace);
    if (!ns) return false;
    const resources = await this.k8sClient.listNamespaceResources(namespace);
    const hasWp = resources.some(r => r.kind === 'Deployment' && r.metadata.name === 'store-wordpress');
    const hasMcp = resources.some(r => r.kind === 'Deployment' && r.metadata.name === 'store-woocommerce-mcp');
    return hasWp && hasMcp;
  }

  /**
   * Safe recovery from restarts: recovers or cleans up interrupted provisioning/deleting operations
   */
  async recoverPendingStores(): Promise<void> {
    const pending = await this.storeRepo.findPending();
    for (const store of pending) {
      if (store.status === 'deleting') {
        await this.deprovision(store);
      } else if (store.status === 'provisioning') {
        const isExpired = store.timeoutAt && new Date(store.timeoutAt).getTime() < Date.now();
        if (isExpired) {
          await this.handlePartialFailure(store, 'Provisioning timed out across restart');
        } else {
          // Resume provisioning asynchronously
          this.provision(store).catch(() => {});
        }
      }
    }
  }
}
