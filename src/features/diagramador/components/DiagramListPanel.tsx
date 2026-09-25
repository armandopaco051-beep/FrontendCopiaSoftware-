import { useState } from 'react'
import { Clock3, Download, FileCode2, Plus, Trash2, Upload } from 'lucide-react'
import type { DiagramaResponse, XmiExportProfile } from '../../../services/diagramaService'

type DiagramListPanelProps = {
  canEditDiagram: boolean
  diagramas: DiagramaResponse[]
  isSaving: boolean
  isXmiBusy: boolean
  newDiagramName: string
  selectedDiagrama: DiagramaResponse | null
  selectedProyecto: unknown
  formatDate: (value?: string | null) => string
  createDiagrama: () => void
  exportSelectedXmi: (profile: XmiExportProfile) => void
  importXmiFile: (file: File) => void
  openVersionHistory: () => void
  openDiagrama: (diagramaId: number) => void
  removeDiagrama: (diagrama: DiagramaResponse) => void
  setNewDiagramName: (value: string) => void
}

export function DiagramListPanel({
  canEditDiagram,
  createDiagrama,
  diagramas,
  formatDate,
  exportSelectedXmi,
  importXmiFile,
  isSaving,
  isXmiBusy,
  newDiagramName,
  openDiagrama,
  openVersionHistory,
  removeDiagrama,
  selectedDiagrama,
  selectedProyecto,
  setNewDiagramName,
}: DiagramListPanelProps) {
  const [xmiExportProfile, setXmiExportProfile] = useState<XmiExportProfile>('enterprise_architect')

  return (
    <>
      <div className="panel-title">
        <div>
          <p>Diagramas</p>
          <h2>Archivos</h2>
        </div>
      </div>

      <div className="student-create-row">
        <input
          disabled={!canEditDiagram}
          onChange={(event) => setNewDiagramName(event.target.value)}
          placeholder="Nombre del diagrama"
          value={newDiagramName}
        />
        <button className="ghost-button" disabled={isSaving || !selectedProyecto || !canEditDiagram} onClick={createDiagrama} type="button">
          <Plus size={18} />
        </button>
      </div>

      <div className="xmi-actions" aria-label="Importar y exportar XMI">
        <label className={!canEditDiagram || isXmiBusy || !selectedProyecto ? 'xmi-action disabled' : 'xmi-action'}>
          <Upload size={15} />
          <span>Importar XMI</span>
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

        <div className="xmi-export-group">
          <select
            aria-label="Formato de exportacion"
            className="xmi-export-profile"
            disabled={!selectedDiagrama || isXmiBusy}
            onChange={(event) => setXmiExportProfile(event.target.value as XmiExportProfile)}
            value={xmiExportProfile}
          >
            <option value="enterprise_architect">EA completo</option>
            <option value="standard">XMI estandar</option>
          </select>
          <button
            className="xmi-action"
            disabled={!selectedDiagrama || isXmiBusy}
            onClick={() => exportSelectedXmi(xmiExportProfile)}
            type="button"
          >
            <Download size={15} />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      <button
        className="version-history-link"
        disabled={!selectedDiagrama}
        onClick={openVersionHistory}
        type="button"
      >
        <Clock3 size={16} />
        Ver historial de versiones
      </button>

      <div className="diagram-list">
        {diagramas.map((diagrama) => (
          <article className={selectedDiagrama?.id === diagrama.id ? 'diagram-card active' : 'diagram-card'} key={diagrama.id}>
            <button onClick={() => openDiagrama(diagrama.id)} type="button">
              <FileCode2 size={18} />
              <span>
                <strong>{diagrama.nombre}</strong>
                <small>
                  v{diagrama.version} - {formatDate(diagrama.actualizado_en)}
                </small>
              </span>
            </button>
            <button className="icon-button danger" disabled={!canEditDiagram} onClick={() => removeDiagrama(diagrama)} type="button">
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>

      {diagramas.length === 0 ? <div className="empty-state compact">Crea un diagrama para empezar.</div> : null}
    </>
  )
}
