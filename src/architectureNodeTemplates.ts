import { CLOUD_ARCHITECTURE_ICON_CATALOG, type CloudIconProvider } from './cloudIconPacks.js'
import type { CanvasIcon, CanvasIconRef, CanvasStencil, CanvasTone } from './canvas.js'

export type ArchitectureNodeTemplateProvider = 'builtin' | CloudIconProvider
export type ArchitectureNodeTemplateCategory = '应用' | '数据' | '消息' | '平台' | 'AI / 集成'

export interface ArchitectureNodeTemplate {
  id: string
  provider: ArchitectureNodeTemplateProvider
  category: ArchitectureNodeTemplateCategory
  label: string
  subtitle: string
  icon: CanvasIcon
  stencil?: CanvasStencil
  iconRef?: CanvasIconRef
  groupId?: string
  tone?: CanvasTone
  width?: number
  height?: number
  keywords: string[]
}

const builtinTemplates: ArchitectureNodeTemplate[] = [
  template('react', '应用', 'React', 'Web / Console', 'web', { stencil: 'react', groupId: 'arch-experience', tone: 'accent' }),
  template('vue', '应用', 'Vue', 'Web / Console', 'web', { stencil: 'vue', groupId: 'arch-experience', tone: 'accent' }),
  template('spring', '应用', 'Spring Boot', 'Backend Service', 'service', { stencil: 'spring', groupId: 'arch-application' }),
  template('nginx', '平台', 'Nginx', 'Gateway / Proxy', 'gateway', { stencil: 'nginx', groupId: 'arch-application' }),
  template('docker', '平台', 'Docker', 'Container Runtime', 'cloud', { stencil: 'docker', groupId: 'arch-application' }),
  template('kubernetes', '平台', 'Kubernetes', 'Runtime / Cluster', 'cloud', { stencil: 'kubernetes', groupId: 'arch-application' }),
  template('postgres', '数据', 'PostgreSQL', 'Relational Database', 'database', { stencil: 'postgres', groupId: 'arch-data', tone: 'success' }),
  template('mysql', '数据', 'MySQL', 'Relational Database', 'database', { stencil: 'mysql', groupId: 'arch-data', tone: 'success' }),
  template('mongodb', '数据', 'MongoDB', 'Document Database', 'database', { stencil: 'mongodb', groupId: 'arch-data', tone: 'success' }),
  template('redis', '数据', 'Redis', 'Cache', 'cache', { stencil: 'redis', groupId: 'arch-data', tone: 'success' }),
  template('opensearch', '数据', 'OpenSearch', 'Search Index', 'search', { stencil: 'opensearch', groupId: 'arch-data', tone: 'success' }),
  template('elasticsearch', '数据', 'Elasticsearch', 'Search Index', 'search', { stencil: 'elasticsearch', groupId: 'arch-data', tone: 'success' }),
  template('qdrant', '数据', 'Qdrant', 'Vector Database', 'vector', { stencil: 'qdrant', groupId: 'arch-data', tone: 'success' }),
  template('minio', '数据', 'MinIO', 'Object Storage', 'file', { stencil: 'minio', groupId: 'arch-data', tone: 'success' }),
  template('kafka', '消息', 'Kafka', 'Event Stream', 'queue', { stencil: 'kafka', groupId: 'arch-processing', tone: 'warning' }),
  template('rabbitmq', '消息', 'RabbitMQ', 'Message Broker', 'queue', { stencil: 'rabbitmq', groupId: 'arch-processing', tone: 'warning' }),
  template('agent', 'AI / 集成', 'Agent Runtime', 'Agent / Tool Runtime', 'ai', { groupId: 'arch-application', tone: 'accent' }),
  template('openai', 'AI / 集成', 'OpenAI', 'Model Provider', 'ai', { stencil: 'openai', groupId: 'arch-application', tone: 'accent' }),
  template('mcp', 'AI / 集成', 'MCP', 'Tool Gateway', 'mcp', { stencil: 'mcp', groupId: 'arch-application', tone: 'accent' }),
  template('oidc', 'AI / 集成', 'OIDC / SSO', 'Identity Provider', 'auth', { stencil: 'oidc', groupId: 'arch-external', tone: 'muted' }),
  template('grpc', 'AI / 集成', 'gRPC', 'RPC Interface', 'api', { stencil: 'grpc', groupId: 'arch-application' }),
  template('worker', '应用', 'Worker', 'Async Worker', 'worker', { groupId: 'arch-processing', tone: 'warning' }),
  template('llm', 'AI / 集成', 'LLM', 'Model Service', 'ai', { groupId: 'arch-application', tone: 'accent' }),
]

type CloudSemanticProfile = Pick<ArchitectureNodeTemplate, 'category' | 'subtitle' | 'icon' | 'groupId' | 'tone' | 'width' | 'height'>

