import { MarkerType } from '@xyflow/react'
import type { ClassFlowEdge, ClassFlowNode, RelationOption, RelationType, UmlRelationData } from '../types/relation.types'

export const cardinalityOptions = ['1', '0..1', '0..*', '1..*'] as const
export const relationTypesWithoutCardinality: RelationType[] = ['generalization']

export function normalizeCardinality(value: unknown) {
  if (value === '*') {
    return '0..*'
  }

  return cardinalityOptions.includes(value as (typeof cardinalityOptions)[number])
    ? (value as (typeof cardinalityOptions)[number])
    : '1'
}

export const relationTypes: RelationOption[] = [
  {
    id: 'association',
    label: 'Association',
    description: 'Relacion normal entre clases',
    symbol: 'ASS',
  },
  {
    id: 'generalization',
    label: 'Generalization',
    description: 'Herencia o especializacion',
    symbol: 'GEN',
  },
  {
    id: 'composition',
    label: 'Composition',
    description: 'Composicion fuerte',
    symbol: 'COM',
  },
  {
    id: 'aggregation',
    label: 'Aggregation',
    description: 'Agregacion debil',
    symbol: 'AGR',
  },
  {
    id: 'associationClass',
    label: 'Association Class',
    description: 'Relacion con datos propios',
    symbol: 'ACL',
  },
  {
    id: 'realization',
    label: 'Realization',
    description: 'Implementacion de contrato',
    symbol: 'REA',
  },
  {
    id: 'templateBinding',
    label: 'Template Binding',
    description: 'Vinculo de plantilla',
    symbol: 'TPL',
  },
]

export const legacyRelationTypeMap: Record<string, RelationType> = {
  associate: 'association',
  generalize: 'generalization',
  compose: 'composition',
  aggregate: 'aggregation',
  realize: 'realization',
}

export function normalizeRelationType(value: unknown): RelationType {
  if (typeof value === 'string' && legacyRelationTypeMap[value]) {
    return legacyRelationTypeMap[value]
  }

  return relationTypes.some((relation) => relation.id === value) ? (value as RelationType) : 'association'
}

export function relationUsesCardinality(value: unknown) {
  return !relationTypesWithoutCardinality.includes(normalizeRelationType(value))
}

export function getRelationLabel(relationType: RelationType) {
  return relationTypes.find((relation) => relation.id === relationType)?.label ?? 'Association'
}

export function getRelationSymbol(relationType: RelationType) {
  return relationTypes.find((relation) => relation.id === relationType)?.symbol ?? 'ASS'
}

export function getRelationDisplay(data?: Partial<UmlRelationData>) {
  const relationType = normalizeRelationType(data?.relationType)
  if (!relationUsesCardinality(relationType)) {
    return data?.name ? String(data.name) : getRelationLabel(relationType)
  }
  const sourceCardinality = String(data?.sourceCardinality ?? '1..*')
  const targetCardinality = String(data?.targetCardinality ?? '1')
  const name = data?.name ? ` ${data.name} ` : ` ${getRelationLabel(relationType)} `

  return `${sourceCardinality}${name}${targetCardinality}`
}

function getNodeDimension(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
}

const relationNodeGap = 10

export function getRelationEdgeProps(relationType: RelationType): Partial<ClassFlowEdge> {
  const isDashed =
    relationType === 'realization' || relationType === 'templateBinding' || relationType === 'associationClass'
  const base = {
    type: 'umlRelation',
    className: `relation-edge relation-edge-${relationType}`,
    animated: relationType === 'realization' || relationType === 'templateBinding',
    style: {
      stroke: '#dbeafe',
      strokeWidth: 3,
      strokeDasharray: isDashed ? '7 6' : undefined,
    },
  }

  if (relationType === 'association') {
    return {
      ...base,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#dbeafe',
      },
    }
  }

  if (relationType === 'generalization' || relationType === 'realization') {
    return {
      ...base,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#dbeafe',
        width: 22,
        height: 22,
      },
    }
  }

  if (relationType === 'composition' || relationType === 'aggregation') {
    return {
      ...base,
      markerStart: {
        type: MarkerType.ArrowClosed,
        color: relationType === 'composition' ? '#8fb6ff' : '#dbeafe',
        width: 18,
        height: 18,
      },
    }
  }

  return base
}

