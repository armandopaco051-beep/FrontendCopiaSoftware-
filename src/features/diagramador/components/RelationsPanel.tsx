import { ArrowLeftRight, Link2, Trash2 } from 'lucide-react'
import type { Cardinality, ClassFlowEdge, ClassFlowNode, RelationType } from '../../diagrams/types/relation.types'
import {
  cardinalityOptions,
  getRelationLabel,
  normalizeRelationType,
  relationTypes,
  relationUsesCardinality,
} from '../../diagrams/utils/relation-markers'
import { RelationTypeIcon } from './RelationTypeIcon'

type RelationsPanelProps = {
  canEditDiagram: boolean
  edges: ClassFlowEdge[]
  isSaving: boolean
  selectedEdgeId: string
  selectedRelationType: RelationType
  getClassNameById: (classId: string) => string
  invertRelationDirection: (edgeId: string) => void
  removeRelation: (edgeId: string) => void
  updateRelation: (edgeId: string, relationType: RelationType) => void
  updateRelationCardinality: (edgeId: string, key: 'sourceCardinality' | 'targetCardinality', value: string) => void
}

type RelationBuilderPanelProps = RelationsPanelProps & {
  isOpen: boolean
  nodes: ClassFlowNode[]
  relationSourceId: string
  relationTargetId: string
  selectedDiagrama: unknown
  createRelationFromPanel: () => void
  onRelationTypeChange: (relationType: RelationType) => void
  onSelectEdge: (edgeId: string) => void
  onSourceChange: (classId: string) => void
  onTargetChange: (classId: string) => void
  onToggleOpen: () => void
}

