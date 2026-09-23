import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type {
  Connection,
  OnConnect,
  OnNodeDrag,
} from '@xyflow/react'
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  Database,
  Download,
  FileCode2,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react'
import { AdminSidebarExtras } from '../../components/admin/AdminSidebarExtras'
import { GuidedTour, type GuidedTourStep } from '../../features/onboarding/GuidedTour'
import { AiCodegenPanel } from '../../features/ai/AiCodegenPanel'
import { CommentsDrawer } from '../../features/comments/components/CommentsDrawer'
import { ClassFeaturesPanel } from '../../features/diagramador/components/ClassFeaturesPanel'
import { CreateClassPanel } from '../../features/diagramador/components/CreateClassPanel'
import { DiagramAssistantPanel } from '../../features/diagramador/components/DiagramAssistantPanel'
import { DiagramCanvas } from '../../features/diagramador/components/DiagramCanvas'
import { InviteModal } from '../../features/projects/components/InviteModal'
import { JoinProjectModal } from '../../features/projects/components/JoinProjectModal'
import { ToastContainer } from '../../components/ui/ToastNotification'
import { Toast } from '../../components/ui/toast.store'
import { RelationBuilderPanel, RelationsPanel } from '../../features/diagramador/components/RelationsPanel'
import { useCommentStore } from '../../features/comments/store/comment.store'
import { useDiagramStore } from '../../features/diagrams/store/diagram.store'
import { getCollaboratorColor, getCollaboratorInitials } from '../../utils/collaboratorColor'
import { listarComentarios } from '../../services/comentarioService'
import type { Comentario } from '../../models/comentario'
import type {
  Cardinality,
  ClassAttribute,
  ClassFlowEdge,
  ClassFlowNode,
  ClassMethod,
  ClassNodeData,
  RelationType,
  UmlRelationData,
} from '../../features/diagrams/types/relation.types'
import {
  getRelationEdgeProps,
  normalizeCardinality,
  normalizeRelationType,
  relationUsesCardinality,
} from '../../features/diagrams/utils/relation-markers'
import { createDiagramEvent, validateRelation } from '../../features/diagrams/utils/relation-validation'
import type { Proyecto, ProyectoMiembro } from '../../models/proyecto'
import { ApiError } from '../../services/api'
import type { DiagramContent, DiagramEdge, DiagramNode, DiagramaResponse } from '../../services/diagramaService'
import {
  abrirDiagrama,
  agregarClase,
  crearDiagrama,
  eliminarDiagrama,
  exportarDiagramaXmi,
  guardarDiagrama,
  importarXmiEnProyecto,
  listarDiagramasPorProyecto,
  moverClase,
} from '../../services/diagramaService'
import {
  connectDiagramSocket,
  disconnectDiagramSocket,
  sendRealtimeEvent,
  type RealtimeDiagramEvent,
  type RealtimeDiagramUser,
} from '../../services/realtimeDiagramService'
import {
  actualizarMiembro,
  agregarMiembro,
  crearProyecto,
  listarMiembros,
  listarProyectosPorUsuario,
  quitarMiembro,
} from '../../services/proyecto'
import { listarUsuarios } from '../../services/usuarioService'
import type { AuthUserProfile } from '../../utils/auth'
import '@xyflow/react/dist/style.css'
import '../usuario/UsuariosPage.css'
import '../IA/ia.css'
import './EstudiantePage.css'

type EstudiantePageProps = {
  theme: 'dark' | 'light'
  userProfile: AuthUserProfile | null
  onBack: () => void
  onProfile: () => void
  onToggleTheme: () => void
  onVersionHistory: (diagrama: DiagramaResponse) => void
}

type StudentView = 'projects' | 'diagrammer'
type FeatureTab = 'attributes' | 'methods'

const memberRoleOptions = [
  {
    id: 2,
    label: 'Propietario',
  },
  {
    id: 3,
    label: 'Editor',
  },
  {
    id: 4,
    label: 'Visualizador',
  },
]

const onboardingSteps: GuidedTourStep[] = [
  {
    title: 'Bienvenido al Diagramador UML',
    description:
      'Desde aqui puedes crear proyectos, modelar clases y trabajar con otras personas en tiempo real.',
  },
  {
    target: '[data-tour="create-project"]',
    title: 'Crea tu primer workspace',
    description:
      'Ponle un nombre y una descripcion. El proyecto sera el espacio que contiene tus diagramas y colaboradores.',
  },
  {
    target: '[data-tour="project-list"]',
    title: 'Abre el diagramador',
    description:
      'Tus proyectos aparecen aqui. Abre uno para crear clases, relaciones, atributos y metodos.',
  },
  {
    target: '[data-tour="join-project"]',
    title: 'Trabaja con tu equipo',
    description:
      'Usa un codigo para unirte a otro proyecto. Dentro de cada proyecto tambien podras invitar colaboradores y asignar permisos.',
  },
  {
    target: '[data-tour="workspace-navigation"]',
    title: 'Todo queda a mano',
    description:
      'Desde esta barra vuelves a tus proyectos y, al abrir uno, accedes al diagramador, la importacion XMI/EAP y el asistente.',
  },
]

const emptyContent: DiagramContent = {
  nodes: [],
  edges: [],
}

const standardClassWidth = 245
const standardClassHeight = 180
const classNodeHeaderHeight = 46
const classNodeSectionPadding = 40
const classNodeRowHeight = 22
const classNodeFooterGap = 12

function getClassNodeHeight(data: Pick<ClassNodeData, 'attributes' | 'methods'>) {
  const attributeCount = Math.max(data.attributes.length, 1)
  const methodCount = Math.max(data.methods.length, 1)

  return Math.max(
    standardClassHeight,
    classNodeHeaderHeight +
      classNodeSectionPadding +
      attributeCount * classNodeRowHeight +
      methodCount * classNodeRowHeight +
      classNodeFooterGap,
  )
}

function getClassNodeStyle(
  data: Pick<ClassNodeData, 'attributes' | 'methods'>,
  style?: ClassFlowNode['style'],
  measuredWidth?: number | null,
  measuredHeight?: number | null,
) {
  return {
    ...style,
    width: Math.max(Number(style?.width ?? measuredWidth ?? standardClassWidth), standardClassWidth),
    height: Math.max(Number(style?.height ?? measuredHeight ?? standardClassHeight), getClassNodeHeight(data)),
  }
}

function getMemberRoleName(roleId: number) {
  return memberRoleOptions.find((role) => role.id === roleId)?.label ?? 'Sin rol'
}

function normalizeMethodParameters(parameters: unknown) {
  if (!Array.isArray(parameters)) {
    return []
  }

  return parameters
    .map((parameter) => {
      if (typeof parameter === 'string') {
        return parameter.trim()
      }

      if (parameter && typeof parameter === 'object') {
        const value = parameter as Record<string, unknown>
        return String(value.name ?? value.nombre ?? value.parameter ?? '').trim()
      }

      return ''
    })
    .filter(Boolean)
}

function parseMethodParameters(value: string) {
  return value
    .split(',')
    .map((parameter) => parameter.trim())
    .filter(Boolean)
    .map((name) => ({ name }))
}

function formatMethodParameters(parameters: unknown) {
  return normalizeMethodParameters(parameters).join(', ')
}

function getCollaboratorError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permiso para gestionar colaboradores'
  }

  return error instanceof Error ? error.message : fallback
}

function getProjectActionError(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permiso para editar este proyecto.'
  }

  return error instanceof Error ? error.message : fallback
}

function normalizeContent(content?: DiagramContent | null) {
  return content ?? emptyContent
}

function toFlowNodes(nodes: DiagramNode[]): ClassFlowNode[] {
  return nodes.map((node) => {
    const data = {
      ...node.data,
      name: node.data.name,
      attributes: (node.data.attributes ?? []) as ClassAttribute[],
      methods: (node.data.methods ?? []) as ClassMethod[],
    }

    const posX =
      typeof node.position?.x === 'number' && Number.isFinite(node.position.x)
        ? node.position.x
        : 120
    const posY =
      typeof node.position?.y === 'number' && Number.isFinite(node.position.y)
        ? node.position.y
        : 110

    return {
      id: node.id,
      type: 'classNode',
      position: { x: posX, y: posY },
      style: getClassNodeStyle(data, node.style),
      data,
    }
  })
}

function toFlowEdges(edges: DiagramEdge[]): ClassFlowEdge[] {
  return edges.map((edge) => {
    const relationType = normalizeRelationType(edge.data?.relationType)
    const {
      sourceCardinality: _sourceCardinality,
      targetCardinality: _targetCardinality,
      cardinality: _legacyCardinality,
      ...persistedData
    } = edge.data ?? {}
    const cardinalityData = relationUsesCardinality(relationType)
      ? {
          sourceCardinality: normalizeCardinality(edge.data?.sourceCardinality),
          targetCardinality: normalizeCardinality(edge.data?.targetCardinality),
        }
      : {}

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      data: {
        ...persistedData,
        id: edge.id,
        sourceClassId: edge.source,
        targetClassId: edge.target,
        relationType,
        ...cardinalityData,
        createdAt: String(edge.data?.createdAt ?? new Date().toISOString()),
        createdBy: edge.data?.createdBy as string | undefined,
      },
      ...getRelationEdgeProps(relationType),
    }
  })
}

function getAssociationClassName(sourceName: string, targetName: string) {
  return `${sourceName}${targetName}`
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function getPrimaryKeysForAssociation(node: ClassFlowNode, fallbackName: string): ClassAttribute[] {
  const allAttributes = node.data.attributes ?? []
  const pks = allAttributes.filter((attr) =>
    Boolean(
      attr.primaryKey ||
      attr.isPrimaryKey ||
      (attr as any).isPk ||
      (attr as any).primary_key ||
      (attr as any).es_pk ||
      attr.name?.toLowerCase() === 'id'
    )
  )

  if (pks.length > 0) {
    return pks.map((pk) => {
      const originalName = String(pk.name || 'id').trim()
      const lower = originalName.toLowerCase()
      // Si el nombre es genérico como 'id', 'codigo' o 'pk', lo calificamos con el nombre de la clase
      const attrName =
        lower === 'id' || lower === 'codigo' || lower === 'pk'
          ? `id_${fallbackName.toLowerCase().replace(/\s+/g, '_')}`
          : originalName
      const attrType = String(pk.type || (pk as any).tipo || 'BIGINT')

      return {
        name: attrName,
        type: attrType,
        primaryKey: true,
        isPrimaryKey: true,
        foreignKey: true,
        isForeignKey: true,
        nullable: false,
      }
    })
  }

  // Fallback si la clase no tiene PK explícitamente marcada
  return [
    {
      name: `id_${fallbackName.toLowerCase().replace(/\s+/g, '_')}`,
      type: 'BIGINT',
      primaryKey: true,
      isPrimaryKey: true,
      foreignKey: true,
      isForeignKey: true,
      nullable: false,
    },
  ]
}

function createAssociationClassNode(
  relationId: string,
  sourceClassId: string,
  targetClassId: string,
  currentNodes: ClassFlowNode[],
): ClassFlowNode | null {
  const source = currentNodes.find((node) => node.id === sourceClassId)
  const target = currentNodes.find((node) => node.id === targetClassId)

  if (!source || !target) {
    return null
  }

  const associationClassId = `assoc-class-${relationId}`
  const sourceName = source.data.name || 'Origen'
  const targetName = target.data.name || 'Destino'

  const sourcePks = getPrimaryKeysForAssociation(source, sourceName)
  const targetPks = getPrimaryKeysForAssociation(target, targetName)

  // Fusionamos ambas PKs asegurando que no haya colisión de nombres
  const finalAttributes: ClassAttribute[] = [...sourcePks]
  for (const tAttr of targetPks) {
    let finalName = tAttr.name
    if (finalAttributes.some((a) => a.name?.toLowerCase() === finalName?.toLowerCase())) {
      finalName = `${finalName}_${targetName.toLowerCase()}`
    }
    finalAttributes.push({
      ...tAttr,
      name: finalName,
    })
  }

  return {
    id: associationClassId,
    type: 'classNode',
    position: {
      x: (source.position.x + target.position.x) / 2,
      y: Math.min(source.position.y, target.position.y) - 170,
    },
    data: {
      name: getAssociationClassName(sourceName, targetName) || 'AssociationClass',
      attributes: finalAttributes,
      methods: [],
    },
  }
}

function toDiagramContent(nodes: ClassFlowNode[], edges: ClassFlowEdge[]): DiagramContent {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'classNode',
      position: node.position,
      style: getClassNodeStyle(node.data, node.style, node.width, node.height),
      data: {
        ...node.data,
        name: node.data.name,
        attributes: node.data.attributes,
        methods: node.data.methods,
      },
    })),
    edges: edges.map((edge) => {
      const currentData = getEdgeData(edge)
      const {
        cardinality: _legacyCardinality,
        sourceCardinality: _sourceCardinality,
        targetCardinality: _targetCardinality,
        ...relationData
      } = currentData
      const cardinalityData = relationUsesCardinality(currentData.relationType)
        ? {
            sourceCardinality: normalizeCardinality(currentData.sourceCardinality),
            targetCardinality: normalizeCardinality(currentData.targetCardinality),
          }
        : {}

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'umlRelation',
        data: {
          ...relationData,
          sourceClassId: edge.source,
          targetClassId: edge.target,
          ...cardinalityData,
        },
      }
    }),
  }
}

