import { API_URL, ApiError, apiRequest } from './api'

export type DiagramNode = {
  id: string
  type: string
  position: {
    x: number
    y: number
  }
  style?: {
    width?: number | string
    height?: number | string
    [key: string]: unknown
  }
  data: {
    name: string
    attributes: Record<string, unknown>[]
    methods: Record<string, unknown>[]
    kind?: 'class' | 'abstractClass' | 'interface'
    templateParameters?: string[]
    [key: string]: unknown
  }
}

export type DiagramEdge = {
  id: string
  source: string
  target: string
  type?: string
  data?: Record<string, unknown>
}

export type DiagramContent = {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export type XmiExportProfile = 'standard' | 'enterprise_architect'

export type DiagramaCreate = {
  id_proyecto: number
  nombre: string
  contenido?: DiagramContent
}

export type DiagramaUpdate = {
  nombre?: string
  contenido?: DiagramContent
  autor_codigo?: string
}

export type DiagramaResponse = {
  id: number
  id_proyecto: number
  nombre: string
  contenido: DiagramContent
  version: number
  creado_en?: string | null
  actualizado_en?: string | null
}

export type VersionHistorialResponse = {
  id: number
  diagrama_id: number
  autor_id: string
  contenido: DiagramContent
  version: number
  fecha: string
  titulo?: string | null
  descripcion?: string | null
  tipo: string
  autor?: {
    codigo: string
    nombres: string
    apellidos: string
    email: string
  } | null
}

export type ClaseCreate = {
  id?: string
  name: string
  x?: number
  y?: number
  attributes?: Record<string, unknown>[]
  methods?: Record<string, unknown>[]
  autor_codigo?: string
}

export type ClaseUpdate = {
  name?: string
  attributes?: Record<string, unknown>[]
  methods?: Record<string, unknown>[]
  autor_codigo?: string
}

export type ClaseMove = {
  x: number
  y: number
  autor_codigo?: string
}

export function crearDiagrama(diagrama: DiagramaCreate) {
  return apiRequest<DiagramaResponse, DiagramaCreate>('/diagramas/', {
    method: 'POST',
    body: diagrama,
  })
}

export function listarDiagramas() {
  return apiRequest<DiagramaResponse[]>('/diagramas/')
}

export function listarDiagramasPorProyecto(idProyecto: number) {
  return apiRequest<DiagramaResponse[]>(`/diagramas/proyecto/${idProyecto}`)
}

export function abrirDiagrama(id: number) {
  return apiRequest<DiagramaResponse>(`/diagramas/${id}`)
}

export function listarVersionesDiagrama(id: number) {
  return apiRequest<VersionHistorialResponse[]>(`/diagramas/${id}/versiones`)
}

export function restaurarVersionDiagrama(id: number, versionId: number, autorCodigo?: string | null) {
  return apiRequest<DiagramaResponse, { autor_codigo?: string }>(`/diagramas/${id}/versiones/${versionId}/restaurar`, {
    method: 'POST',
    body: autorCodigo ? { autor_codigo: autorCodigo } : {},
  })
}

export function guardarDiagrama(id: number, diagrama: DiagramaUpdate) {
  return apiRequest<DiagramaResponse, DiagramaUpdate>(`/diagramas/${id}`, {
    method: 'PUT',
    body: diagrama,
  })
}

export function eliminarDiagrama(id: number) {
  return apiRequest<{ mensaje: string }>(`/diagramas/${id}`, {
    method: 'DELETE',
  })
}

export function agregarClase(diagramaId: number, clase: ClaseCreate) {
  return apiRequest<DiagramaResponse, ClaseCreate>(`/diagramas/${diagramaId}/clases`, {
    method: 'POST',
    body: clase,
  })
}

export function moverClase(diagramaId: number, claseId: string, posicion: ClaseMove) {
  return apiRequest<DiagramaResponse, ClaseMove>(
    `/diagramas/${diagramaId}/clases/${claseId}/mover`,
    {
      method: 'PATCH',
      body: posicion,
    },
  )
}

export function editarClase(diagramaId: number, claseId: string, clase: ClaseUpdate) {
  return apiRequest<DiagramaResponse, ClaseUpdate>(`/diagramas/${diagramaId}/clases/${claseId}`, {
    method: 'PUT',
    body: clase,
  })
}

export function eliminarClase(diagramaId: number, claseId: string, autorCodigo?: string) {
  const query = autorCodigo ? `?autor_codigo=${encodeURIComponent(autorCodigo)}` : ''

  return apiRequest<DiagramaResponse>(`/diagramas/${diagramaId}/clases/${claseId}${query}`, {
    method: 'DELETE',
  })
}

export async function importarXmiEnProyecto(proyectoId: number, file: File, nombre: string) {
  const token = localStorage.getItem('token')
  const formData = new FormData()
  formData.append('file', file)
  formData.append('nombre', nombre)

  const response = await fetch(`${API_URL}/proyectos/${proyectoId}/diagramas/import/xmi`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo importar el archivo XMI.',
      response.status,
      data?.detail,
    )
  }

  return data as DiagramaResponse
}

export async function importarXmiEnDiagrama(diagramaId: number, file: File) {
  const token = localStorage.getItem('token')
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_URL}/diagramas/${diagramaId}/import/xmi`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo importar el archivo XMI.',
      response.status,
      data?.detail,
    )
  }

  return data as DiagramaResponse
}

export async function exportarDiagramaXmi(
  diagramaId: number,
  profile: XmiExportProfile = 'enterprise_architect',
) {
  const token = localStorage.getItem('token')

  const response = await fetch(`${API_URL}/diagramas/${diagramaId}/export/xmi?profile=${encodeURIComponent(profile)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo exportar el archivo XMI.',
      response.status,
      data?.detail,
    )
  }

  return response.blob()
}