export function RelationBuilderPanel({
  canEditDiagram,
  createRelationFromPanel,
  edges,
  getClassNameById,
  invertRelationDirection,
  isOpen,
  isSaving,
  nodes,
  onRelationTypeChange,
  onSelectEdge,
  onSourceChange,
  onTargetChange,
  onToggleOpen,
  relationSourceId,
  relationTargetId,
  removeRelation,
  selectedDiagrama,
  selectedEdgeId,
  selectedRelationType,
  updateRelationCardinality,
}: RelationBuilderPanelProps) {
  return (
    <section className="relations-panel side-relations-panel">
      <header>
        <div>
          <p>Relaciones</p>
          <h2>{edges.length > 0 ? `${edges.length} creadas` : 'Sin relaciones'}</h2>
        </div>
        <span>{getRelationLabel(selectedRelationType)}</span>
      </header>

      <div className="side-relation-builder">
        <button
          aria-expanded={isOpen}
          className="relation-toolbox-header"
          onClick={onToggleOpen}
          type="button"
        >
          <div>
            <p>Tipo</p>
            <h2>Linea UML</h2>
          </div>
          <span>
            <RelationTypeIcon type={selectedRelationType} />
          </span>
        </button>

        {isOpen ? (
          <div className="relation-toolbox-body">
            <div className="relation-options">
              {relationTypes.map((relation) => (
                <button
                  className={selectedRelationType === relation.id ? 'relation-option active' : 'relation-option'}
                  disabled={!canEditDiagram}
                  key={relation.id}
                  onClick={() => onRelationTypeChange(relation.id)}
                  type="button"
                >
                  <span>
                    <RelationTypeIcon type={relation.id} />
                  </span>
                  <strong>{relation.label}</strong>
                  <small>{relation.description}</small>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="relation-builder">
          <label>
            Origen
            <select
              disabled={nodes.length < 1 || !canEditDiagram}
              onChange={(event) => onSourceChange(event.target.value)}
              value={relationSourceId}
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Destino
            <select
              disabled={nodes.length < 1 || !canEditDiagram}
              onChange={(event) => onTargetChange(event.target.value)}
              value={relationTargetId}
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="primary-action"
            disabled={!selectedDiagrama || nodes.length < 1 || isSaving || !canEditDiagram}
            onClick={createRelationFromPanel}
            type="button"
          >
            <Link2 size={18} /> Crear relacion
          </button>
        </div>
      </div>

      {edges.length > 0 ? (
        <div className="side-relations-list">
          {edges.map((edge) => {
            const relationType = normalizeRelationType(edge.data?.relationType)

            return (
              <article className={selectedEdgeId === edge.id ? 'side-relation-card active' : 'side-relation-card'} key={edge.id}>
                <button onClick={() => onSelectEdge(edge.id)} type="button">
                  <strong>{getClassNameById(edge.source)}</strong>
                  <span>{getRelationLabel(relationType)}</span>
                  <strong>{getClassNameById(edge.target)}</strong>
                </button>
                <div>
                  {relationUsesCardinality(relationType) ? (
                    <>
                      <select
                        aria-label="Cardinalidad origen"
                        disabled={!canEditDiagram}
                        onChange={(event) => updateRelationCardinality(edge.id, 'sourceCardinality', event.target.value)}
                        value={String(edge.data?.sourceCardinality ?? '1..*')}
                      >
                        {cardinalityOptions.map((cardinality) => (
                          <option key={cardinality} value={cardinality}>
                            {cardinality}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Cardinalidad destino"
                        disabled={!canEditDiagram}
                        onChange={(event) => updateRelationCardinality(edge.id, 'targetCardinality', event.target.value)}
                        value={String(edge.data?.targetCardinality ?? '1')}
                      >
                        {cardinalityOptions.map((cardinality) => (
                          <option key={cardinality} value={cardinality}>
                            {cardinality}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <button
                    aria-label="Invertir direccion"
                    className="icon-button"
                    disabled={isSaving || !canEditDiagram}
                    onClick={() => invertRelationDirection(edge.id)}
                    title="Invertir direccion"
                    type="button"
                  >
                    <ArrowLeftRight size={15} />
                  </button>
                  <button
                    aria-label="Eliminar relacion"
                    className="icon-button danger"
                    disabled={isSaving || !canEditDiagram}
                    onClick={() => removeRelation(edge.id)}
                    title="Eliminar relacion"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="features-empty compact">
          <Link2 size={18} />
          <span>Conecta clases o crea una relacion aqui.</span>
        </div>
      )}
    </section>
  )
}

export function RelationsPanel({
  canEditDiagram,
  edges,
  getClassNameById,
  invertRelationDirection,
  isSaving,
  removeRelation,
  selectedEdgeId,
  selectedRelationType,
  updateRelation,
  updateRelationCardinality,
}: RelationsPanelProps) {
  return (
    <section className="relations-panel">
      <header>
        <div>
          <p>Relaciones</p>
          <h2>{edges.length > 0 ? `${edges.length} en el diagrama` : 'Sin relaciones'}</h2>
        </div>
        <span>{getRelationLabel(selectedRelationType)}</span>
      </header>

      {edges.length > 0 ? (
        <div className="relations-table">
          <div className="relations-row relations-head">
            <span>Origen</span>
            <span>Card.</span>
            <span>Tipo</span>
            <span>Card.</span>
            <span>Destino</span>
            <span />
          </div>

          {edges.map((edge) => {
            const relationType = normalizeRelationType(edge.data?.relationType)

            return (
              <article className={selectedEdgeId === edge.id ? 'relations-row active' : 'relations-row'} key={edge.id}>
                <strong>{getClassNameById(edge.source)}</strong>
                {relationUsesCardinality(relationType) ? (
                  <select
                    aria-label="Cardinalidad origen"
                    disabled={!canEditDiagram}
                    onChange={(event) => updateRelationCardinality(edge.id, 'sourceCardinality', event.target.value)}
                    value={String(edge.data?.sourceCardinality ?? '1..*')}
                  >
                    {cardinalityOptions.map((cardinality: Cardinality) => (
                      <option key={cardinality} value={cardinality}>
                        {cardinality}
                      </option>
                    ))}
                  </select>
                ) : <span aria-hidden="true" />}
                <select
                  disabled={!canEditDiagram}
                  onChange={(event) => updateRelation(edge.id, event.target.value as RelationType)}
                  value={relationType}
                >
                  {relationTypes.map((relation) => (
                    <option key={relation.id} value={relation.id}>
                      {relation.label}
                    </option>
                  ))}
                </select>
                {relationUsesCardinality(relationType) ? (
                  <select
                    aria-label="Cardinalidad destino"
                    disabled={!canEditDiagram}
                    onChange={(event) => updateRelationCardinality(edge.id, 'targetCardinality', event.target.value)}
                    value={String(edge.data?.targetCardinality ?? '1')}
                  >
                    {cardinalityOptions.map((cardinality: Cardinality) => (
                      <option key={cardinality} value={cardinality}>
                        {cardinality}
                      </option>
                    ))}
                  </select>
                ) : <span aria-hidden="true" />}
                <strong>{getClassNameById(edge.target)}</strong>
                <div className="relation-actions">
                  <button
                    aria-label="Invertir direccion"
                    className="icon-button"
                    disabled={isSaving || !canEditDiagram}
                    onClick={() => invertRelationDirection(edge.id)}
                    title="Invertir direccion"
                    type="button"
                  >
                    <ArrowLeftRight size={15} />
                  </button>
                  <button
                    aria-label="Eliminar relacion"
                    className="icon-button danger"
                    disabled={isSaving || !canEditDiagram}
                    onClick={() => removeRelation(edge.id)}
                    title="Eliminar relacion"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="features-empty compact">
          <Link2 size={18} />
          <span>Conecta dos clases para verla aqui y guardarla.</span>
        </div>
      )}
    </section>
  )
}
