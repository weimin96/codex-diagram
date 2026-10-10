import {
  siApachekafka,
  siDocker,
  siElasticsearch,
  siKubernetes,
  siMinio,
  siModelcontextprotocol,
  siMongodb,
  siMysql,
  siNginx,
  siOpenid,
  siOpensearch,
  siPostgresql,
  siQdrant,
  siRabbitmq,
  siReact,
  siRedis,
  siSpringboot,
  siVuedotjs,
} from 'simple-icons'
import {
  Activity,
  Bot,
  Box,
  Boxes,
  Brain,
  Cable,
  Cloud,
  Container,
  Cpu,
  Database,
  FileBox,
  Globe2,
  HardDrive,
  KeyRound,
  Layers3,
  LockKeyhole,
  MessageSquareMore,
  Monitor,
  Network,
  Plug,
  RadioTower,
  Route,
  Search,
  Server,
  ServerCog,
  Shield,
  Waypoints,
  Webhook,
  Workflow,
  type IconNode,
} from 'lucide'
import { CLOUD_ARCHITECTURE_ICON_CATALOG, type CloudIconProvider } from './cloudIconPacks.js'

export const CANVAS_ROLE_ICON_IDS = [
  'user', 'web', 'api', 'gateway', 'service', 'worker', 'database', 'cache', 'queue', 'search', 'vector', 'cloud', 'file', 'auth', 'ai', 'mcp', 'scheduler', 'external',
] as const

export const CANVAS_STENCIL_IDS = [
  'spring', 'react', 'vue', 'postgres', 'mysql', 'redis', 'kafka', 'rabbitmq', 'docker', 'kubernetes', 'qdrant', 'opensearch', 'elasticsearch', 'mongodb', 'minio', 'nginx', 'grpc', 'oidc', 'openai', 'mcp',
] as const

export const CANVAS_LUCIDE_ICON_IDS = [
  'server', 'server-cog', 'cloud', 'database', 'hard-drive', 'bot', 'brain', 'cpu', 'network', 'route', 'workflow', 'webhook', 'monitor', 'boxes', 'box', 'container', 'shield', 'lock-keyhole', 'key-round', 'plug', 'cable', 'waypoints', 'radio-tower', 'activity', 'globe', 'search', 'file-box', 'message', 'layers',
] as const

export type CanvasRoleIconId = typeof CANVAS_ROLE_ICON_IDS[number]
export type CanvasStencilId = typeof CANVAS_STENCIL_IDS[number]
export type CanvasLucideIconId = typeof CANVAS_LUCIDE_ICON_IDS[number]
export type CanvasIconSource = 'role' | 'simple' | 'lucide' | CloudIconProvider
export type CanvasIconRef = `role:${CanvasRoleIconId}` | `simple:${CanvasStencilId}` | `lucide:${CanvasLucideIconId}` | `${CloudIconProvider}:${string}`

export interface CanvasIconCatalogEntry {
  ref: CanvasIconRef
  source: CanvasIconSource
  label: string
  keywords: string[]
}

const roleLabels: Record<CanvasRoleIconId, string> = {
  user: '用户',
  web: 'Web / 前端',
  api: 'API',
  gateway: '网关',
  service: '服务',
  worker: 'Worker',
  database: '数据库',
  cache: '缓存',
  queue: '消息队列',
  search: '搜索',
  vector: '向量检索',
  cloud: '云 / 平台',
  file: '文件 / 对象存储',
  auth: '认证 / 身份',
  ai: 'AI / 模型',
  mcp: 'MCP',
  scheduler: '调度',
  external: '外部系统',
}

const stencilLabels: Record<CanvasStencilId, string> = {
  spring: 'Spring Boot',
  react: 'React',
  vue: 'Vue',
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  redis: 'Redis',
  kafka: 'Kafka',
  rabbitmq: 'RabbitMQ',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  qdrant: 'Qdrant',
  opensearch: 'OpenSearch',
  elasticsearch: 'Elasticsearch',
  mongodb: 'MongoDB',
  minio: 'MinIO',
  nginx: 'Nginx',
  grpc: 'gRPC',
  oidc: 'OpenID / OIDC',
  openai: 'LLM / OpenAI-compatible',
  mcp: 'Model Context Protocol',
}

