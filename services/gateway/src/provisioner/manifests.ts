import crypto from 'node:crypto';
import { Store } from '@urumi/shared';
import { StoreManifests } from './types.js';

export function generateStoreManifests(store: Store, options?: {
  ingressDomain?: string;
  gatewayNamespace?: string;
  storageClass?: string;
  imagePullPolicy?: string;
}): StoreManifests {
  const slug = store.slug;
  const ns = store.namespace; // e.g. "store-alpha"
  const domain = options?.ingressDomain || 'store.local.test';
  const ingressHost = `${slug}.${domain}`;
  const gatewayNs = options?.gatewayNamespace || 'default';
  const pullPolicy = options?.imagePullPolicy || 'IfNotPresent';

  // Secure random credentials generated per store
  const dbRootPassword = crypto.randomBytes(16).toString('hex');
  const dbPassword = crypto.randomBytes(16).toString('hex');
  const wpAdminPassword = crypto.randomBytes(16).toString('hex');
  const consumerKey = `ck_${crypto.randomBytes(16).toString('hex')}`;
  const consumerSecret = `cs_${crypto.randomBytes(16).toString('hex')}`;

  const labels = {
    'app.kubernetes.io/name': 'urumi-store',
    'app.kubernetes.io/part-of': 'urumi-multi-store',
    'app.kubernetes.io/instance': slug,
    'store.urumi.io/slug': slug
  };

  // 1. Isolated Store Namespace
  const namespace = {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: ns,
      labels: {
        ...labels,
        'urumi.io/store-isolated': 'true'
      }
    }
  };

  // 2. Least-Privilege Service Account
  const serviceAccount = {
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: 'store-sa',
      namespace: ns,
      labels
    },
    automountServiceAccountToken: false
  };

  // 3. ResourceQuota per Store
  const resourceQuota = {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      name: `${slug}-quota`,
      namespace: ns,
      labels
    },
    spec: {
      hard: {
        'requests.cpu': '500m',
        'limits.cpu': '1500m',
        'requests.memory': '1Gi',
        'limits.memory': '2Gi',
        'persistentvolumeclaims': '2',
        'pods': '6'
      }
    }
  };

  // 4. LimitRange per Store
  const limitRange = {
    apiVersion: 'v1',
    kind: 'LimitRange',
    metadata: {
      name: `${slug}-limits`,
      namespace: ns,
      labels
    },
    spec: {
      limits: [
        {
          type: 'Container',
          default: {
            cpu: '500m',
            memory: '512Mi'
          },
          defaultRequest: {
            cpu: '50m',
            memory: '128Mi'
          }
        }
      ]
    }
  };

  // 5. Network Policies enforcing zero-trust namespace isolation
  const networkPolicies = [
    // Policy A: Default Deny all Ingress in Store Namespace
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'default-deny-ingress',
        namespace: ns,
        labels
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress']
      }
    },
    // Policy B: Ingress Controller -> Store WordPress
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-ingress-to-wordpress',
        namespace: ns,
        labels
      },
      spec: {
        podSelector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-wordpress' }
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { 'kubernetes.io/metadata.name': 'ingress-nginx' }
                }
              }
            ],
            ports: [{ protocol: 'TCP', port: 80 }]
          }
        ]
      }
    },
    // Policy C: Gateway Namespace -> Store WooCommerce MCP
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-gateway-to-store-mcp',
        namespace: ns,
        labels
      },
      spec: {
        podSelector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                namespaceSelector: {
                  matchLabels: { 'kubernetes.io/metadata.name': gatewayNs }
                },
                podSelector: {
                  matchLabels: { 'app.kubernetes.io/name': 'gateway' }
                }
              }
            ],
            ports: [{ protocol: 'TCP', port: 4001 }]
          }
        ]
      }
    },
    // Policy D: Store WooCommerce MCP -> Store WordPress (Intra-namespace only)
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-mcp-to-store-wordpress',
        namespace: ns,
        labels
      },
      spec: {
        podSelector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-wordpress' }
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                podSelector: {
                  matchLabels: { 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
                }
              }
            ],
            ports: [{ protocol: 'TCP', port: 80 }]
          }
        ]
      }
    },
    // Policy E: Store WordPress -> Store MariaDB (Intra-namespace only)
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-wordpress-to-store-mariadb',
        namespace: ns,
        labels
      },
      spec: {
        podSelector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-mariadb' }
        },
        policyTypes: ['Ingress'],
        ingress: [
          {
            from: [
              {
                podSelector: {
                  matchLabels: { 'app.kubernetes.io/component': 'store-wordpress' }
                }
              }
            ],
            ports: [{ protocol: 'TCP', port: 3306 }]
          }
        ]
      }
    }
  ];

  // 6. Kubernetes Secrets
  const secrets = [
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'store-mariadb-secret',
        namespace: ns,
        labels
      },
      type: 'Opaque',
      stringData: {
        'mariadb-root-password': dbRootPassword,
        'mariadb-password': dbPassword
      }
    },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'store-wordpress-secret',
        namespace: ns,
        labels
      },
      type: 'Opaque',
      stringData: {
        'wordpress-db-password': dbPassword,
        'wordpress-admin-password': wpAdminPassword
      }
    },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'store-woocommerce-secret',
        namespace: ns,
        labels
      },
      type: 'Opaque',
      stringData: {
        'consumer-key': consumerKey,
        'consumer-secret': consumerSecret
      }
    }
  ];

  // 7. PersistentVolumeClaims
  const pvcs = [
    {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: 'store-mariadb-pvc',
        namespace: ns,
        labels
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '1Gi'
          }
        }
      }
    },
    {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: 'store-wordpress-pvc',
        namespace: ns,
        labels
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: '2Gi'
          }
        }
      }
    }
  ];

  // 8. Deployments
  const deployments = [
    // MariaDB Deployment
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'store-mariadb',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-mariadb' }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-mariadb' }
        },
        template: {
          metadata: {
            labels: { ...labels, 'app.kubernetes.io/component': 'store-mariadb' }
          },
          spec: {
            serviceAccountName: 'store-sa',
            containers: [
              {
                name: 'mariadb',
                image: 'mariadb:10.11',
                imagePullPolicy: pullPolicy,
                ports: [{ containerPort: 3306, name: 'mysql' }],
                env: [
                  {
                    name: 'MARIADB_ROOT_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'store-mariadb-secret',
                        key: 'mariadb-root-password'
                      }
                    }
                  },
                  { name: 'MARIADB_DATABASE', value: 'wordpress' },
                  { name: 'MARIADB_USER', value: 'wp_user' },
                  {
                    name: 'MARIADB_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'store-mariadb-secret',
                        key: 'mariadb-password'
                      }
                    }
                  }
                ],
                resources: {
                  requests: { cpu: '50m', memory: '128Mi' },
                  limits: { cpu: '300m', memory: '384Mi' }
                },
                livenessProbe: {
                  tcpSocket: { port: 3306 },
                  initialDelaySeconds: 30,
                  periodSeconds: 10
                },
                readinessProbe: {
                  exec: {
                    command: ['mariadb-admin', 'ping', '-h', 'localhost']
                  },
                  initialDelaySeconds: 15,
                  periodSeconds: 5
                },
                volumeMounts: [
                  { name: 'mariadb-storage', mountPath: '/var/lib/mysql' }
                ]
              }
            ],
            volumes: [
              {
                name: 'mariadb-storage',
                persistentVolumeClaim: { claimName: 'store-mariadb-pvc' }
              }
            ]
          }
        }
      }
    },
    // WordPress Deployment
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'store-wordpress',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-wordpress' }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-wordpress' }
        },
        template: {
          metadata: {
            labels: { ...labels, 'app.kubernetes.io/component': 'store-wordpress' }
          },
          spec: {
            serviceAccountName: 'store-sa',
            containers: [
              {
                name: 'wordpress',
                image: 'wordpress:6.4-apache',
                imagePullPolicy: pullPolicy,
                ports: [{ containerPort: 80, name: 'http' }],
                env: [
                  { name: 'WORDPRESS_DB_HOST', value: 'store-mariadb:3306' },
                  { name: 'WORDPRESS_DB_USER', value: 'wp_user' },
                  {
                    name: 'WORDPRESS_DB_PASSWORD',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'store-wordpress-secret',
                        key: 'wordpress-db-password'
                      }
                    }
                  },
                  { name: 'WORDPRESS_DB_NAME', value: 'wordpress' },
                  { name: 'WORDPRESS_TABLE_PREFIX', value: 'wp_' }
                ],
                resources: {
                  requests: { cpu: '100m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' }
                },
                livenessProbe: {
                  httpGet: { path: '/wp-login.php', port: 80 },
                  initialDelaySeconds: 45,
                  periodSeconds: 15
                },
                readinessProbe: {
                  httpGet: { path: '/wp-login.php', port: 80 },
                  initialDelaySeconds: 20,
                  periodSeconds: 5
                },
                volumeMounts: [
                  { name: 'wordpress-storage', mountPath: '/var/www/html' }
                ]
              }
            ],
            volumes: [
              {
                name: 'wordpress-storage',
                persistentVolumeClaim: { claimName: 'store-wordpress-pvc' }
              }
            ]
          }
        }
      }
    },
    // Dedicated WooCommerce MCP Server Deployment
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'store-woocommerce-mcp',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: { 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
        },
        template: {
          metadata: {
            labels: { ...labels, 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
          },
          spec: {
            serviceAccountName: 'store-sa',
            containers: [
              {
                name: 'woocommerce-mcp',
                image: 'urumi-woocommerce-mcp:latest',
                imagePullPolicy: pullPolicy,
                ports: [{ containerPort: 4001, name: 'mcp' }],
                env: [
                  { name: 'PORT', value: '4001' },
                  { name: 'WOOCOMMERCE_STORE_URL', value: 'http://store-wordpress:80' },
                  {
                    name: 'WOOCOMMERCE_CONSUMER_KEY',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'store-woocommerce-secret',
                        key: 'consumer-key'
                      }
                    }
                  },
                  {
                    name: 'WOOCOMMERCE_CONSUMER_SECRET',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'store-woocommerce-secret',
                        key: 'consumer-secret'
                      }
                    }
                  },
                  { name: 'WOOCOMMERCE_MOCK_FALLBACK', value: 'true' }
                ],
                resources: {
                  requests: { cpu: '50m', memory: '64Mi' },
                  limits: { cpu: '200m', memory: '256Mi' }
                },
                livenessProbe: {
                  httpGet: { path: '/health', port: 4001 },
                  initialDelaySeconds: 15,
                  periodSeconds: 10
                },
                readinessProbe: {
                  httpGet: { path: '/health', port: 4001 },
                  initialDelaySeconds: 5,
                  periodSeconds: 5
                }
              }
            ]
          }
        }
      }
    }
  ];

  // 9. Services
  const services = [
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'store-mariadb',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-mariadb' }
      },
      spec: {
        type: 'ClusterIP',
        ports: [{ port: 3306, targetPort: 3306, name: 'mysql' }],
        selector: { 'app.kubernetes.io/component': 'store-mariadb' }
      }
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'store-wordpress',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-wordpress' }
      },
      spec: {
        type: 'ClusterIP',
        ports: [{ port: 80, targetPort: 80, name: 'http' }],
        selector: { 'app.kubernetes.io/component': 'store-wordpress' }
      }
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: 'store-woocommerce-mcp',
        namespace: ns,
        labels: { ...labels, 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
      },
      spec: {
        type: 'ClusterIP',
        ports: [{ port: 4001, targetPort: 4001, name: 'mcp' }],
        selector: { 'app.kubernetes.io/component': 'store-woocommerce-mcp' }
      }
    }
  ];

  // 10. Ingress for Public Storefront
  const ingress = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: `${slug}-storefront-ingress`,
      namespace: ns,
      labels,
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
        'nginx.ingress.kubernetes.io/proxy-body-size': '64m'
      }
    },
    spec: {
      rules: [
        {
          host: ingressHost,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: 'store-wordpress',
                    port: { number: 80 }
                  }
                }
              }
            ]
          }
        }
      ]
    }
  };

  return {
    namespace,
    serviceAccount,
    resourceQuota,
    limitRange,
    networkPolicies,
    secrets,
    pvcs,
    deployments,
    services,
    ingress
  };
}