const cloudProfiles: Record<string, CloudSemanticProfile> = {
  'aws:ec2': service('Virtual Machine'),
  'aws:lambda': worker('Serverless Function'),
  'aws:apigateway': gateway('Managed API Gateway'),
  'aws:simplestorageservice': data('Object Storage', 'file'),
  'aws:rds': data('Managed Relational Database'),
  'aws:dynamodb': data('Managed NoSQL Database'),
  'aws:elasticache': data('Managed Cache', 'cache'),
  'aws:simplequeueservice': messaging('Managed Queue'),
  'aws:simplenotificationservice': messaging('Pub/Sub Notifications'),
  'aws:elastickubernetesservice': platform('Managed Kubernetes'),
  'aws:elasticcontainerservice': platform('Container Orchestration'),
  'aws:cloudfront': gateway('CDN / Edge Delivery'),
  'aws:route53': gateway('DNS / Traffic Routing'),
  'aws:elasticloadbalancing': gateway('Managed Load Balancer'),
  'aws:cloudwatch': platform('Monitoring / Observability', 'search'),
  'aws:transitgateway': platform('Network Transit', 'gateway'),

  'azure:virtualmachine': service('Virtual Machine'),
  'azure:functionapps': worker('Serverless Function'),
  'azure:appservices': service('Managed Web Application'),
  'azure:kubernetesservices': platform('Managed Kubernetes'),
  'azure:containerinstances': platform('Managed Containers'),
  'azure:storageaccounts': data('Object / File Storage', 'file'),
  'azure:sqldatabase': data('Managed Relational Database'),
  'azure:azurecosmosdb': data('Managed NoSQL Database'),
  'azure:azureservicebus': messaging('Managed Messaging'),
  'azure:applicationgateways': gateway('Application Gateway'),
  'azure:keyvaults': platform('Secrets / Key Management', 'auth'),
  'azure:monitor': platform('Monitoring / Observability', 'search'),
  'azure:virtualnetworks': platform('Virtual Network', 'gateway'),
  'azure:azureopenai': ai('Managed Model Service'),
  'azure:loadbalancers': gateway('Managed Load Balancer'),

  'gcp:compute_engine': service('Virtual Machine'),
  'gcp:cloud_run': service('Serverless Container'),
  'gcp:cloud_functions': worker('Serverless Function'),
  'gcp:google_kubernetes_engine': platform('Managed Kubernetes'),
  'gcp:cloud_storage': data('Object Storage', 'file'),
  'gcp:cloud_sql': data('Managed Relational Database'),
  'gcp:firestore': data('Managed Document Database'),
  'gcp:pubsub': messaging('Pub/Sub Messaging'),
  'gcp:cloud_load_balancing': gateway('Managed Load Balancer'),
  'gcp:cloud_monitoring': platform('Monitoring / Observability', 'search'),
  'gcp:vertexai': ai('Managed AI Platform'),
  'gcp:cloud_api_gateway': gateway('Managed API Gateway'),
  'gcp:memorystore': data('Managed Cache', 'cache'),
  'gcp:artifact_registry': platform('Artifact Registry', 'file'),
  'gcp:virtual_private_cloud': platform('Virtual Private Cloud', 'gateway'),
}

const cloudTemplates: ArchitectureNodeTemplate[] = CLOUD_ARCHITECTURE_ICON_CATALOG.flatMap((entry) => {
  const profile = cloudProfiles[entry.ref]
  if (!profile) return []
  return [{
    id: entry.ref,
    provider: entry.source,
    category: profile.category,
    label: entry.label,
    subtitle: profile.subtitle,
    icon: profile.icon,
    iconRef: entry.ref as CanvasIconRef,
    groupId: profile.groupId,
    tone: profile.tone,
    width: profile.width,
    height: profile.height,
    keywords: [...entry.keywords, profile.subtitle, profile.category],
  }]
})

export const ARCHITECTURE_NODE_TEMPLATES: readonly ArchitectureNodeTemplate[] = [...builtinTemplates, ...cloudTemplates]

export function architectureNodeTemplate(id: string): ArchitectureNodeTemplate | undefined {
  return ARCHITECTURE_NODE_TEMPLATES.find((item) => item.id === id)
}

export function searchArchitectureNodeTemplates(
  query: string,
  provider: ArchitectureNodeTemplateProvider | 'all' = 'all',
  limit = 12,
): ArchitectureNodeTemplate[] {
  const needle = query.trim().toLocaleLowerCase()
  return ARCHITECTURE_NODE_TEMPLATES
    .filter((item) => provider === 'all' || item.provider === provider)
    .filter((item) => !needle || [item.id, item.label, item.subtitle, item.category, ...item.keywords]
      .some((value) => value.toLocaleLowerCase().includes(needle)))
    .slice(0, Math.max(1, Math.min(30, Math.floor(limit))))
}

function template(
  id: string,
  category: ArchitectureNodeTemplateCategory,
  label: string,
  subtitle: string,
  icon: CanvasIcon,
  options: Partial<Omit<ArchitectureNodeTemplate, 'id' | 'provider' | 'category' | 'label' | 'subtitle' | 'icon' | 'keywords'>> = {},
): ArchitectureNodeTemplate {
  return {
    id: `builtin:${id}`,
    provider: 'builtin',
    category,
    label,
    subtitle,
    icon,
    ...options,
    keywords: [id, label, subtitle, category],
  }
}

function service(subtitle: string): CloudSemanticProfile {
  return { category: '应用', subtitle, icon: 'service', groupId: 'arch-application' }
}

function worker(subtitle: string): CloudSemanticProfile {
  return { category: '应用', subtitle, icon: 'worker', groupId: 'arch-processing', tone: 'warning' }
}

function gateway(subtitle: string): CloudSemanticProfile {
  return { category: '平台', subtitle, icon: 'gateway', groupId: 'arch-application' }
}

function platform(subtitle: string, icon: CanvasIcon = 'cloud'): CloudSemanticProfile {
  return { category: '平台', subtitle, icon, groupId: 'arch-application', tone: 'muted' }
}

function data(subtitle: string, icon: CanvasIcon = 'database'): CloudSemanticProfile {
  return { category: '数据', subtitle, icon, groupId: 'arch-data', tone: 'success' }
}

function messaging(subtitle: string): CloudSemanticProfile {
  return { category: '消息', subtitle, icon: 'queue', groupId: 'arch-processing', tone: 'warning' }
}

function ai(subtitle: string): CloudSemanticProfile {
  return { category: 'AI / 集成', subtitle, icon: 'ai', groupId: 'arch-application', tone: 'accent' }
}