const lucideLabels: Record<CanvasLucideIconId, string> = {
  server: 'Server',
  'server-cog': 'Server Config',
  cloud: 'Cloud',
  database: 'Database',
  'hard-drive': 'Storage',
  bot: 'Bot / Agent',
  brain: 'AI / Brain',
  cpu: 'Compute',
  network: 'Network',
  route: 'Route',
  workflow: 'Workflow',
  webhook: 'Webhook',
  monitor: 'Monitor',
  boxes: 'Services / Modules',
  box: 'Component',
  container: 'Container',
  shield: 'Security',
  'lock-keyhole': 'Access Control',
  'key-round': 'Identity / Key',
  plug: 'Integration',
  cable: 'Connection',
  waypoints: 'Topology',
  'radio-tower': 'Messaging / Signal',
  activity: 'Runtime / Activity',
  globe: 'Internet / External',
  search: 'Search',
  'file-box': 'Artifact / File',
  message: 'Message',
  layers: 'Layers',
}

const simpleIcons: Partial<Record<CanvasStencilId, { path: string; hex: string }>> = {
  spring: siSpringboot,
  react: siReact,
  vue: siVuedotjs,
  postgres: siPostgresql,
  mysql: siMysql,
  redis: siRedis,
  kafka: siApachekafka,
  rabbitmq: siRabbitmq,
  docker: siDocker,
  kubernetes: siKubernetes,
  qdrant: siQdrant,
  opensearch: siOpensearch,
  elasticsearch: siElasticsearch,
  mongodb: siMongodb,
  minio: siMinio,
  nginx: siNginx,
  oidc: siOpenid,
  mcp: siModelcontextprotocol,
}

const lucideIcons: Record<CanvasLucideIconId, IconNode> = {
  server: Server,
  'server-cog': ServerCog,
  cloud: Cloud,
  database: Database,
  'hard-drive': HardDrive,
  bot: Bot,
  brain: Brain,
  cpu: Cpu,
  network: Network,
  route: Route,
  workflow: Workflow,
  webhook: Webhook,
  monitor: Monitor,
  boxes: Boxes,
  box: Box,
  container: Container,
  shield: Shield,
  'lock-keyhole': LockKeyhole,
  'key-round': KeyRound,
  plug: Plug,
  cable: Cable,
  waypoints: Waypoints,
  'radio-tower': RadioTower,
  activity: Activity,
  globe: Globe2,
  search: Search,
  'file-box': FileBox,
  message: MessageSquareMore,
  layers: Layers3,
}

export const CANVAS_ICON_CATALOG: CanvasIconCatalogEntry[] = [
  ...CANVAS_ROLE_ICON_IDS.map((id) => ({
    ref: `role:${id}` as CanvasIconRef,
    source: 'role' as const,
    label: roleLabels[id],
    keywords: [id, roleLabels[id]],
  })),
  ...CANVAS_STENCIL_IDS
    .filter((id) => simpleIcons[id])
    .map((id) => ({
      ref: `simple:${id}` as CanvasIconRef,
      source: 'simple' as const,
      label: stencilLabels[id],
      keywords: [id, stencilLabels[id], 'brand', 'logo'],
    })),
  ...CANVAS_LUCIDE_ICON_IDS.map((id) => ({
    ref: `lucide:${id}` as CanvasIconRef,
    source: 'lucide' as const,
    label: lucideLabels[id],
    keywords: [id, lucideLabels[id], 'lucide'],
  })),
  ...CLOUD_ARCHITECTURE_ICON_CATALOG.map((entry) => ({
    ref: entry.ref as CanvasIconRef,
    source: entry.source,
    label: entry.label,
    keywords: [...entry.keywords],
  })),
]

const validIconRefs = new Set(CANVAS_ICON_CATALOG.map((entry) => entry.ref))

export function isCanvasIconRef(value: unknown): value is CanvasIconRef {
  return typeof value === 'string' && validIconRefs.has(value as CanvasIconRef)
}

export function canvasIconRefLabel(ref: CanvasIconRef): string {
  return CANVAS_ICON_CATALOG.find((entry) => entry.ref === ref)?.label ?? ref
}

export function canvasSimpleIcon(stencil: CanvasStencilId): { path: string; hex: string } | undefined {
  return simpleIcons[stencil]
}

export function canvasLucideIcon(id: CanvasLucideIconId): IconNode {
  return lucideIcons[id]
}