function getEdgeData(edge: ClassFlowEdge): UmlRelationData {
  const relationType = normalizeRelationType(edge.data?.relationType)
  const {
    sourceCardinality: _sourceCardinality,
    targetCardinality: _targetCardinality,
    cardinality: _legacyCardinality,
    ...persistedData
  } = (edge.data ?? {}) as Partial<UmlRelationData> & { cardinality?: unknown }
  const cardinalityData = relationUsesCardinality(relationType)
    ? {
        sourceCardinality: normalizeCardinality(edge.data?.sourceCardinality),
        targetCardinality: normalizeCardinality(edge.data?.targetCardinality),
      }
    : {}

  return {
    ...persistedData,
    id: edge.data?.id ?? edge.id,
    sourceClassId: edge.data?.sourceClassId ?? edge.source,
    targetClassId: edge.data?.targetClassId ?? edge.target,
    relationType,
    ...cardinalityData,
    createdAt: edge.data?.createdAt ?? new Date().toISOString(),
  }
}


function buildRelationData({
  associationClassId,
  createdAt,
  createdBy,
  relationId,
  relationType,
  sourceClassId,
  sourceCardinality = '1..*',
  targetClassId,
  targetCardinality = '1',
}: {
  associationClassId?: string
  createdAt?: string
  createdBy?: string
  relationId: string
  relationType: RelationType
  sourceClassId: string
  sourceCardinality?: Cardinality
  targetClassId: string
  targetCardinality?: Cardinality
}): UmlRelationData {
  const semanticData =
    relationType === 'generalization'
      ? {
          childClassId: sourceClassId,
          parentClassId: targetClassId,
        }
      : relationType === 'composition' || relationType === 'aggregation'
        ? {
            wholeClassId: sourceClassId,
            partClassId: targetClassId,
          }
        : {}

  return {
    id: relationId,
    sourceClassId,
    targetClassId,
    relationType,
    ...(relationUsesCardinality(relationType)
      ? { sourceCardinality, targetCardinality }
      : {}),
    associationClassId,
    createdBy,
    createdAt: createdAt ?? new Date().toISOString(),
    ...semanticData,
  }
}

function getRecursiveHandles(sourceHandle?: string | null, targetHandle?: string | null) {
  if (sourceHandle && targetHandle && sourceHandle !== targetHandle) {
    return {
      sourceHandle,
      targetHandle,
    }
  }

  return {
    sourceHandle: 'right',
    targetHandle: 'top',
  }
}

function getDefaultRelationCardinalities(relationType: RelationType) {
  if (relationType === 'composition' || relationType === 'aggregation') {
    return { sourceCardinality: '1' as Cardinality, targetCardinality: '0..*' as Cardinality }
  }

  return { sourceCardinality: '1..*' as Cardinality, targetCardinality: '1' as Cardinality }
}

function normalizeClassAttributes(rawAttrs: unknown): ClassAttribute[] {
  if (!Array.isArray(rawAttrs)) return []
  return rawAttrs.map((attr) => {
    if (typeof attr === 'string') {
      const parts = attr.trim().split(/\s*:\s*/)
      const name = parts[0] || 'attr'
      const isPk = name.toLowerCase() === 'id'
      return {
        name,
        type: parts[1] || 'VARCHAR',
        primaryKey: isPk,
        isPrimaryKey: isPk,
        foreignKey: false,
        isForeignKey: false,
        nullable: false,
      }
    }
    if (attr && typeof attr === 'object') {
      const a = attr as Record<string, unknown>
      const name = String(a.name ?? a.nombre ?? 'attr')
      const rawPk = a.primaryKey ?? a.isPrimaryKey ?? a.primary_key ?? a.es_pk ?? a.isPk
      const isPk = rawPk !== undefined ? Boolean(rawPk) : name.toLowerCase() === 'id'
      const isFk = Boolean(
        a.foreignKey ??
        a.isForeignKey ??
        a.foreign_key ??
        a.es_fk ??
        a.isFk
      )
      return {
        ...a,
        name,
        type: String(a.type ?? a.tipo ?? 'VARCHAR'),
        primaryKey: isPk,
        isPrimaryKey: isPk,
        foreignKey: isFk,
        isForeignKey: isFk,
        nullable: Boolean(a.nullable ?? a.puede_ser_nulo ?? false),
      }
    }
    return {
      name: 'attr',
      type: 'VARCHAR',
      primaryKey: false,
      isPrimaryKey: false,
      foreignKey: false,
      isForeignKey: false,
      nullable: false,
    }
  })
}

function normalizeClassMethods(rawMethods: unknown): ClassMethod[] {
  if (!Array.isArray(rawMethods)) return []
  return rawMethods.map((method) => {
    if (typeof method === 'string') {
      return {
        name: method.trim(),
        returnType: 'void',
        parameters: [],
      }
    }
    if (method && typeof method === 'object') {
      const m = method as Record<string, unknown>
      const parsedParams = normalizeMethodParameters(m.parameters ?? m.parametros).map((paramName) => ({
        name: paramName,
      }))
      return {
        name: String(m.name ?? m.nombre ?? 'metodo'),
        returnType: String(m.returnType ?? m.return_type ?? m.tipo_retorno ?? 'void'),
        parameters: parsedParams,
      }
    }
    return { name: 'metodo', returnType: 'void', parameters: [] }
  })
}

function buildFlowNodeFromEventPayload(
  payload: Record<string, unknown>,
  currentNodesCount: number,
): ClassFlowNode {
  const rawNode = (payload.node ?? payload.clase ?? payload) as Record<string, unknown>
  const rawData = (rawNode.data ?? rawNode) as Record<string, unknown>

  const id = String(rawNode.id ?? payload.node_id ?? payload.class_id ?? `class-${Date.now()}`)
  const name = String(rawData.name ?? rawData.nombre ?? 'Clase')
  const attributes = normalizeClassAttributes(rawData.attributes ?? rawData.atributos)
  const methods = normalizeClassMethods(rawData.methods ?? rawData.metodos)

  const nodeData: ClassNodeData = {
    ...rawData,
    name,
    attributes,
    methods,
  }

  let position = { x: 120 + currentNodesCount * 44, y: 110 + currentNodesCount * 34 }
  if (rawNode.position && typeof rawNode.position === 'object') {
    const p = rawNode.position as { x?: number; y?: number }
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      position = { x: p.x, y: p.y }
    }
  } else if (typeof rawNode.x === 'number' && typeof rawNode.y === 'number') {
    position = { x: rawNode.x, y: rawNode.y }
  } else if (typeof payload.x === 'number' && typeof payload.y === 'number') {
    position = { x: payload.x, y: payload.y }
  }

  return {
    id,
    type: 'classNode',
    position,
    style: getClassNodeStyle(nodeData, rawNode.style as ClassFlowNode['style']),
    data: nodeData,
  }
}

function buildFlowEdgeFromEventPayload(
  payload: Record<string, unknown>,
): ClassFlowEdge {
  const rawEdge = (payload.edge ?? payload.relacion ?? payload) as Record<string, unknown>
  const rawData = (rawEdge.data ?? rawEdge) as Record<string, unknown>

  const id = String(rawEdge.id ?? payload.relation_id ?? payload.edge_id ?? `rel-${Date.now()}`)
  const source = String(rawEdge.source ?? rawData.sourceClassId ?? payload.source_id ?? payload.source ?? '')
  const target = String(rawEdge.target ?? rawData.targetClassId ?? payload.target_id ?? payload.target ?? '')
  const relationType = normalizeRelationType(
    rawData.relationType ?? rawData.relation_type ?? payload.relation_type ?? payload.tipo
  )
  const sourceCardinality = normalizeCardinality(
    rawData.sourceCardinality ?? rawData.source_cardinality ?? payload.source_cardinality ?? '1..*'
  )
  const targetCardinality = normalizeCardinality(
    rawData.targetCardinality ?? rawData.target_cardinality ?? payload.target_cardinality ?? '1'
  )

  const isRecursive = Boolean(source && target && source === target)
  const handles = isRecursive ? getRecursiveHandles('right', 'top') : { sourceHandle: 'right', targetHandle: 'left' }
  const sourceHandle = String(rawEdge.sourceHandle ?? handles.sourceHandle)
  const targetHandle = String(rawEdge.targetHandle ?? handles.targetHandle)

  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    data: buildRelationData({
      associationClassId: (rawData.associationClassId ?? payload.associationClassId) as string | undefined,
      createdAt: (rawData.createdAt ?? payload.createdAt) as string | undefined,
      createdBy: (rawData.createdBy ?? payload.actor ?? payload.createdBy) as string | undefined,
      relationId: id,
      relationType,
      sourceClassId: source,
      sourceCardinality,
      targetClassId: target,
      targetCardinality,
    }),
    ...getRelationEdgeProps(relationType),
  }
}

