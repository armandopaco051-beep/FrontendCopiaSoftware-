import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ViewportPortal,
} from '@xyflow/react'
import type { Connection, OnConnect, OnEdgesChange, OnNodeDrag, OnNodesChange } from '@xyflow/react'
import { FileCode2, Plus } from 'lucide-react'
import type { DiagramaResponse } from '../../../services/diagramaService'
import { UmlRelationEdge } from '../../diagrams/components/edges/UmlRelationEdge'
import type { ClassFlowEdge, ClassFlowNode, RelationType } from '../../diagrams/types/relation.types'
import { getRelationPath, normalizeRelationType, relationUsesCardinality } from '../../diagrams/utils/relation-markers'
import { ClassNode } from './ClassNode'

const nodeTypes = {
  classNode: ClassNode,
}

const edgeTypes = {
  umlRelation: UmlRelationEdge,
}

type RelationEndpointProps = {
  angle: number
  relationType: RelationType
  variant: 'source' | 'target'
  x: number
  y: number
}

function RelationEndpoint({ angle, relationType, variant, x, y }: RelationEndpointProps) {
  const transform = `translate(${x} ${y}) rotate(${angle})`

  if (variant === 'target' && relationType === 'association') {
    return <polyline className="relation-symbol relation-symbol-arrow" points="-18,-8 0,0 -18,8" transform={transform} />
  }

  if (variant === 'target' && (relationType === 'generalization' || relationType === 'realization')) {
    return <polygon className="relation-symbol relation-symbol-triangle" points="0,0 -22,-11 -22,11" transform={transform} />
  }

  if (variant === 'source' && (relationType === 'composition' || relationType === 'aggregation')) {
    return (
      <polygon
        className={`relation-symbol relation-symbol-diamond relation-symbol-${relationType}`}
        points="0,0 13,-9 26,0 13,9"
        transform={transform}
      />
    )
  }

  if (variant === 'target' && relationType === 'templateBinding') {
    return <polyline className="relation-symbol relation-symbol-arrow" points="-16,-7 0,0 -16,7" transform={transform} />
  }

  return null
}

type DiagramCanvasProps = {
  canEditDiagram: boolean
  edges: ClassFlowEdge[]
  nodes: ClassFlowNode[]
  selectedDiagrama: DiagramaResponse | null
  selectedEdgeId: string
  theme: 'dark' | 'light'
  connectNodes: OnConnect
  onCreateDiagram?: () => void
  onEdgesChange: OnEdgesChange<ClassFlowEdge>
  onNodeDrag: OnNodeDrag<ClassFlowNode>
  onNodesChange: OnNodesChange<ClassFlowNode>
  saveNodePosition: OnNodeDrag<ClassFlowNode>
  setSelectedEdgeId: (edgeId: string) => void
  setSelectedNodeId: (nodeId: string) => void
  setStoredSelectedRelationId: (relationId: string) => void
}

export function DiagramCanvas({
  canEditDiagram,
  connectNodes,
  edges,
  nodes,
  onCreateDiagram,
  onEdgesChange,
  onNodeDrag,
  onNodesChange,
  saveNodePosition,
  selectedDiagrama,
  selectedEdgeId,
  setSelectedEdgeId,
  setSelectedNodeId,
  setStoredSelectedRelationId,
  theme,
}: DiagramCanvasProps) {
  return (
    <div className="react-flow-canvas">
      <ReactFlow
        colorMode={theme}
        connectionLineStyle={{ stroke: '#8fb6ff', strokeWidth: 2 }}
        connectionMode={ConnectionMode.Loose}
        edges={edges}
        edgeTypes={edgeTypes}
        elevateEdgesOnSelect
        fitView
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={canEditDiagram}
        nodesDraggable={canEditDiagram}
        onConnect={connectNodes as (connection: Connection) => void}
        onEdgesChange={onEdgesChange}
        onEdgeClick={(_event, edge) => {
          setSelectedEdgeId(edge.id)
          setSelectedNodeId('')
        }}
        onNodeClick={(_event, node) => {
          setSelectedNodeId(node.id)
          setSelectedEdgeId('')
        }}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={saveNodePosition}
        onNodesChange={onNodesChange}
        onPaneClick={() => {
          setSelectedNodeId('')
          setSelectedEdgeId('')
          setStoredSelectedRelationId('')
        }}
        panOnScroll={false}
        preventScrolling={false}
        zoomActivationKeyCode="Control"
        zoomOnPinch
        zoomOnScroll
      >
        <Background gap={28} />
        <ViewportPortal>
          {edges.map((edge) => {
            const source = nodes.find((node) => node.id === edge.source)
            const target = nodes.find((node) => node.id === edge.target)

            if (!source || !target) {
              return null
            }

            const path = getRelationPath(source, target)
            const relationType = normalizeRelationType(edge.data?.relationType)
            const showCardinality = relationUsesCardinality(relationType)
            const associationClassId = edge.data?.associationClassId
            const associationClassNode =
              typeof associationClassId === 'string' ? nodes.find((node) => node.id === associationClassId) : null
            const associationClassCenterX = associationClassNode ? associationClassNode.position.x + 122.5 : 0
            const associationClassConnectorY = associationClassNode
              ? associationClassNode.position.y + (associationClassNode.position.y <= path.midY ? 138 : 0)
              : 0

            return (
              <svg className="relation-overlay" key={edge.id}>
                <path
                  className={`relation-overlay-path relation-overlay-${relationType} ${
                    selectedEdgeId === edge.id ? 'selected' : ''
                  }`}
                  d={path.d}
                />
                <RelationEndpoint angle={path.sourceAngle} relationType={relationType} variant="source" x={path.sourceX} y={path.sourceY} />
                <RelationEndpoint angle={path.targetAngle} relationType={relationType} variant="target" x={path.targetX} y={path.targetY} />
                {relationType === 'associationClass' ? (
                  <g className="relation-association-class-badge" transform={`translate(${path.midX - 39} ${path.midY - 15})`}>
                    <rect height="30" rx="7" width="78" />
                    <text x="39" y="19">
                      assoc. class
                    </text>
                  </g>
                ) : null}
                {relationType === 'associationClass' && associationClassNode ? (
                  <path
                    className="relation-association-class-link"
                    d={`M ${associationClassCenterX} ${associationClassConnectorY} L ${path.midX} ${path.midY}`}
                  />
                ) : null}
                {showCardinality ? (
                  <>
                    <text className="relation-overlay-label" x={path.sourceLabelX} y={path.sourceLabelY}>
                      {edge.data?.sourceCardinality ?? '1..*'}
                    </text>
                    <text className="relation-overlay-label" x={path.targetLabelX} y={path.targetLabelY}>
                      {edge.data?.targetCardinality ?? '1'}
                    </text>
                  </>
                ) : null}
              </svg>
            )
          })}
        </ViewportPortal>
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {!selectedDiagrama ? (
        <div className="flow-empty-overlay">
          <FileCode2 size={32} />
          <strong>Abre o crea un diagrama</strong>
          <span>Crea tu primer diagrama para comenzar a diseñar clases y relaciones.</span>
          {canEditDiagram && onCreateDiagram ? (
            <button
              className="primary-action"
              onClick={onCreateDiagram}
              style={{
                marginTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              type="button"
            >
              <Plus size={18} />
              Crear Diagrama Principal
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
