import type {
  Cardinality,
  ClassFlowEdge,
  ClassFlowNode,
  DiagramEvent,
  DiagramEventType,
  RelationDraft,
  RelationValidationResult,
} from '../types/relation.types'
import { cardinalityOptions, normalizeRelationType, relationUsesCardinality } from './relation-markers'

function existsNode(nodes: ClassFlowNode[], nodeId: string) {
  return nodes.some((node) => node.id === nodeId)
}

function hasGeneralizationPath(edges: ClassFlowEdge[], fromId: string, toId: string, visited = new Set<string>()): boolean {
  if (visited.has(fromId)) {
    return false
  }

  visited.add(fromId)

  const nextTargets = edges
    .filter((edge) => normalizeRelationType(edge.data?.relationType) === 'generalization' && edge.source === fromId)
    .map((edge) => edge.target)

  if (nextTargets.includes(toId)) {
    return true
  }

  return nextTargets.some((targetId) => hasGeneralizationPath(edges, targetId, toId, visited))
}

function hasCompositionPath(edges: ClassFlowEdge[], fromPartId: string, toWholeId: string, visited = new Set<string>()): boolean {
  if (visited.has(fromPartId)) {
    return false
  }

  visited.add(fromPartId)

  const nextParts = edges
    .filter((edge) => normalizeRelationType(edge.data?.relationType) === 'composition' && edge.source === fromPartId)
    .map((edge) => edge.target)

  if (nextParts.includes(toWholeId)) {
    return true
  }

  return nextParts.some((partId) => hasCompositionPath(edges, partId, toWholeId, visited))
}

function isSamePair(edge: ClassFlowEdge, draft: RelationDraft) {
  return (
    (edge.source === draft.sourceClassId && edge.target === draft.targetClassId) ||
    (edge.source === draft.targetClassId && edge.target === draft.sourceClassId)
  )
}

function hasTemplateParameters(node: ClassFlowNode) {
  const templateParameters = node.data.templateParameters

  if (Array.isArray(templateParameters) && templateParameters.length > 0) {
    return true
  }

  return /<[^>]+>/.test(node.data.name)
}

function isValidCardinality(value?: string): value is Cardinality {
  return cardinalityOptions.includes((value ?? '') as Cardinality)
}

export function validateRelation(
  draft: RelationDraft,
  nodes: ClassFlowNode[],
  edges: ClassFlowEdge[],
): RelationValidationResult {
  const sourceNode = nodes.find((node) => node.id === draft.sourceClassId)
  const targetNode = nodes.find((node) => node.id === draft.targetClassId)

  if (!sourceNode || !targetNode) {
    return {
      valid: false,
      message: 'La relacion apunta a una clase que no existe.',
    }
  }

  const isRecursiveRelation = draft.sourceClassId === draft.targetClassId
  const allowsRecursiveRelation = draft.relationType === 'association' || draft.relationType === 'associationClass'

  if (isRecursiveRelation && !allowsRecursiveRelation) {
    return {
      valid: false,
      message: 'Solo Association y Association Class pueden relacionar una clase consigo misma.',
    }
  }

  const duplicated = edges.some(
    (edge) =>
      edge.id !== draft.id &&
      isSamePair(edge, draft) &&
      normalizeRelationType(edge.data?.relationType) === draft.relationType,
  )

  if (duplicated) {
    return {
      valid: false,
      message: 'Ya existe una relacion de ese tipo entre estas clases.',
    }
  }

  if (draft.relationType === 'generalization') {
    const alreadyHasParent = edges.some(
      (edge) =>
        edge.id !== draft.id &&
        normalizeRelationType(edge.data?.relationType) === 'generalization' &&
        edge.source === draft.sourceClassId,
    )

    if (alreadyHasParent) {
      return {
        valid: false,
        message: 'Esta clase ya tiene una clase padre. Para el MVP solo se permite una herencia directa.',
      }
    }

    if (hasGeneralizationPath(edges, draft.targetClassId, draft.sourceClassId)) {
      return {
        valid: false,
        message: 'Esa generalizacion crearia un ciclo de herencia.',
      }
    }
  }

  if (draft.relationType === 'composition') {
    if (!['1', '0..1'].includes(String(draft.sourceCardinality ?? '1'))) {
      return {
        valid: false,
        message: 'En una composicion, una Parte solo puede pertenecer a un Todo.',
      }
    }

    const partAlreadyHasWhole = edges.some(
      (edge) =>
        edge.id !== draft.id &&
        normalizeRelationType(edge.data?.relationType) === 'composition' &&
        edge.target === draft.targetClassId,
    )

    if (partAlreadyHasWhole) {
      return {
        valid: false,
        message: 'Una parte no puede pertenecer a varios composites.',
      }
    }

    if (hasCompositionPath(edges, draft.targetClassId, draft.sourceClassId)) {
      return {
        valid: false,
        message: 'Esa composicion crearia una relacion circular Todo-Parte.',
      }
    }
  }

  if (draft.relationType === 'realization' && targetNode?.data.kind !== 'interface') {
    return {
      valid: false,
      message: 'Realization debe apuntar a una interfaz.',
    }
  }

  if (draft.relationType === 'associationClass') {
    const duplicatedAssociationClass = edges.some(
      (edge) =>
        edge.id !== draft.id &&
        normalizeRelationType(edge.data?.relationType) === 'associationClass' &&
        isSamePair(edge, draft),
    )

    if (duplicatedAssociationClass) {
      return {
        valid: false,
        message: 'Ya existe una clase de asociacion para este vinculo.',
      }
    }

    if (draft.associationClassId && !existsNode(nodes, draft.associationClassId)) {
      return {
        valid: false,
        message: 'La clase de asociacion indicada no existe.',
      }
    }

    if (
      draft.associationClassId &&
      (draft.associationClassId === draft.sourceClassId || draft.associationClassId === draft.targetClassId)
    ) {
      return {
        valid: false,
        message: 'La clase de asociacion debe ser diferente a la clase relacionada.',
      }
    }
  }

  if (draft.relationType === 'templateBinding') {
    if (!hasTemplateParameters(targetNode)) {
      return {
        valid: false,
        message: 'Template Binding debe apuntar a una clase plantilla, por ejemplo Repository<T>.',
      }
    }

    const targetTemplateParameters = Array.isArray(targetNode.data.templateParameters)
      ? targetNode.data.templateParameters
      : targetNode.data.name.match(/<([^>]+)>/)?.[1]?.split(',').map((parameter) => parameter.trim()) ?? []
    const bindings = draft.templateBindings ?? {}
    const missingBinding = targetTemplateParameters.some((parameter) => !bindings[parameter])

    if (missingBinding) {
      return {
        valid: false,
        message: 'Template Binding necesita completar todos los parametros de la plantilla.',
      }
    }
  }

  if (
    relationUsesCardinality(draft.relationType) &&
    (!isValidCardinality(draft.sourceCardinality ?? '1..*') || !isValidCardinality(draft.targetCardinality ?? '1'))
  ) {
    return {
      valid: false,
      message: 'La cardinalidad no es valida.',
    }
  }

  return {
    valid: true,
  }
}

export function createDiagramEvent(
  type: DiagramEventType,
  relationId: string,
  userId?: string,
  payload?: Record<string, unknown>,
): DiagramEvent {
  return {
    id: `${type}-${relationId}-${Date.now()}`,
    type,
    relationId,
    userId,
    createdAt: new Date().toISOString(),
    payload,
  }
}