export function EstudiantePage({
  theme,
  userProfile,
  onBack,
  onProfile,
  onToggleTheme,
  onVersionHistory,
}: EstudiantePageProps) {
  const [view, setView] = useState<StudentView>('projects')
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [diagramas, setDiagramas] = useState<DiagramaResponse[]>([])
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null)
  const [selectedDiagrama, setSelectedDiagrama] = useState<DiagramaResponse | null>(null)
  const [miembros, setMiembros] = useState<ProyectoMiembro[]>([])
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, number>>({})
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState(3)
  const [nodes, setNodes, onNodesChange] = useNodesState<ClassFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ClassFlowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [diagramName, setDiagramName] = useState('')
  const [newDiagramName, setNewDiagramName] = useState('Diagrama principal')
  const [newClassName, setNewClassName] = useState('Cliente')
  const [newAttributeName, setNewAttributeName] = useState('id')
  const [newAttributeType, setNewAttributeType] = useState('BIGINT')
  const [newMethodName, setNewMethodName] = useState('registrar')
  const [newMethodParameters, setNewMethodParameters] = useState('')
  const [newMethodReturnType, setNewMethodReturnType] = useState('void')
  const [newProjectName, setNewProjectName] = useState('Mi nuevo proyecto')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [featureTab, setFeatureTab] = useState<FeatureTab>('attributes')
  const [selectedRelationType, setSelectedRelationType] = useState<RelationType>('association')
  const [relationSourceId, setRelationSourceId] = useState('')
  const [relationTargetId, setRelationTargetId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isXmiBusy, setIsXmiBusy] = useState(false)
  const [isMembersLoading, setIsMembersLoading] = useState(false)
  const [isMembersSaving, setIsMembersSaving] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 980)
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false)
  const [isRelationToolboxOpen, setIsRelationToolboxOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 980)
  const [isAssistantVisible, setIsAssistantVisible] = useState(() => typeof window !== 'undefined' && window.innerWidth > 980)
  const [activeRealtimeUsers, setActiveRealtimeUsers] = useState<RealtimeDiagramUser[]>([])
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [membersMessage, setMembersMessage] = useState('')
  const [membersError, setMembersError] = useState('')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteTargetProyecto, setInviteTargetProyecto] = useState<{ id: number; nombre: string } | null>(null)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
  const [urlInviteCode, setUrlInviteCode] = useState('')
  const setDiagramState = useDiagramStore((state) => state.setDiagramState)
  const addStoredRelation = useDiagramStore((state) => state.addRelation)
  const updateStoredRelation = useDiagramStore((state) => state.updateRelation)
  const removeStoredRelation = useDiagramStore((state) => state.removeRelation)
  const setStoredSelectedRelationId = useDiagramStore((state) => state.setSelectedRelationId)
  const setNodeCollaborator = useDiagramStore((state) => state.setNodeCollaborator)
  const clearNodeCollaborator = useDiagramStore((state) => state.clearNodeCollaborator)
  const collaboratorTimeoutsRef = useRef<Record<string, number>>({})
  const isCommentsOpen = useCommentStore((state) => state.isOpen)
  const setIsCommentsOpen = useCommentStore((state) => state.setIsOpen)
  const toggleCommentsDrawer = () => setIsCommentsOpen(!isCommentsOpen)
  const setComentarios = useCommentStore((state) => state.setComentarios)
  const addComentario = useCommentStore((state) => state.addComentario)
  const updateComentario = useCommentStore((state) => state.updateComentario)
  const removeComentario = useCommentStore((state) => state.removeComentario)
  const totalPendingComments = useCommentStore((state) => state.totalPendingCount)
  const lastRealtimeMoveAtRef = useRef(0)
  const nodesRef = useRef<ClassFlowNode[]>([])
  const edgesRef = useRef<ClassFlowEdge[]>([])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )
  const miembroActual = useMemo(
    () => miembros.find((miembro) => miembro.usuario_codigo === userProfile?.codigo) ?? null,
    [miembros, userProfile?.codigo],
  )
  const canEditDiagram = miembroActual?.id_rol === 2 || miembroActual?.id_rol === 3
  const canManageMembers = miembroActual?.id_rol === 2
  const canViewOnly = miembroActual?.id_rol === 4
  const onboardingStorageKey = useMemo(() => {
    const userIdentity = userProfile?.codigo || userProfile?.email
    return userIdentity ? `drawschema:onboarding:student:v1:${userIdentity}` : null
  }, [userProfile?.codigo, userProfile?.email])

  const finishOnboarding = useCallback(() => {
    if (onboardingStorageKey) {
      localStorage.setItem(onboardingStorageKey, 'completed')
    }
    setIsOnboardingOpen(false)
  }, [onboardingStorageKey])

  const restartOnboarding = useCallback(() => {
    setView('projects')
    setIsSidebarCollapsed(false)
    window.requestAnimationFrame(() => setIsOnboardingOpen(true))
  }, [])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    if (!onboardingStorageKey || view !== 'projects') {
      return
    }

    if (localStorage.getItem(onboardingStorageKey) !== 'completed') {
      const frameId = window.requestAnimationFrame(() => setIsOnboardingOpen(true))
      return () => window.cancelAnimationFrame(frameId)
    }
  }, [onboardingStorageKey, view])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('invitacion') || params.get('codigo')
      if (code) {
        setUrlInviteCode(code.trim().toUpperCase())
        setIsJoinModalOpen(true)
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, '', cleanUrl)
      }
    } catch {
      // Ignore URL parsing error
    }
  }, [])

  function denyDiagramEdit() {
    setError('No tienes permiso para editar este diagrama.')
  }

  function denyMemberManagement() {
    setMembersError('No tienes permiso para gestionar colaboradores')
  }

  function upsertRealtimeUser(user?: RealtimeDiagramUser) {
    if (!user?.codigo) {
      return
    }

    setActiveRealtimeUsers((current) => {
      const exists = current.some((item) => item.codigo === user.codigo)
      return exists ? current.map((item) => (item.codigo === user.codigo ? { ...item, ...user } : item)) : [...current, user]
    })
  }

  function removeRealtimeUser(user?: RealtimeDiagramUser) {
    if (!user?.codigo) {
      return
    }

    setActiveRealtimeUsers((current) => current.filter((item) => item.codigo !== user.codigo))
  }

  function applyRealtimeEvent(event: RealtimeDiagramEvent) {
    const payload = (event.payload ?? {}) as Record<string, unknown>
    const eventUser = event.user ?? (payload.user as RealtimeDiagramUser | undefined)

    const rawType = String(event.type || event.action || (event as any).event || '').trim()
    const upperType = rawType.toUpperCase()
    const lowerType = rawType.toLowerCase()

    const eventActor = String(
      event.actor ||
      (payload as any).actor ||
      eventUser?.nombre ||
      eventUser?.codigo ||
      ''
    ).trim()

    const isLocalUser = Boolean(
      (eventUser?.codigo && userProfile?.codigo && eventUser.codigo === userProfile.codigo) ||
      (eventActor && userProfile?.codigo && eventActor === userProfile.codigo)
    )

    const notifyActor = (actionText: string) => {
      if (isLocalUser) return
      if (eventActor) {
        Toast('Acción de ' + eventActor + ': ' + actionText)
      }
    }

    if (lowerType === 'connection_ack') {
      const users = payload.users
      if (Array.isArray(users)) {
        setActiveRealtimeUsers(
          users
            .filter((user): user is RealtimeDiagramUser => Boolean(user && typeof user === 'object'))
            .filter((user) => user.codigo !== userProfile?.codigo),
        )
        return
      }

      upsertRealtimeUser(eventUser)
      return
    }

    if (lowerType === 'user_joined') {
      upsertRealtimeUser(eventUser)
      return
    }

    if (lowerType === 'user_left') {
      removeRealtimeUser(eventUser)
      return
    }

    if (eventUser?.codigo && eventUser.codigo === userProfile?.codigo && lowerType !== 'class_created' && upperType !== 'CLASS_CREATED') {
      // Allow collaborative state sync even if event user echoes
    }

    if (lowerType === 'event_rejected') {
      setError('No tienes permiso para realizar esa accion en tiempo real')
      return
    }

    // 1. CLASS_CREATED
    if (upperType === 'CLASS_CREATED' || lowerType === 'class_created') {
      const nuevoNodo = buildFlowNodeFromEventPayload(payload, nodesRef.current.length)
      if (!nuevoNodo.id) {
        return
      }

      setNodes((current) => {
        const exists = current.some((node) => node.id === nuevoNodo.id)
        const nextNodes = exists
          ? current.map((node) =>
              node.id === nuevoNodo.id
                ? {
                    ...node,
                    ...nuevoNodo,
                    position: node.position ?? nuevoNodo.position,
                    data: { ...node.data, ...nuevoNodo.data },
                    style: getClassNodeStyle(nuevoNodo.data, nuevoNodo.style, nuevoNodo.width, nuevoNodo.height),
                  }
                : node,
            )
          : [...current, nuevoNodo]
        queueMicrotask(() => setDiagramState(nextNodes, edgesRef.current))
        return nextNodes
      })

      notifyActor('Clase creada')
      return
    }

    // 2. CLASS_UPDATED
    if (upperType === 'CLASS_UPDATED' || lowerType === 'class_updated') {
      const targetId = String(
        payload.class_id ??
        payload.node_id ??
        payload.id ??
        (payload.node as any)?.id ??
        (payload.clase as any)?.id ??
        ''
      )

      if (!targetId && !payload.node) {
        return
      }

      setNodes((current) => {
        const exists = current.some((node) => node.id === targetId || node.id === (payload.node as any)?.id)
        if (!exists && payload.node) {
          const newNode = buildFlowNodeFromEventPayload(payload, current.length)
          const nextNodes = [...current, newNode]
          queueMicrotask(() => setDiagramState(nextNodes, edgesRef.current))
          return nextNodes
        }

        const rawData = (payload.node ? (payload.node as any).data : (payload.data ?? payload)) as Record<string, unknown>
        const nextNodes = current.map((node) => {
          if (node.id !== targetId && node.id !== (payload.node as any)?.id) {
            return node
          }

          const nextAttributes =
            rawData.attributes || rawData.atributos
              ? normalizeClassAttributes(rawData.attributes || rawData.atributos)
              : node.data.attributes

          const nextMethods =
            rawData.methods || rawData.metodos
              ? normalizeClassMethods(rawData.methods || rawData.metodos)
              : node.data.methods

          const nextName = String(rawData.name ?? rawData.nombre ?? node.data.name)

          const nextData: ClassNodeData = {
            ...node.data,
            ...rawData,
            name: nextName,
            attributes: nextAttributes,
            methods: nextMethods,
          }

          return {
            ...node,
            ...(payload.node as any),
            data: nextData,
            style: getClassNodeStyle(
              nextData,
              (payload.node as any)?.style ?? node.style,
              (payload.node as any)?.width ?? node.width,
              (payload.node as any)?.height ?? node.height,
            ),
          }
        })

        queueMicrotask(() => setDiagramState(nextNodes, edgesRef.current))
        return nextNodes
      })

      notifyActor('Clase actualizada')
      return
    }

    // 3. CLASS_MOVED
    if (upperType === 'CLASS_MOVED' || lowerType === 'class_moved') {
      const classId = String(
        payload.class_id ??
        payload.clase_id ??
        payload.node_id ??
        payload.id ??
        ''
      )
      const newX = Number(
        payload.position
          ? (payload.position as any).x
          : (payload.x ?? (payload.position as any)?.x)
      )
      const newY = Number(
        payload.position
          ? (payload.position as any).y
          : (payload.y ?? (payload.position as any)?.y)
      )

      if (!classId || Number.isNaN(newX) || Number.isNaN(newY)) {
        return
      }

      // Si el movimiento proviene del mismo usuario local, ignoramos el echo para no causar saltos
      if (isLocalUser) {
        return
      }

      if (eventUser || eventActor) {
        setNodeCollaborator(classId, {
          codigo: eventUser?.codigo ?? eventActor,
          nombre: eventUser?.nombre ?? eventActor,
          email: eventUser?.email,
          lastActiveAt: Date.now(),
        })

        if (collaboratorTimeoutsRef.current[classId]) {
          window.clearTimeout(collaboratorTimeoutsRef.current[classId])
        }

        collaboratorTimeoutsRef.current[classId] = window.setTimeout(() => {
          clearNodeCollaborator(classId)
        }, 5000)
      }

      setNodes((current) => {
        const nextNodes = current.map((node) =>
          node.id === classId ? { ...node, position: { x: newX, y: newY } } : node,
        )
        queueMicrotask(() => setDiagramState(nextNodes, edgesRef.current))
        return nextNodes
      })

      if (eventActor && /ia|ai|asistente|agente/i.test(eventActor)) {
        notifyActor('Clase movida')
      }
      return
    }

    // 4. CLASS_DELETED
    if (upperType === 'CLASS_DELETED' || lowerType === 'class_deleted') {
      const classId = String(payload.class_id ?? payload.node_id ?? payload.id ?? '')
      if (!classId) {
        return
      }

      if (selectedNodeId === classId) {
        setSelectedNodeId('')
      }

      setNodes((currentNodes) => {
        const nextNodes = currentNodes.filter((node) => node.id !== classId)
        setEdges((currentEdges) => {
          const nextEdges = currentEdges.filter(
            (edge) =>
              edge.source !== classId &&
              edge.target !== classId &&
              edge.data?.associationClassId !== classId,
          )
          queueMicrotask(() => setDiagramState(nextNodes, nextEdges))
          return nextEdges
        })
        return nextNodes
      })

      notifyActor('Clase eliminada')
      return
    }

    // 5. RELATION_CREATED
    if (upperType === 'RELATION_CREATED' || lowerType === 'relation_created') {
      const nuevoEdge = buildFlowEdgeFromEventPayload(payload)
      if (!nuevoEdge.id || !nuevoEdge.source || !nuevoEdge.target) {
        return
      }

      setEdges((current) => {
        const exists = current.some((edge) => edge.id === nuevoEdge.id)
        const nextEdges = exists
          ? current.map((edge) => (edge.id === nuevoEdge.id ? nuevoEdge : edge))
          : [...current, nuevoEdge]
        queueMicrotask(() => setDiagramState(nodesRef.current, nextEdges))
        return nextEdges
      })

      notifyActor('Relación creada')
      return
    }

    // 6. RELATION_UPDATED
    if (upperType === 'RELATION_UPDATED' || lowerType === 'relation_updated') {
      const relationId = String(
        payload.relation_id ??
        payload.edge_id ??
        payload.id ??
        (payload.edge as any)?.id ??
        ''
      )

      if (!relationId) {
        return
      }

      setEdges((current) => {
        const nextEdges = current.map((edge) => {
          if (edge.id !== relationId) {
            return edge
          }

          const rawData = (payload.edge ? (payload.edge as any).data : (payload.data ?? payload)) as Record<string, unknown>
          const relationType = normalizeRelationType(
            rawData.relationType ?? rawData.relation_type ?? edge.data?.relationType,
          )
          const sourceCardinality = normalizeCardinality(
            rawData.sourceCardinality ?? rawData.source_cardinality ?? edge.data?.sourceCardinality,
          )
          const targetCardinality = normalizeCardinality(
            rawData.targetCardinality ?? rawData.target_cardinality ?? edge.data?.targetCardinality,
          )
          const name = String(rawData.name ?? rawData.label ?? edge.data?.name ?? '')
          const {
            sourceCardinality: _sourceCardinality,
            targetCardinality: _targetCardinality,
            cardinality: _legacyCardinality,
            ...mergedData
          } = { ...edge.data, ...rawData }

          const nextData: UmlRelationData = {
            ...mergedData,
            id: relationId,
            sourceClassId: String(rawData.sourceClassId ?? edge.data?.sourceClassId ?? edge.source),
            targetClassId: String(rawData.targetClassId ?? edge.data?.targetClassId ?? edge.target),
            createdAt: String(rawData.createdAt ?? edge.data?.createdAt ?? new Date().toISOString()),
            relationType,
            ...(relationUsesCardinality(relationType)
              ? { sourceCardinality, targetCardinality }
              : {}),
            name,
          }

          return {
            ...edge,
            ...(payload.edge as any),
            data: nextData,
            ...getRelationEdgeProps(relationType),
          }
        })

        queueMicrotask(() => setDiagramState(nodesRef.current, nextEdges))
        return nextEdges
      })

      notifyActor('Relación actualizada')
      return
    }

    // 7. RELATION_DELETED
    if (upperType === 'RELATION_DELETED' || lowerType === 'relation_deleted') {
      const relationId = String(
        payload.relation_id ??
        payload.edge_id ??
        payload.id ??
        (payload.edge as any)?.id ??
        ''
      )

      if (!relationId) {
        return
      }

      if (selectedEdgeId === relationId) {
        setSelectedEdgeId('')
        setStoredSelectedRelationId('')
      }

      setEdges((current) => {
        const nextEdges = current.filter((edge) => edge.id !== relationId)
        queueMicrotask(() => setDiagramState(nodesRef.current, nextEdges))
        return nextEdges
      })

      notifyActor('Relación eliminada')
      return
    }

    if (lowerType === 'diagram_reloaded') {
      const content = payload.contenido as DiagramContent | undefined
      if (!content) {
        return
      }

      const nextNodes = toFlowNodes(content.nodes)
      const nextEdges = toFlowEdges(content.edges)
      setNodes(nextNodes)
      setEdges(nextEdges)
      setDiagramState(nextNodes, nextEdges)
      return
    }

    if (lowerType === 'comment_created') {
      const comment = (payload.comentario ?? payload.comment ?? payload) as Comentario
      if (comment?.id) {
        addComentario(comment)
      }
      return
    }

    if (lowerType === 'comment_updated' || lowerType === 'comment_resolved') {
      const comment = (payload.comentario ?? payload.comment ?? payload) as Comentario
      if (comment?.id) {
        updateComentario(comment)
      }
      return
    }

    if (lowerType === 'comment_deleted') {
      const commentId = Number(payload.comentario_id ?? payload.comment_id ?? payload.id)
      if (commentId) {
        removeComentario(commentId)
      }
      return
    }
  }

  useEffect(() => {
    if (nodes.length === 0) {
      setRelationSourceId('')
      setRelationTargetId('')
      return
    }

    setRelationSourceId((current) => current || nodes[0].id)
    setRelationTargetId((current) => current || nodes[1]?.id || nodes[0].id)
  }, [nodes])

  useEffect(() => {
    if (!selectedDiagrama?.id) {
      disconnectDiagramSocket()
      setActiveRealtimeUsers([])
      setRealtimeStatus('disconnected')
      setComentarios([])
      return
    }

    setRealtimeStatus('connecting')
    setActiveRealtimeUsers([])
    connectDiagramSocket(selectedDiagrama.id, {
      onOpen: () => setRealtimeStatus('connected'),
      onClose: () => setRealtimeStatus('disconnected'),
      onEvent: applyRealtimeEvent,
      onReconnectFailed: () => {
        setRealtimeStatus('disconnected')
        setError('Tiempo real desconectado')
      },
    })

    return () => {
      disconnectDiagramSocket()
    }
  }, [selectedDiagrama?.id])

  const loadProyectos = useCallback(async () => {
    if (!userProfile?.codigo) {
      setError('No se encontro el codigo del usuario en la sesion.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const data = await listarProyectosPorUsuario(userProfile.codigo)
      setProyectos(data)
      const pendingOpen = sessionStorage.getItem('drawschema:open-diagram')

      if (pendingOpen) {
        sessionStorage.removeItem('drawschema:open-diagram')
        const parsed = JSON.parse(pendingOpen) as { proyectoId?: number; diagramaId?: number }
        const targetProject = data.find((proyecto) => proyecto.id === parsed.proyectoId)

        if (targetProject && parsed.diagramaId) {
          await openProyecto(targetProject, parsed.diagramaId)
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar tus proyectos')
    } finally {
      setIsLoading(false)
    }
  }, [userProfile?.codigo])

  const loadMiembros = useCallback(async (proyectoId: number) => {
    setIsMembersLoading(true)
    setMembersError('')

    try {
      const data = await listarMiembros(proyectoId)

      setMiembros(data)
      setMemberRoleDrafts(
        data.reduce<Record<string, number>>((drafts, miembro) => {
          drafts[miembro.usuario_codigo] = miembro.id_rol
          return drafts
        }, {}),
      )
    } catch (loadError) {
      setMembersError(getCollaboratorError(loadError, 'No se pudieron cargar los colaboradores'))
    } finally {
      setIsMembersLoading(false)
    }
  }, [])

  async function openCollaborators(proyecto: Proyecto) {
    setSelectedProyecto(proyecto)
    setSelectedDiagrama(null)
    setNodes([])
    setEdges([])
    setDiagramas([])
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setStoredSelectedRelationId('')
    setMembersMessage('')
    setMembersError('')
    await loadMiembros(proyecto.id)
  }

  async function openProyecto(proyecto: Proyecto, preferredDiagramaId?: number) {
    setSelectedProyecto(proyecto)
    setSelectedDiagrama(null)
    setMiembros([])
    setMemberRoleDrafts({})
    setNewMemberEmail('')
    setNewMemberRole(3)
    setNodes([])
    setEdges([])
    setDiagramas([])
    setSelectedNodeId('')
    setView('diagrammer')
    setMessage('')
    setError('')
    setMembersMessage('')
    setMembersError('')

    try {
      const [data] = await Promise.all([
        listarDiagramasPorProyecto(proyecto.id),
        loadMiembros(proyecto.id),
      ])
      setDiagramas(data)

      if (data.length > 0) {
        const targetDiagrama = data.find((diagrama) => diagrama.id === preferredDiagramaId) ?? data[0]
        await openDiagrama(targetDiagrama.id)
      } else {
        try {
          const autoDiagrama = await crearDiagrama({
            id_proyecto: proyecto.id,
            nombre: 'Diagrama principal',
            contenido: emptyContent,
          })
          setDiagramas([autoDiagrama])
          await openDiagrama(autoDiagrama.id)
        } catch (autoErr) {
          console.warn('No se pudo crear diagrama inicial automático:', autoErr)
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los diagramas')
    }
  }

  async function addMiembro() {
    const usuarioEmail = newMemberEmail.trim().toLowerCase()

    if (!selectedProyecto) {
      setMembersError('Abre un proyecto antes de agregar colaboradores.')
      return
    }

    if (!canManageMembers) {
      denyMemberManagement()
      return
    }

    if (!usuarioEmail) {
      setMembersError('Escribe el correo electronico del usuario.')
      return
    }

    if (!usuarioEmail.includes('@')) {
      setMembersError('Escribe un correo electronico valido.')
      return
    }

    setIsMembersSaving(true)
    setMembersError('')
    setMembersMessage('')

    try {
      const usuarios = await listarUsuarios()
      const usuario = usuarios.find((item) => item.email.trim().toLowerCase() === usuarioEmail)

      if (!usuario) {
        setMembersError('No se encontro un usuario registrado con ese correo.')
        return
      }

      await agregarMiembro(selectedProyecto.id, {
        usuario_codigo: usuario.codigo,
        id_rol: newMemberRole,
      })
      setNewMemberEmail('')
      setNewMemberRole(3)
      setMembersMessage('Colaborador agregado.')
      await loadMiembros(selectedProyecto.id)
    } catch (memberError) {
      setMembersError(getCollaboratorError(memberError, 'No se pudo agregar el colaborador'))
    } finally {
      setIsMembersSaving(false)
    }
  }

  async function saveMemberRole(miembro: ProyectoMiembro) {
    if (!selectedProyecto) {
      return
    }

    if (!canManageMembers) {
      denyMemberManagement()
      return
    }

    const nextRole = memberRoleDrafts[miembro.usuario_codigo]

    if (!nextRole) {
      setMembersError('Selecciona un rol valido.')
      return
    }

    setIsMembersSaving(true)
    setMembersError('')
    setMembersMessage('')

    try {
      await actualizarMiembro(selectedProyecto.id, miembro.usuario_codigo, {
        id_rol: nextRole,
      })
      setMembersMessage('Rol actualizado.')
      await loadMiembros(selectedProyecto.id)
    } catch (memberError) {
      setMembersError(getCollaboratorError(memberError, 'No se pudo actualizar el rol'))
    } finally {
      setIsMembersSaving(false)
    }
  }

  async function removeMiembro(miembro: ProyectoMiembro) {
    if (!selectedProyecto) {
      return
    }

    if (!canManageMembers) {
      denyMemberManagement()
      return
    }

    const confirmed = window.confirm(`Quitar al colaborador ${miembro.usuario_codigo} de este proyecto?`)

    if (!confirmed) {
      return
    }

    setIsMembersSaving(true)
    setMembersError('')
    setMembersMessage('')

    try {
      await quitarMiembro(selectedProyecto.id, miembro.usuario_codigo)
      setMembersMessage('Colaborador quitado.')
      await loadMiembros(selectedProyecto.id)
    } catch (memberError) {
      setMembersError(getCollaboratorError(memberError, 'No se pudo quitar el colaborador'))
    } finally {
      setIsMembersSaving(false)
    }
  }

  async function openDiagrama(diagramaId: number) {
    setError('')
    setMessage('')

    try {
      const diagrama = await abrirDiagrama(diagramaId)
      const content = normalizeContent(diagrama.contenido)

      setSelectedDiagrama(diagrama)
      setDiagramName(diagrama.nombre)
      const nextNodes = toFlowNodes(content.nodes)
      const nextEdges = toFlowEdges(content.edges)

      setNodes(nextNodes)
      setEdges(nextEdges)
      setDiagramState(nextNodes, nextEdges)
      setSelectedNodeId('')
      setSelectedEdgeId('')
      setStoredSelectedRelationId('')

      try {
        const comentarios = await listarComentarios(diagramaId)
        setComentarios(comentarios)
      } catch {
        // No bloquear la apertura si fallan los comentarios
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo abrir el diagrama')
    }
  }

  function handleAiDiagramUpdated(diagrama: DiagramaResponse) {
    const content = normalizeContent(diagrama.contenido)
    const nextNodes = toFlowNodes(content.nodes)
    const nextEdges = toFlowEdges(content.edges)

    setSelectedDiagrama(diagrama)
    setDiagramName(diagrama.nombre)
    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    setDiagramas((current) =>
      current.map((currentDiagrama) => (currentDiagrama.id === diagrama.id ? diagrama : currentDiagrama)),
    )
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setStoredSelectedRelationId('')
    setMessage('El agente IA actualizo el diagrama.')
  }

  async function createProyecto() {
    if (!userProfile?.codigo) {
      setError('No se encontro el codigo del usuario en la sesion.')
      return
    }

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const proyecto = await crearProyecto({
        nombre: newProjectName,
        descripcion: newProjectDescription,
        usuario_codigo: userProfile.codigo,
        id_rol: 2,
      })

      setProyectos((current) => [proyecto, ...current])
      setNewProjectName('Mi nuevo proyecto')
      setNewProjectDescription('')
      await openProyecto(proyecto)
      setMessage('Proyecto creado correctamente.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo crear el proyecto')
    } finally {
      setIsSaving(false)
    }
  }

  async function createDiagrama() {
    if (!selectedProyecto) {
      setError('Selecciona un proyecto antes de crear un diagrama.')
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const diagrama = await crearDiagrama({
        id_proyecto: selectedProyecto.id,
        nombre: newDiagramName,
        contenido: emptyContent,
      })

      setDiagramas((current) => [diagrama, ...current])
      setNewDiagramName('Diagrama principal')
      await openDiagrama(diagrama.id)
      setMessage('Diagrama creado correctamente.')
    } catch (saveError) {
      setError(getProjectActionError(saveError, 'No se pudo crear el diagrama'))
    } finally {
      setIsSaving(false)
    }
  }

  function getXmiDiagramName(file: File) {
    return file.name.replace(/\.(xmi|xml)$/i, '').trim() || 'Diagrama importado'
  }

  async function importXmiFile(file: File) {
    if (!selectedProyecto) {
      setError('Selecciona un proyecto antes de importar XMI.')
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    setIsXmiBusy(true)
    setError('')
    setMessage('')

    try {
      const diagrama = await importarXmiEnProyecto(selectedProyecto.id, file, getXmiDiagramName(file))

      setDiagramas((current) => [diagrama, ...current.filter((item) => item.id !== diagrama.id)])
      await openDiagrama(diagrama.id)
      setMessage('Archivo XMI importado correctamente.')
    } catch (importError) {
      setError(getProjectActionError(importError, 'No se pudo importar el archivo XMI'))
    } finally {
      setIsXmiBusy(false)
    }
  }

  async function exportSelectedXmi() {
    if (!selectedDiagrama) {
      setError('Abre un diagrama antes de exportar XMI.')
      return
    }

    setIsXmiBusy(true)
    setError('')
    setMessage('')

    try {
      const blob = await exportarDiagramaXmi(selectedDiagrama.id)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')

      anchor.href = url
      anchor.download = `${selectedDiagrama.nombre.replace(/\s+/g, '_') || 'diagrama'}.xmi`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)

      setMessage('Archivo XMI exportado correctamente.')
    } catch (exportError) {
      setError(getProjectActionError(exportError, 'No se pudo exportar el archivo XMI'))
    } finally {
      setIsXmiBusy(false)
    }
  }

  async function addClass() {
    let currentDiagrama = selectedDiagrama
    if (!currentDiagrama) {
      if (!selectedProyecto) {
        setError('Crea o abre un diagrama antes de agregar clases.')
        return
      }

      if (!canEditDiagram) {
        denyDiagramEdit()
        return
      }

      try {
        setIsSaving(true)
        const autoDiag = await crearDiagrama({
          id_proyecto: selectedProyecto.id,
          nombre: newDiagramName.trim() || 'Diagrama principal',
          contenido: emptyContent,
        })
        setDiagramas((curr) => [autoDiag, ...curr])
        currentDiagrama = autoDiag
        setSelectedDiagrama(autoDiag)
      } catch {
        setError('Crea o abre un diagrama antes de agregar clases.')
        setIsSaving(false)
        return
      }
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const classId = `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const hasAttribute = newAttributeName.trim().length > 0
      const diagrama = await agregarClase(currentDiagrama.id, {
        id: classId,
        name: newClassName,
        x: 120 + nodes.length * 44,
        y: 110 + nodes.length * 34,
        attributes: hasAttribute
          ? [
              {
                name: newAttributeName,
                type: newAttributeType,
                primaryKey: newAttributeName.toLowerCase() === 'id',
                nullable: false,
              },
            ]
          : [],
        methods: [],
        autor_codigo: userProfile?.codigo,
      })

      const content = normalizeContent(diagrama.contenido)
      const nextNodes = toFlowNodes(content.nodes)
      const nextEdges = toFlowEdges(content.edges)
      const createdNode = nextNodes.find((node) => !nodes.some((currentNode) => currentNode.id === node.id))

      setSelectedDiagrama(diagrama)
      setNodes(nextNodes)
      setEdges(nextEdges)
      setDiagramState(nextNodes, nextEdges)
      if (createdNode) {
        sendRealtimeEvent('class_created', { node: createdNode })
      }
      setNewClassName('Cliente')
      setNewAttributeName('id')
      setNewAttributeType('BIGINT')
      setIsCreateClassOpen(false)
      setMessage('Clase agregada al diagrama.')
    } catch (saveError) {
      setError(getProjectActionError(saveError, 'No se pudo agregar la clase'))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveSelectedClass(nextData: ClassNodeData) {
    if (!selectedDiagrama || !selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const nextNodes = nodes.map((node) =>
      node.id === selectedNode.id
        ? {
            ...node,
            style: getClassNodeStyle(nextData, node.style, node.width, node.height),
            data: nextData,
          }
        : node,
    )

    await saveDiagrama(nextNodes, edges)
    const updatedNode = nextNodes.find((node) => node.id === selectedNode.id)
    if (updatedNode) {
      sendRealtimeEvent('class_updated', { node: updatedNode })
    }
    setSelectedNodeId(selectedNode.id)
  }

  async function saveDiagrama(nextNodes = nodes, nextEdges = edges, options?: { broadcastSaved?: boolean }) {
    if (!selectedDiagrama) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const diagrama = await guardarDiagrama(selectedDiagrama.id, {
        nombre: diagramName,
        contenido: toDiagramContent(nextNodes, nextEdges),
        autor_codigo: userProfile?.codigo,
      })
      const content = normalizeContent(diagrama.contenido)
      const persistedNodes = toFlowNodes(content.nodes)
      const persistedEdges = toFlowEdges(content.edges)

      setSelectedDiagrama(diagrama)
      setNodes(persistedNodes)
      setEdges(persistedEdges)
      setDiagramState(persistedNodes, persistedEdges)
      setDiagramas((current) => current.map((item) => (item.id === diagrama.id ? diagrama : item)))
      if (options?.broadcastSaved) {
        sendRealtimeEvent('diagram_saved', {
          diagrama_id: diagrama.id,
          nombre: diagrama.nombre,
          version: diagrama.version,
        })
      }
      setMessage('Diagrama guardado correctamente.')
    } catch (saveError) {
      setError(getProjectActionError(saveError, 'No se pudo guardar el diagrama'))
    } finally {
      setIsSaving(false)
    }
  }

  const connectNodes: OnConnect = async (connection: Connection) => {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    if (!connection.source || !connection.target) {
      setError('Selecciona una clase origen y una clase destino para crear la relacion.')
      return
    }

    const isRecursiveRelation = connection.source === connection.target
    const recursiveHandles = isRecursiveRelation
      ? getRecursiveHandles(connection.sourceHandle, connection.targetHandle)
      : {
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        }
    const relationId = `rel-${connection.source}-${connection.target}-${Date.now()}`
    const defaultCardinalities = getDefaultRelationCardinalities(selectedRelationType)
    const validation = validateRelation(
      {
        id: relationId,
        sourceClassId: connection.source,
        targetClassId: connection.target,
        sourceHandle: recursiveHandles.sourceHandle,
        targetHandle: recursiveHandles.targetHandle,
        relationType: selectedRelationType,
        ...defaultCardinalities,
        createdBy: userProfile?.codigo,
      },
      nodes,
      edges,
    )

    if (!validation.valid) {
      setError(validation.message ?? 'La relacion no es valida.')
      return
    }

    const associationClassNode =
      selectedRelationType === 'associationClass'
        ? createAssociationClassNode(relationId, connection.source, connection.target, nodes)
        : null
    const nextNodes = associationClassNode ? [...nodes, associationClassNode] : nodes

    const nextEdges = addEdge(
      {
        ...connection,
        sourceHandle: recursiveHandles.sourceHandle,
        targetHandle: recursiveHandles.targetHandle,
        id: relationId,
        data: buildRelationData({
          associationClassId: associationClassNode?.id,
          createdBy: userProfile?.codigo,
          relationId,
          relationType: selectedRelationType,
          sourceClassId: connection.source,
          sourceCardinality: defaultCardinalities.sourceCardinality,
          targetClassId: connection.target,
          targetCardinality: defaultCardinalities.targetCardinality,
        }),
        ...getRelationEdgeProps(selectedRelationType),
      },
      edges,
    )

    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    setSelectedEdgeId(nextEdges.at(-1)?.id ?? '')
    setStoredSelectedRelationId(nextEdges.at(-1)?.id ?? '')
    addStoredRelation(nextEdges.at(-1) as ClassFlowEdge, createDiagramEvent('RELATION_CREATED', relationId, userProfile?.codigo))
    setMessage(
      selectedRelationType === 'associationClass'
        ? 'Relacion creada con clase intermedia.'
        : 'Relacion creada y guardada.',
    )
    await saveDiagrama(nextNodes, nextEdges)
    if (associationClassNode) {
      sendRealtimeEvent('class_created', { node: associationClassNode })
    }
    const createdRelation = nextEdges.find((edge) => edge.id === relationId)
    if (createdRelation) {
      sendRealtimeEvent('relation_created', { edge: createdRelation })
    }
  }

  async function createRelationFromPanel() {
    if (!selectedDiagrama) {
      setError('Abre un diagrama antes de crear relaciones.')
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    if (!relationSourceId || !relationTargetId) {
      setError('Selecciona una clase origen y una clase destino.')
      return
    }

    const isRecursiveRelation = relationSourceId === relationTargetId
    const recursiveHandles = isRecursiveRelation
      ? getRecursiveHandles()
      : {
          sourceHandle: undefined,
          targetHandle: undefined,
        }
    const relationId = `rel-${relationSourceId}-${relationTargetId}-${Date.now()}`
    const defaultCardinalities = getDefaultRelationCardinalities(selectedRelationType)
    const validation = validateRelation(
      {
        id: relationId,
        sourceClassId: relationSourceId,
        targetClassId: relationTargetId,
        relationType: selectedRelationType,
        ...defaultCardinalities,
        createdBy: userProfile?.codigo,
      },
      nodes,
      edges,
    )

    if (!validation.valid) {
      setError(validation.message ?? 'La relacion no es valida.')
      return
    }

    const associationClassNode =
      selectedRelationType === 'associationClass'
        ? createAssociationClassNode(relationId, relationSourceId, relationTargetId, nodes)
        : null
    const nextNodes = associationClassNode ? [...nodes, associationClassNode] : nodes

    const nextEdge: ClassFlowEdge = {
      id: relationId,
      source: relationSourceId,
      target: relationTargetId,
      sourceHandle: recursiveHandles.sourceHandle,
      targetHandle: recursiveHandles.targetHandle,
      data: buildRelationData({
        associationClassId: associationClassNode?.id,
        createdBy: userProfile?.codigo,
        relationId,
        relationType: selectedRelationType,
        sourceClassId: relationSourceId,
        sourceCardinality: defaultCardinalities.sourceCardinality,
        targetClassId: relationTargetId,
        targetCardinality: defaultCardinalities.targetCardinality,
      }),
      ...getRelationEdgeProps(selectedRelationType),
    }

    const nextEdges = [...edges, nextEdge]

    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    setSelectedEdgeId(nextEdge.id)
    setStoredSelectedRelationId(nextEdge.id)
    addStoredRelation(nextEdge, createDiagramEvent('RELATION_CREATED', nextEdge.id, userProfile?.codigo))
    setSelectedNodeId('')
    setMessage(
      selectedRelationType === 'associationClass'
        ? 'Relacion creada con clase intermedia.'
        : 'Relacion creada y guardada.',
    )
    await saveDiagrama(nextNodes, nextEdges)
    if (associationClassNode) {
      sendRealtimeEvent('class_created', { node: associationClassNode })
    }
    sendRealtimeEvent('relation_created', { edge: nextEdge })
  }

  function updateSelectedClassDraft(nextData: ClassNodeData) {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNode.id
          ? {
              ...node,
              style: getClassNodeStyle(nextData, node.style, node.width, node.height),
              data: nextData,
            }
          : node,
      ),
    )
  }

  async function removeSelectedClass() {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const relatedEdges = edges.filter(
      (edge) =>
        edge.source === selectedNode.id ||
        edge.target === selectedNode.id ||
        edge.data?.associationClassId === selectedNode.id,
    )
    const associationClassIdsToRemove = new Set(
      relatedEdges
        .map((edge) => edge.data?.associationClassId)
        .filter((associationClassId): associationClassId is string => typeof associationClassId === 'string'),
    )
    const nextNodes = nodes.filter(
      (node) => node.id !== selectedNode.id && !associationClassIdsToRemove.has(node.id),
    )
    const nextEdges = edges.filter(
      (edge) =>
        edge.source !== selectedNode.id &&
        edge.target !== selectedNode.id &&
        edge.data?.associationClassId !== selectedNode.id,
    )

    setSelectedNodeId('')
    setSelectedEdgeId('')
    setStoredSelectedRelationId('')
    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    await saveDiagrama(nextNodes, nextEdges)
    sendRealtimeEvent('class_deleted', { class_id: selectedNode.id })
    associationClassIdsToRemove.forEach((classId) => {
      sendRealtimeEvent('class_deleted', { class_id: classId })
    })
  }

  const removeSelectedClassRef = useRef(removeSelectedClass)

  useEffect(() => {
    removeSelectedClassRef.current = removeSelectedClass
  })

  useEffect(() => {
    function isWritingInField(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      const tagName = target.tagName.toLowerCase()

      return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
    }

    function handleDeleteSelectedClass(event: KeyboardEvent) {
      if (event.key !== 'Delete' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }

      if (!selectedNode || isSaving || isWritingInField(event.target)) {
        return
      }

      event.preventDefault()
      void removeSelectedClassRef.current()
    }

    window.addEventListener('keydown', handleDeleteSelectedClass)

    return () => {
      window.removeEventListener('keydown', handleDeleteSelectedClass)
    }
  }, [isSaving, selectedNode])

  function updateSelectedAttribute(
    attributeIndex: number,
    field: 'name' | 'type' | 'primaryKey' | 'foreignKey' | 'nullable',
    value: string | boolean,
  ) {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    updateSelectedClassDraft({
      ...selectedNode.data,
      attributes: selectedNode.data.attributes.map((attribute, index) => {
        if (index !== attributeIndex) {
          return attribute
        }
        const updated = {
          ...attribute,
          [field]: value,
        }
        if (field === 'primaryKey') {
          updated.primaryKey = Boolean(value)
          updated.isPrimaryKey = Boolean(value)
        } else if (field === 'foreignKey') {
          updated.foreignKey = Boolean(value)
          updated.isForeignKey = Boolean(value)
        }
        return updated
      }),
    })
  }

  function updateSelectedMethod(methodIndex: number, field: 'name' | 'returnType' | 'parameters', value: string) {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    updateSelectedClassDraft({
      ...selectedNode.data,
      methods: selectedNode.data.methods.map((method, index) =>
        index === methodIndex
          ? {
              ...method,
              [field]: field === 'parameters' ? parseMethodParameters(value) : value,
            }
          : method,
      ),
    })
  }

  async function removeAttributeFromSelectedClass(attributeIndex: number) {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    await saveSelectedClass({
      ...selectedNode.data,
      attributes: selectedNode.data.attributes.filter((_attribute, index) => index !== attributeIndex),
    })
  }

  async function removeMethodFromSelectedClass(methodIndex: number) {
    if (!selectedNode) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    await saveSelectedClass({
      ...selectedNode.data,
      methods: selectedNode.data.methods.filter((_method, index) => index !== methodIndex),
    })
  }

  function getClassNameById(nodeId: string) {
    return nodes.find((node) => node.id === nodeId)?.data.name ?? nodeId
  }

  async function updateRelation(edgeId: string, relationType: RelationType) {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const relation = edges.find((edge) => edge.id === edgeId)

    if (!relation) {
      return
    }

    let nextNodes = nodes
    const currentData = getEdgeData(relation)
    const relationCardinalities =
      relationType === currentData.relationType
        ? {
            sourceCardinality: currentData.sourceCardinality,
            targetCardinality: currentData.targetCardinality,
          }
        : getDefaultRelationCardinalities(relationType)
    const associationClassNode =
      relationType === 'associationClass' && !currentData.associationClassId
        ? createAssociationClassNode(relation.id, relation.source, relation.target, nodes)
        : null
    const associationClassId =
      relationType === 'associationClass'
        ? currentData.associationClassId ?? associationClassNode?.id
        : undefined
    const validation = validateRelation(
      {
        id: edgeId,
        sourceClassId: relation.source,
        targetClassId: relation.target,
        relationType,
        ...relationCardinalities,
        associationClassId,
        createdBy: userProfile?.codigo,
      },
      associationClassNode ? [...nodes, associationClassNode] : nodes,
      edges,
    )

    if (!validation.valid) {
      setError(validation.message ?? 'La relacion no es valida.')
      return
    }

    const nextEdges: ClassFlowEdge[] = edges.map((edge) => {
      if (edge.id !== edgeId) {
        return edge
      }

      if (associationClassNode) {
        nextNodes = [...nextNodes, associationClassNode]
      }

      if (currentData.associationClassId && relationType !== 'associationClass') {
        nextNodes = nextNodes.filter((node) => node.id !== currentData.associationClassId)
      }

      const nextData = buildRelationData({
        associationClassId,
        createdAt: currentData.createdAt,
        createdBy: currentData.createdBy ?? userProfile?.codigo,
        relationId: edge.id,
        relationType,
        sourceClassId: edge.source,
        sourceCardinality: relationCardinalities.sourceCardinality,
        targetClassId: edge.target,
        targetCardinality: relationCardinalities.targetCardinality,
      })

      return {
        ...edge,
        data: nextData,
        ...getRelationEdgeProps(relationType),
      }
    })
    const updatedRelation = nextEdges.find((edge) => edge.id === edgeId)

    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    setSelectedEdgeId(edgeId)
    if (updatedRelation) {
      updateStoredRelation(
        edgeId,
        updatedRelation,
        createDiagramEvent('RELATION_UPDATED', edgeId, userProfile?.codigo, { relationType }),
      )
    }
    await saveDiagrama(nextNodes, nextEdges)
    if (associationClassNode) {
      sendRealtimeEvent('class_created', { node: associationClassNode })
    }
    if (currentData.associationClassId && relationType !== 'associationClass') {
      sendRealtimeEvent('class_deleted', { class_id: currentData.associationClassId })
    }
    if (updatedRelation) {
      sendRealtimeEvent('relation_updated', { edge: updatedRelation })
    }
  }

  async function updateRelationCardinality(
    edgeId: string,
    field: 'sourceCardinality' | 'targetCardinality',
    value: string,
  ) {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const relation = edges.find((edge) => edge.id === edgeId)
    if (!relation || !relationUsesCardinality(relation.data?.relationType)) {
      return
    }

    const nextEdges: ClassFlowEdge[] = edges.map((edge) => {
      if (edge.id !== edgeId) {
        return edge
      }

      const currentData = getEdgeData(edge)
      const nextData = {
        ...currentData,
        [field]: value as Cardinality,
      }

      return {
        ...edge,
        data: nextData,
      }
    })
    const updatedRelation = nextEdges.find((edge) => edge.id === edgeId)

    setEdges(nextEdges)
    setSelectedEdgeId(edgeId)
    if (updatedRelation) {
      updateStoredRelation(
        edgeId,
        updatedRelation,
        createDiagramEvent('RELATION_UPDATED', edgeId, userProfile?.codigo, { [field]: value }),
      )
    }
    await saveDiagrama(nodes, nextEdges)
    if (updatedRelation) {
      sendRealtimeEvent('relation_updated', { edge: updatedRelation })
    }
  }

  async function invertRelationDirection(edgeId: string) {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const relation = edges.find((edge) => edge.id === edgeId)

    if (!relation) {
      return
    }

    const currentData = getEdgeData(relation)
    const validation = validateRelation(
      {
        id: edgeId,
        sourceClassId: relation.target,
        targetClassId: relation.source,
        relationType: currentData.relationType,
        sourceCardinality: currentData.targetCardinality,
        targetCardinality: currentData.sourceCardinality,
        associationClassId: currentData.associationClassId,
        templateBindings: currentData.templateBindings,
        createdBy: userProfile?.codigo,
      },
      nodes,
      edges,
    )

    if (!validation.valid) {
      setError(validation.message ?? 'No se puede invertir esta relacion.')
      return
    }

    const nextEdges: ClassFlowEdge[] = edges.map((edge) => {
      if (edge.id !== edgeId) {
        return edge
      }

      const nextData = {
        ...buildRelationData({
          associationClassId: currentData.associationClassId,
          createdAt: currentData.createdAt,
          createdBy: currentData.createdBy ?? userProfile?.codigo,
          relationId: edge.id,
          relationType: currentData.relationType,
          sourceClassId: edge.target,
          sourceCardinality: currentData.targetCardinality,
          targetClassId: edge.source,
          targetCardinality: currentData.sourceCardinality,
        }),
        sourceClassId: edge.target,
        targetClassId: edge.source,
        sourceRole: currentData.targetRole,
        targetRole: currentData.sourceRole,
        navigableSource: currentData.navigableTarget,
        navigableTarget: currentData.navigableSource,
        templateBindings: currentData.templateBindings,
      }

      return {
        ...edge,
        source: edge.target,
        target: edge.source,
        sourceHandle: edge.targetHandle,
        targetHandle: edge.sourceHandle,
        data: nextData,
      }
    })
    const updatedRelation = nextEdges.find((edge) => edge.id === edgeId)

    setEdges(nextEdges)
    setSelectedEdgeId(edgeId)
    if (updatedRelation) {
      updateStoredRelation(
        edgeId,
        updatedRelation,
        createDiagramEvent('RELATION_UPDATED', edgeId, userProfile?.codigo, { direction: 'inverted' }),
      )
    }
    await saveDiagrama(nodes, nextEdges)
    if (updatedRelation) {
      sendRealtimeEvent('relation_updated', { edge: updatedRelation })
    }
  }

  async function removeRelation(edgeId: string) {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const relation = edges.find((edge) => edge.id === edgeId)
    const associationClassId = relation?.data?.associationClassId
    const nextNodes =
      typeof associationClassId === 'string' ? nodes.filter((node) => node.id !== associationClassId) : nodes
    const nextEdges = edges.filter((edge) => edge.id !== edgeId)

    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagramState(nextNodes, nextEdges)
    setSelectedEdgeId('')
    setStoredSelectedRelationId('')
    removeStoredRelation(edgeId, createDiagramEvent('RELATION_DELETED', edgeId, userProfile?.codigo))
    await saveDiagrama(nextNodes, nextEdges)
    sendRealtimeEvent('relation_deleted', { relation_id: edgeId })
    if (typeof associationClassId === 'string') {
      sendRealtimeEvent('class_deleted', { class_id: associationClassId })
    }
  }

  const sendNodeMoveRealtime: OnNodeDrag<ClassFlowNode> = (_event, node) => {
    if (!selectedDiagrama || !canEditDiagram) {
      return
    }

    const now = Date.now()

    if (now - lastRealtimeMoveAtRef.current < 90) {
      return
    }

    lastRealtimeMoveAtRef.current = now
    sendRealtimeEvent('class_moved', {
      class_id: node.id,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
    })
  }

  const saveNodePosition: OnNodeDrag<ClassFlowNode> = async (_event, node) => {
    if (!selectedDiagrama) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    // Actualización optimista inmediata en local
    setNodes((current) =>
      current.map((n) => (n.id === node.id ? { ...n, position: { ...node.position } } : n)),
    )

    try {
      const diagrama = await moverClase(selectedDiagrama.id, node.id, {
        x: node.position.x,
        y: node.position.y,
        autor_codigo: userProfile?.codigo,
      })
      const content = normalizeContent(diagrama.contenido)
      const nextNodes = toFlowNodes(content.nodes)
      const nextEdges = toFlowEdges(content.edges)

      // Garantizar que la posición del nodo movido preserve exactamente sus coordenadas
      // y fusionar con los nodos locales para evitar que ninguno desaparezca
      setNodes((current) => {
        const merged = current.map((n) => {
          if (n.id === node.id) {
            return { ...n, position: { ...node.position } }
          }
          const fromBackend = nextNodes.find((bn) => bn.id === n.id)
          return fromBackend ?? n
        })
        for (const bn of nextNodes) {
          if (!merged.some((m) => m.id === bn.id)) {
            merged.push(bn)
          }
        }
        return merged
      })

      setSelectedDiagrama(diagrama)
      setEdges(nextEdges)
      setDiagramState(nodesRef.current, nextEdges)
      setDiagramas((current) => current.map((item) => (item.id === diagrama.id ? diagrama : item)))
      sendRealtimeEvent('class_moved', {
        class_id: node.id,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
      })
    } catch (moveError) {
      console.warn('moverClase falló, ejecutando fallback con saveDiagrama', moveError)
      try {
        const currentUpdatedNodes = nodes.map((n) =>
          n.id === node.id ? { ...n, position: { ...node.position } } : n,
        )
        await saveDiagrama(currentUpdatedNodes, edges)
        sendRealtimeEvent('class_moved', {
          class_id: node.id,
          position: {
            x: node.position.x,
            y: node.position.y,
          },
        })
      } catch (fallbackError) {
        setError(getProjectActionError(fallbackError, 'No se pudo mover la clase'))
      }
    }
  }

  async function addAttributeToSelectedClass() {
    if (!selectedNode || !newAttributeName.trim()) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    await saveSelectedClass({
      ...selectedNode.data,
      attributes: [
        ...selectedNode.data.attributes,
        {
          name: newAttributeName,
          type: newAttributeType,
          primaryKey: newAttributeName.toLowerCase() === 'id',
          nullable: false,
        },
      ],
    })
    setNewAttributeName('id')
    setNewAttributeType('BIGINT')
  }

  async function addMethodToSelectedClass() {
    if (!selectedNode || !newMethodName.trim()) {
      return
    }

    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    await saveSelectedClass({
      ...selectedNode.data,
      methods: [
        ...selectedNode.data.methods,
        {
          name: newMethodName,
          parameters: parseMethodParameters(newMethodParameters),
          returnType: newMethodReturnType,
        },
      ],
    })
    setNewMethodName('registrar')
    setNewMethodParameters('')
    setNewMethodReturnType('void')
  }

  async function removeDiagrama(diagrama: DiagramaResponse) {
    if (!canEditDiagram) {
      denyDiagramEdit()
      return
    }

    const confirmed = window.confirm(`Eliminar diagrama "${diagrama.nombre}"?`)

    if (!confirmed) {
      return
    }

    setError('')
    setMessage('')

    try {
      await eliminarDiagrama(diagrama.id)
      setDiagramas((current) => current.filter((item) => item.id !== diagrama.id))

      if (selectedDiagrama?.id === diagrama.id) {
        setSelectedDiagrama(null)
        setNodes([])
        setEdges([])
        setSelectedNodeId('')
        setSelectedEdgeId('')
        setStoredSelectedRelationId('')
      }

      setMessage('Diagrama eliminado correctamente.')
    } catch (deleteError) {
      setError(getProjectActionError(deleteError, 'No se pudo eliminar el diagrama'))
    }
  }

  function backToProjects() {
    setView('projects')
    setSelectedProyecto(null)
    setSelectedDiagrama(null)
    setNodes([])
    setEdges([])
    setDiagramas([])
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setStoredSelectedRelationId('')
    setMessage('')
    setError('')
  }

  useEffect(() => {
    loadProyectos()
  }, [loadProyectos])

  return (
    <main
      className={`users-page student-page ${theme === 'light' ? 'users-page-light' : ''} ${
        isSidebarCollapsed ? 'student-sidebar-collapsed' : ''
      } ${!isAssistantVisible ? 'diagram-assistant-hidden' : ''}`}
    >
      <aside className="admin-sidebar student-sidebar" aria-label="Navegacion de estudiante">
        <button
          aria-label={isSidebarCollapsed ? 'Abrir barra lateral' : 'Cerrar barra lateral'}
          className="student-sidebar-toggle"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          title={isSidebarCollapsed ? 'Abrir barra lateral' : 'Cerrar barra lateral'}
          type="button"
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>

        <a className="admin-brand" href="#top" onClick={onBack}>
          <span>
            <Database size={20} />
          </span>
          <strong>DrawSchema</strong>
        </a>

        <nav className="admin-nav" data-tour="workspace-navigation">
          <p>Workspace</p>
          <button
            className={view === 'projects' ? 'active' : ''}
            onClick={backToProjects}
            title="Mis proyectos"
            type="button"
          >
            <LayoutDashboard size={18} />
            <span>Mis proyectos</span>
          </button>
          {selectedProyecto ? (
            <button className={view === 'diagrammer' ? 'active' : ''} title="Diagramador" type="button">
              <FileCode2 size={18} />
              <span>Diagramador</span>
            </button>
          ) : null}
        </nav>

        <AdminSidebarExtras
          theme={theme}
          userProfile={userProfile}
          onProfile={onProfile}
          onToggleTheme={onToggleTheme}
        />

        <button className="sidebar-back" onClick={onBack} type="button">
          <ArrowLeft size={16} /> Volver al sitio
        </button>
      </aside>

      <section className={view === 'diagrammer' ? 'users-workspace diagrammer-workspace' : 'users-workspace'}>
        {view === 'projects' ? (
          <>
            <header className="users-header">
              <div>
                <p>Estudiante</p>
                <h1>Mis proyectos</h1>
              </div>

              <div className="student-header-actions">
                <button
                  aria-label="Volver a ver la guia inicial"
                  className="ghost-button"
                  onClick={restartOnboarding}
                  title="Ver guia inicial"
                  type="button"
                >
                  <HelpCircle size={18} /> Guia
                </button>
                <button className="ghost-button" onClick={loadProyectos} type="button">
                  <RefreshCw size={18} /> Recargar
                </button>
              </div>
            </header>

            {error ? <p className="users-message error">{error}</p> : null}
            {message ? <p className="users-message success">{message}</p> : null}
            {isLoading ? <p className="users-loading">Cargando tus proyectos...</p> : null}

            <section className="student-projects-home">
              <div className="student-panel student-create-project-panel" data-tour="create-project">
                <div className="panel-title">
                  <div>
                    <p>Nuevo proyecto</p>
                    <h2>Crear workspace</h2>
                  </div>
                </div>

                <div className="student-project-form">
                  <input
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Nombre del proyecto"
                    value={newProjectName}
                  />
                  <textarea
                    onChange={(event) => setNewProjectDescription(event.target.value)}
                    placeholder="Descripcion opcional"
                    value={newProjectDescription}
                  />
                  <button
                    className="primary-action"
                    disabled={isSaving || !newProjectName.trim()}
                    onClick={createProyecto}
                    type="button"
                  >
                    <Plus size={18} /> Crear proyecto
                  </button>
                </div>
              </div>

              <div className="student-panel" data-tour="project-list">
                <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p>Proyectos</p>
                    <h2>Abre tu diagramador</h2>
                  </div>
                  <button
                    className="join-project-trigger-btn"
                    data-tour="join-project"
                    onClick={() => {
                      setUrlInviteCode('')
                      setIsJoinModalOpen(true)
                    }}
                    type="button"
                    title="Unirse a un proyecto mediante código de invitación"
                  >
                    <UserPlus size={16} />
                    <span>Unirse con código</span>
                  </button>
                </div>

                <div className="student-project-grid">
                  {proyectos.map((proyecto) => (
                    <article
                      className={selectedProyecto?.id === proyecto.id ? 'student-project-card active' : 'student-project-card'}
                      key={proyecto.id}
                    >
                      <span>
                        <FolderKanban size={20} />
                      </span>
                      <strong>{proyecto.nombre}</strong>
                      <small>{proyecto.descripcion || 'Sin descripcion'}</small>
                      <div className="student-project-actions">
                        <button onClick={() => openProyecto(proyecto)} type="button">
                          <FileCode2 size={16} /> Abrir
                        </button>
                        <button onClick={() => openCollaborators(proyecto)} type="button">
                          <Plus size={16} /> Colaboradores
                        </button>
                        <button
                          onClick={() => {
                            setInviteTargetProyecto({ id: proyecto.id, nombre: proyecto.nombre })
                            setIsInviteModalOpen(true)
                          }}
                          type="button"
                          title="Obtener código de invitación"
                        >
                          <Share2 size={15} /> Invitar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                {proyectos.length === 0 && !isLoading ? (
                  <div className="empty-state">Todavia no tienes proyectos. Crea uno para empezar.</div>
                ) : null}

                {selectedProyecto ? (
                  <section className="collaborators-panel project-collaborators-panel">
                    <div className="panel-title compact-title">
                      <div>
                        <p>Colaboradores</p>
                        <h2>{selectedProyecto.nombre}</h2>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="invite-collaborators-code-btn"
                          onClick={() => {
                            setInviteTargetProyecto({ id: selectedProyecto.id, nombre: selectedProyecto.nombre })
                            setIsInviteModalOpen(true)
                          }}
                          type="button"
                          title="Compartir código de invitación"
                        >
                          <Share2 size={15} />
                          <span>Código de invitación</span>
                        </button>
                        <button
                          className="icon-button"
                          disabled={isMembersLoading}
                          onClick={() => loadMiembros(selectedProyecto.id)}
                          title="Recargar colaboradores"
                          type="button"
                        >
                          <RefreshCw size={15} />
                        </button>
                      </div>
                    </div>

                    {membersError ? <p className="collaborators-message error">{membersError}</p> : null}
                    {membersMessage ? <p className="collaborators-message success">{membersMessage}</p> : null}
                    {!canManageMembers ? (
                      <p className="collaborators-message info">Solo el propietario puede gestionar colaboradores.</p>
                    ) : null}

                    <div className="collaborator-form project-collaborator-form">
                      <label>
                        Correo electronico
                        <input
                          disabled={!canManageMembers || isMembersSaving}
                          onChange={(event) => setNewMemberEmail(event.target.value)}
                          placeholder="usuario@correo.com"
                          type="email"
                          value={newMemberEmail}
                        />
                      </label>
                      <label>
                        Rol
                        <select
                          disabled={!canManageMembers || isMembersSaving}
                          onChange={(event) => setNewMemberRole(Number(event.target.value))}
                          value={newMemberRole}
                        >
                          {memberRoleOptions.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="primary-action"
                        disabled={isMembersSaving || !canManageMembers || !newMemberEmail.trim()}
                        onClick={addMiembro}
                        type="button"
                      >
                        <Plus size={17} /> Agregar colaborador
                      </button>
                    </div>

                    <div className="collaborators-list project-collaborators-list">
                      {isMembersLoading ? <p className="collaborators-loading">Cargando colaboradores...</p> : null}
                      {!isMembersLoading && miembros.length === 0 ? (
                        <p className="collaborators-loading">Sin colaboradores registrados.</p>
                      ) : null}

                      {miembros.map((miembro) => (
                        <article className="collaborator-card" key={miembro.usuario_codigo}>
                          <div>
                            <strong>{miembro.usuario_codigo}</strong>
                            <span>{getMemberRoleName(miembro.id_rol)}</span>
                          </div>
                          <select
                            aria-label={`Rol de ${miembro.usuario_codigo}`}
                            disabled={isMembersSaving || !canManageMembers}
                            onChange={(event) =>
                              setMemberRoleDrafts((current) => ({
                                ...current,
                                [miembro.usuario_codigo]: Number(event.target.value),
                              }))
                            }
                            value={memberRoleDrafts[miembro.usuario_codigo] ?? miembro.id_rol}
                          >
                            {memberRoleOptions.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <div className="collaborator-actions">
                            <button
                              className="icon-button"
                              disabled={
                                isMembersSaving ||
                                !canManageMembers ||
                                memberRoleDrafts[miembro.usuario_codigo] === miembro.id_rol
                              }
                              onClick={() => saveMemberRole(miembro)}
                              title="Guardar rol"
                              type="button"
                            >
                              <Save size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              disabled={isMembersSaving || !canManageMembers}
                              onClick={() => removeMiembro(miembro)}
                              title="Quitar colaborador"
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <>
            <header className="diagrammer-header">
              <button className="ghost-button" onClick={backToProjects} type="button">
                <ArrowLeft size={18} /> Proyectos
              </button>
              <div>
                <p>Diagramador</p>
                <h1>{selectedProyecto?.nombre ?? 'Proyecto'}</h1>
              </div>
              <div className="diagrammer-header-actions">
                <div className="diagram-header-file-actions">
                  <button
                    className={isAssistantVisible ? 'file-toolbar-button assistant-toggle active' : 'file-toolbar-button assistant-toggle'}
                    onClick={() => setIsAssistantVisible((current) => !current)}
                    type="button"
                  >
                    <Sparkles size={16} />
                    {isAssistantVisible ? 'Ocultar asistente' : 'Mostrar asistente'}
                  </button>

                  <button
                    className={isCommentsOpen ? 'file-toolbar-button comments-toggle active' : 'file-toolbar-button comments-toggle'}
                    disabled={!selectedDiagrama}
                    onClick={toggleCommentsDrawer}
                    title="Comentarios y discusión del diagrama"
                    type="button"
                  >
                    <MessageSquare size={16} />
                    Comentarios
                    {totalPendingComments > 0 ? (
                      <span
                        className="comments-pending-count-badge"
                        style={{
                          marginLeft: 6,
                          padding: '1px 6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          borderRadius: '999px',
                          backgroundColor: '#6366f1',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.2,
                        }}
                      >
                        {totalPendingComments}
                      </span>
                    ) : null}
                  </button>

                  <button
                    className="file-toolbar-button"
                    disabled={!selectedDiagrama}
                    onClick={() => {
                      if (selectedDiagrama) {
                        onVersionHistory(selectedDiagrama)
                      }
                    }}
                    type="button"
                  >
                    <Clock3 size={16} />
                    Ver historial
                  </button>

                  {selectedProyecto ? (
                    <button
                      className="file-toolbar-button invite-toolbar-btn"
                      onClick={() => {
                        setInviteTargetProyecto({ id: selectedProyecto.id, nombre: selectedProyecto.nombre })
                        setIsInviteModalOpen(true)
                      }}
                      title="Invitar colaboradores mediante código"
                      type="button"
                    >
                      <Share2 size={16} />
                      Invitar
                    </button>
                  ) : null}

                  <label className={!canEditDiagram || isXmiBusy || !selectedProyecto ? 'file-toolbar-button disabled' : 'file-toolbar-button'}>
                    <Upload size={16} />
                    Importar
                    <input
                      accept=".xmi,.xml"
                      disabled={!canEditDiagram || isXmiBusy || !selectedProyecto}
                      onChange={(event) => {
                        const file = event.target.files?.[0]

                        if (file) {
                          importXmiFile(file)
                        }

                        event.target.value = ''
                      }}
                      type="file"
                    />
                  </label>

                  <button
                    className="file-toolbar-button"
                    disabled={!selectedDiagrama || isXmiBusy}
                    onClick={exportSelectedXmi}
                    type="button"
                  >
                    <Download size={16} />
                    Exportar
                  </button>
                </div>

                {selectedProyecto ? (
                  <span className={canViewOnly ? 'project-role-badge view-only' : 'project-role-badge'}>
                    {miembroActual ? getMemberRoleName(miembroActual.id_rol) : 'Cargando rol'}
                  </span>
                ) : null}
                {selectedDiagrama ? (
                  <div className={`realtime-users realtime-${realtimeStatus}`} title="Colaboradores activos">
                    <div className="realtime-avatars" aria-label="Colaboradores activos">
                      {activeRealtimeUsers.slice(0, 4).map((user) => {
                        const userColor = getCollaboratorColor(user.codigo || user.email || user.nombre)
                        const userInitials = getCollaboratorInitials(user)
                        const displayName = user.nombre || user.email || user.codigo || 'Colaborador'
                        return (
                          <div
                            className="realtime-avatar-wrapper"
                            key={user.codigo ?? user.email ?? user.nombre}
                          >
                            <span
                              className="realtime-avatar"
                              style={{
                                backgroundColor: userColor.bg,
                                color: userColor.text,
                                borderColor: userColor.border,
                              }}
                              title={`${displayName}\n${user.email || ''}\n${user.can_edit ? 'Editor' : 'Visualizador'}`}
                            >
                              {userInitials}
                            </span>
                            <div className="realtime-avatar-tooltip">
                              <div className="realtime-avatar-tooltip-header">
                                <span
                                  className="avatar-tooltip-circle"
                                  style={{ backgroundColor: userColor.bg, color: userColor.text }}
                                >
                                  {userInitials}
                                </span>
                                <div>
                                  <strong>{displayName}</strong>
                                  {user.email ? <span>{user.email}</span> : null}
                                </div>
                              </div>
                              <div className="realtime-avatar-tooltip-footer">
                                <span className="avatar-status-dot" style={{ backgroundColor: userColor.border }} />
                                <small>{user.can_edit ? 'Modo Editor' : 'Visualizador'} • En línea</small>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {activeRealtimeUsers.length > 4 ? (
                        <span className="realtime-avatar realtime-more">+{activeRealtimeUsers.length - 4}</span>
                      ) : null}
                    </div>
                    <span>
                      {realtimeStatus === 'connected'
                        ? activeRealtimeUsers.length > 0
                          ? 'En vivo'
                          : 'Solo tu'
                        : realtimeStatus === 'connecting'
                          ? 'Conectando'
                          : 'Sin tiempo real'}
                    </span>
                  </div>
                ) : null}
                {selectedProyecto && selectedDiagrama ? (
                  <AiCodegenPanel
                    diagramaId={selectedDiagrama.id}
                    proyectoId={selectedProyecto.id}
                    proyectoNombre={selectedProyecto.nombre}
                    variant="button"
                  />
                ) : null}
              </div>
            </header>

            {error ? <p className="users-message error">{error}</p> : null}
            {message ? <p className="users-message success">{message}</p> : null}
            {canViewOnly ? (
              <p className="users-message info">Estas como visualizador: puedes revisar el diagrama, pero no editarlo.</p>
            ) : null}

            <section className="diagrammer-shell">
              <aside className="diagrammer-left-panel">
                <RelationBuilderPanel
                  canEditDiagram={canEditDiagram}
                  createRelationFromPanel={createRelationFromPanel}
                  edges={edges}
                  getClassNameById={getClassNameById}
                  invertRelationDirection={invertRelationDirection}
                  isOpen={isRelationToolboxOpen}
                  isSaving={isSaving}
                  nodes={nodes}
                  onRelationTypeChange={setSelectedRelationType}
                  onSelectEdge={(edgeId) => {
                    setSelectedEdgeId(edgeId)
                    setSelectedNodeId('')
                  }}
                  onSourceChange={setRelationSourceId}
                  onTargetChange={setRelationTargetId}
                  onToggleOpen={() => setIsRelationToolboxOpen((current) => !current)}
                  relationSourceId={relationSourceId}
                  relationTargetId={relationTargetId}
                  removeRelation={removeRelation}
                  selectedDiagrama={selectedDiagrama}
                  selectedEdgeId={selectedEdgeId}
                  selectedRelationType={selectedRelationType}
                  updateRelation={updateRelation}
                  updateRelationCardinality={updateRelationCardinality}
                />

              </aside>

              <section className="diagram-flow-panel">
                <div className="diagram-file-toolbar">
                  <div className="diagram-picker">
                    <label>
                      Diagrama
                      <select
                        disabled={diagramas.length === 0}
                        onChange={(event) => openDiagrama(Number(event.target.value))}
                        value={selectedDiagrama?.id ?? ''}
                      >
                        <option value="" disabled>
                          Selecciona un diagrama
                        </option>
                        {diagramas.map((diagrama) => (
                          <option key={diagrama.id} value={diagrama.id}>
                            {diagrama.nombre} - v{diagrama.version}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="diagram-new-inline">
                      <input
                        disabled={!canEditDiagram || !selectedProyecto}
                        onChange={(event) => setNewDiagramName(event.target.value)}
                        placeholder="Nuevo diagrama"
                        value={newDiagramName}
                      />
                      <button
                        className="icon-button"
                        disabled={isSaving || !selectedProyecto || !canEditDiagram || !newDiagramName.trim()}
                        onClick={createDiagrama}
                        title="Crear diagrama"
                        type="button"
                      >
                        <Plus size={17} />
                      </button>
                      <button
                        className="icon-button danger"
                        disabled={!selectedDiagrama || !canEditDiagram}
                        onClick={() => {
                          if (selectedDiagrama) {
                            removeDiagrama(selectedDiagrama)
                          }
                        }}
                        title="Eliminar diagrama"
                        type="button"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                </div>

                <div className="diagram-canvas-topbar">
                  <label>
                    Nombre
                      <input
                      disabled={!selectedDiagrama || !canEditDiagram}
                      onChange={(event) => setDiagramName(event.target.value)}
                      value={diagramName}
                    />
                  </label>
                  <div className="diagram-stats">
                    <span>{nodes.length} clases</span>
                    <span>{edges.length} relaciones</span>
                  </div>
                  <button
                    aria-expanded={isCreateClassOpen}
                    className="create-class-toggle canvas-create-class-toggle"
                    disabled={!canEditDiagram}
                    onClick={async () => {
                      if (!selectedDiagrama && selectedProyecto && canEditDiagram) {
                        await createDiagrama()
                      }
                      setIsCreateClassOpen((current) => !current)
                    }}
                    type="button"
                  >
                    <Plus size={18} />
                    Crear clase
                    <ChevronDown size={16} />
                  </button>
                </div>

                {isCreateClassOpen ? (
                  <CreateClassPanel
                    canEditDiagram={canEditDiagram}
                    isSaving={isSaving}
                    newAttributeName={newAttributeName}
                    newAttributeType={newAttributeType}
                    newClassName={newClassName}
                    onAddClass={addClass}
                    onAttributeNameChange={setNewAttributeName}
                    onAttributeTypeChange={setNewAttributeType}
                    onClassNameChange={setNewClassName}
                    selectedDiagrama={selectedDiagrama}
                    variant="canvas"
                  />
                ) : null}

                <DiagramCanvas
                  canEditDiagram={canEditDiagram}
                  connectNodes={connectNodes}
                  edges={edges}
                  nodes={nodes}
                  onCreateDiagram={createDiagrama}
                  onEdgesChange={onEdgesChange}
                  onNodeDrag={sendNodeMoveRealtime}
                  onNodesChange={onNodesChange}
                  saveNodePosition={saveNodePosition}
                  selectedDiagrama={selectedDiagrama}
                  selectedEdgeId={selectedEdgeId}
                  setSelectedEdgeId={setSelectedEdgeId}
                  setSelectedNodeId={setSelectedNodeId}
                  setStoredSelectedRelationId={setStoredSelectedRelationId}
                  theme={theme}
                />

                {selectedNode ? (
                  <ClassFeaturesPanel
                    addAttributeToSelectedClass={addAttributeToSelectedClass}
                    addMethodToSelectedClass={addMethodToSelectedClass}
                    canEditDiagram={canEditDiagram}
                    featureTab={featureTab}
                    formatMethodParameters={formatMethodParameters}
                    isSaving={isSaving}
                    newAttributeName={newAttributeName}
                    newAttributeType={newAttributeType}
                    newMethodName={newMethodName}
                    newMethodParameters={newMethodParameters}
                    newMethodReturnType={newMethodReturnType}
                    removeAttributeFromSelectedClass={removeAttributeFromSelectedClass}
                    removeMethodFromSelectedClass={removeMethodFromSelectedClass}
                    removeSelectedClass={removeSelectedClass}
                    saveSelectedClass={saveSelectedClass}
                    selectedNode={selectedNode}
                    setFeatureTab={setFeatureTab}
                    setNewAttributeName={setNewAttributeName}
                    setNewAttributeType={setNewAttributeType}
                    setNewMethodName={setNewMethodName}
                    setNewMethodParameters={setNewMethodParameters}
                    setNewMethodReturnType={setNewMethodReturnType}
                    updateSelectedAttribute={updateSelectedAttribute}
                    updateSelectedClassDraft={updateSelectedClassDraft}
                    updateSelectedMethod={updateSelectedMethod}
                  />
                ) : null}

                <RelationsPanel
                  canEditDiagram={canEditDiagram}
                  edges={edges}
                  getClassNameById={getClassNameById}
                  invertRelationDirection={invertRelationDirection}
                  isSaving={isSaving}
                  removeRelation={removeRelation}
                  selectedEdgeId={selectedEdgeId}
                  selectedRelationType={selectedRelationType}
                  updateRelation={updateRelation}
                  updateRelationCardinality={updateRelationCardinality}
                />
              </section>

              {isAssistantVisible ? (
                <aside className="diagrammer-right-panel">
                  <DiagramAssistantPanel
                    canEditDiagram={canEditDiagram}
                    isAssistantVisible={isAssistantVisible}
                    onDiagramUpdated={handleAiDiagramUpdated}
                    selectedDiagrama={selectedDiagrama}
                    selectedProyecto={selectedProyecto}
                    userProfile={userProfile}
                  />
                </aside>
              ) : null}

              {selectedDiagrama ? (
                <CommentsDrawer
                  canEdit={canEditDiagram}
                  currentUserCodigo={userProfile?.codigo}
                  diagramaId={selectedDiagrama.id}
                  nodes={nodes}
                  onCommentMutated={(type, payload) => {
                    sendRealtimeEvent(type, payload)
                  }}
                  onSelectNode={(nodeId) => {
                    setSelectedNodeId(nodeId)
                    setSelectedEdgeId('')
                    setStoredSelectedRelationId('')
                  }}
                  theme={theme}
                />
              ) : null}
            </section>
          </>
        )}
      </section>
      {inviteTargetProyecto ? (
        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={() => {
            setIsInviteModalOpen(false)
            setInviteTargetProyecto(null)
          }}
          proyectoId={inviteTargetProyecto.id}
          proyectoNombre={inviteTargetProyecto.nombre}
          theme={theme}
        />
      ) : null}

      <JoinProjectModal
        initialCode={urlInviteCode}
        isOpen={isJoinModalOpen}
        onClose={() => {
          setIsJoinModalOpen(false)
          setUrlInviteCode('')
        }}
        onSuccess={async (nuevoProyecto) => {
          setMessage(`¡Te has unido a "${nuevoProyecto.nombre}" con éxito!`)
          await loadProyectos()
          openProyecto(nuevoProyecto)
        }}
        theme={theme}
      />

      <ToastContainer />
      <GuidedTour
        isOpen={isOnboardingOpen}
        onFinish={finishOnboarding}
        steps={onboardingSteps}
        theme={theme}
      />
    </main>
  )
}
