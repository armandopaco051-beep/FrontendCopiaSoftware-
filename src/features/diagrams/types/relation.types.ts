import type { Edge, Node } from '@xyflow/react'

export type RelationType =
  | 'association'
  | 'generalization'
  | 'composition'
  | 'aggregation'
  | 'associationClass'
  | 'realization'
  | 'templateBinding'

export type LegacyRelationType =
  | 'associate'
  | 'generalize'
  | 'compose'
  | 'aggregate'
  | 'realize'

export type Cardinality = '1' | '0..1' | '0..*' | '1..*'

export type ClassAttribute = {
  name?: string
  type?: string
  primaryKey?: boolean
  isPrimaryKey?: boolean
  foreignKey?: boolean
  isForeignKey?: boolean
  nullable?: boolean
  [key: string]: unknown
}

export type ClassMethod = {
  name?: string
  returnType?: string
  parameters?: Record<string, unknown>[]
  [key: string]: unknown
}

export type ClassNodeData = {
  name: string
  kind?: 'class' | 'abstractClass' | 'interface'
  templateParameters?: string[]
  attributes: ClassAttribute[]
  methods: ClassMethod[]
  [key: string]: unknown
}

export type UmlRelationData = {
  id: string
  sourceClassId: string
  targetClassId: string
  relationType: RelationType
  sourceCardinality?: Cardinality
  targetCardinality?: Cardinality
  sourceRole?: string
  targetRole?: string
  name?: string
  navigableSource?: boolean
  navigableTarget?: boolean
  childClassId?: string
  parentClassId?: string
  wholeClassId?: string
  partClassId?: string
  associationClassId?: string
  templateBindings?: Record<string, string>
  createdBy?: string
  createdAt: string
  [key: string]: unknown
}

export type ClassFlowNode = Node<ClassNodeData, 'classNode'>
export type ClassFlowEdge = Edge<UmlRelationData>

export type RelationOption = {
  id: RelationType
  label: string
  description: string
  symbol: string
}

export type RelationValidationResult = {
  valid: boolean
  message?: string
}

export type DiagramEventType = 'RELATION_CREATED' | 'RELATION_UPDATED' | 'RELATION_DELETED'

export type DiagramEvent = {
  id: string
  type: DiagramEventType
  relationId: string
  userId?: string
  createdAt: string
  payload?: Record<string, unknown>
}

export type RelationDraft = {
  id?: string
  sourceClassId: string
  targetClassId: string
  sourceHandle?: string | null
  targetHandle?: string | null
  relationType: RelationType
  sourceCardinality?: Cardinality
  targetCardinality?: Cardinality
  sourceRole?: string
  targetRole?: string
  name?: string
  associationClassId?: string
  templateBindings?: Record<string, string>
  createdBy?: string
}