export function getRelationPath(source: ClassFlowNode, target: ClassFlowNode) {
  const sourceWidth = getNodeDimension(source.width ?? source.style?.width, 245)
  const sourceHeight = getNodeDimension(source.height ?? source.style?.height, 138)
  const targetWidth = getNodeDimension(target.width ?? target.style?.width, 245)
  const targetHeight = getNodeDimension(target.height ?? target.style?.height, 138)

  if (source.id === target.id) {
    const sourceX = source.position.x + sourceWidth + relationNodeGap
    const sourceY = source.position.y + sourceHeight * 0.42
    const targetX = source.position.x + sourceWidth * 0.62
    const targetY = source.position.y - relationNodeGap
    const loopRight = source.position.x + sourceWidth + 92
    const loopTop = source.position.y - 82
    const midX = source.position.x + sourceWidth + 62
    const midY = source.position.y - 48

    return {
      d: `M ${sourceX} ${sourceY} C ${loopRight} ${sourceY}, ${loopRight} ${loopTop}, ${targetX} ${loopTop} C ${source.position.x + sourceWidth * 0.82} ${loopTop}, ${targetX} ${loopTop + 28}, ${targetX} ${targetY}`,
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourceAngle: 0,
      targetAngle: 90,
      midX,
      midY,
      sourceLabelX: sourceX + 24,
      sourceLabelY: sourceY - 10,
      targetLabelX: targetX + 18,
      targetLabelY: targetY - 16,
    }
  }

  const sourceConnectionY = sourceHeight / 2
  const sourceConnectionX = sourceWidth / 2
  const targetConnectionY = targetHeight / 2
  const targetConnectionX = targetWidth / 2
  const sourceIsLeft = source.position.x <= target.position.x
  const sourceIsAbove = source.position.y <= target.position.y
  const horizontalDistance = Math.abs(target.position.x - source.position.x)
  const verticalDistance = Math.abs(target.position.y - source.position.y)
  const useHorizontalExit = horizontalDistance >= verticalDistance * 0.75

  const sourceX = useHorizontalExit
    ? source.position.x + (sourceIsLeft ? sourceWidth + relationNodeGap : -relationNodeGap)
    : source.position.x + sourceConnectionX
  const sourceY = useHorizontalExit
    ? source.position.y + sourceConnectionY
    : source.position.y + (sourceIsAbove ? sourceHeight + relationNodeGap : -relationNodeGap)
  const targetX = useHorizontalExit
    ? target.position.x + (sourceIsLeft ? -relationNodeGap : targetWidth + relationNodeGap)
    : target.position.x + targetConnectionX
  const targetY = useHorizontalExit
    ? target.position.y + targetConnectionY
    : target.position.y + (sourceIsAbove ? -relationNodeGap : targetHeight + relationNodeGap)
  const midX = sourceX + (targetX - sourceX) / 2
  const midY = sourceY + (targetY - sourceY) / 2
  const corner = 18
  const targetAngle = useHorizontalExit ? (sourceIsLeft ? 0 : 180) : sourceIsAbove ? 90 : -90
  const sourceAngle = targetAngle
  const d = useHorizontalExit
    ? `M ${sourceX} ${sourceY} L ${midX - corner * (sourceIsLeft ? 1 : -1)} ${sourceY} Q ${midX} ${sourceY} ${midX} ${sourceY + corner * Math.sign(targetY - sourceY || 1)} L ${midX} ${targetY - corner * Math.sign(targetY - sourceY || 1)} Q ${midX} ${targetY} ${midX + corner * (sourceIsLeft ? 1 : -1)} ${targetY} L ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} L ${sourceX} ${midY - corner * (sourceIsAbove ? 1 : -1)} Q ${sourceX} ${midY} ${sourceX + corner * Math.sign(targetX - sourceX || 1)} ${midY} L ${targetX - corner * Math.sign(targetX - sourceX || 1)} ${midY} Q ${targetX} ${midY} ${targetX} ${midY + corner * (sourceIsAbove ? 1 : -1)} L ${targetX} ${targetY}`

  return {
    d,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourceAngle,
    targetAngle,
    midX,
    midY,
    sourceLabelX: sourceX + (useHorizontalExit ? (sourceIsLeft ? 24 : -24) : 0),
    sourceLabelY: sourceY + (useHorizontalExit ? 22 : sourceIsAbove ? 26 : -16),
    targetLabelX: targetX + (useHorizontalExit ? (sourceIsLeft ? -24 : 24) : 0),
    targetLabelY: targetY + (useHorizontalExit ? 22 : sourceIsAbove ? -14 : 28),
  }
}
