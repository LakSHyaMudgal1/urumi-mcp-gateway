import { Store } from '@urumi/shared';

export interface KubernetesResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, any>;
  stringData?: Record<string, any>;
  data?: Record<string, any>;
  type?: string;
  [key: string]: any;
}

export interface StoreManifests {
  namespace: KubernetesResource;
  serviceAccount: KubernetesResource;
  resourceQuota: KubernetesResource;
  limitRange: KubernetesResource;
  networkPolicies: KubernetesResource[];
  secrets: KubernetesResource[];
  pvcs: KubernetesResource[];
  deployments: KubernetesResource[];
  services: KubernetesResource[];
  ingress: KubernetesResource;
}

export interface ProvisionResult {
  success: boolean;
  error?: string;
  mcpServerUrl?: string;
}

export interface DeprovisionResult {
  success: boolean;
  error?: string;
}

export interface IStoreProvisioner {
  provision(store: Store, signal?: AbortSignal): Promise<ProvisionResult>;
  deprovision(store: Store): Promise<DeprovisionResult>;
  getNamespaceResources(namespace: string): Promise<KubernetesResource[]>;
  isNamespaceReady(namespace: string): Promise<boolean>;
}
