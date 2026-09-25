import { ApiError } from './api'
import type { DiagramaResponse } from './diagramaService'

export const AI_API_URL = (import.meta.env.VITE_AI_API_URL || 'https://iabackend-copia.onrender.com').replace(/\/$/, '')

export type AiPlannerRequest = {
  message: string
  proyecto_id: number
  diagrama_id: number
}

export type AiPlannerAction = {
  order: number
  tool: string
  description: string
  arguments: Record<string, unknown>
  requires_confirmation: boolean
}

export type AiPlannerQuestion =
  | string
  | {
    question?: string
    text?: string
    message?: string
    [key: string]: unknown
  }

export type AiPlannerResponse = {
  intent: string
  summary: string
  actions: AiPlannerAction[]
  questions: AiPlannerQuestion[]
  can_execute: boolean
}

export type AiImageAttribute = {
  name: string
  type: string
  primaryKey: boolean
  foreignKey: boolean
  nullable: boolean
}

export type AiImageMethod = {
  name: string
  returnType: string
  parameters: Array<{ name: string; type: string }>
}

export type AiImageClass = {
  name: string
  kind: 'class' | 'abstractClass' | 'interface'
  attributes: AiImageAttribute[]
  methods: AiImageMethod[]
  templateParameters: string[]
  confidence: number
}

export type AiImageRelation = {
  sourceName: string
  targetName: string
  relationType: string
  sourceCardinality: '1' | '0..1' | '0..*' | '1..*' | null
  targetCardinality: '1' | '0..1' | '0..*' | '1..*' | null
  associationClassName?: string | null
  sourceRole?: string | null
  targetRole?: string | null
  confidence: number
}

export type AiImageDiagramResponse = {
  summary: string
  classes: AiImageClass[]
  relations: AiImageRelation[]
  actions: AiPlannerAction[]
  warnings: string[]
  questions: string[]
  can_execute: boolean
  image_metadata: Record<string, unknown>
}

type AnalyzeDiagramImageOptions = {
  image: File
  proyectoId: number
  diagramaId: number
  message?: string
}

export async function analyzeDiagramImage({
  image,
  proyectoId,
  diagramaId,
  message = 'Transcribe fielmente las clases, atributos, relaciones y multiplicidades visibles.',
}: AnalyzeDiagramImageOptions) {
  const token = localStorage.getItem('token')
  const formData = new FormData()
  formData.append('image', image)
  formData.append('proyecto_id', String(proyectoId))
  formData.append('diagrama_id', String(diagramaId))
  formData.append('message', message)

  const headers: HeadersInit = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${AI_API_URL}/ai/image/analyze`, {
    method: 'POST',
    headers,
    body: formData,
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo analizar la imagen del diagrama.',
      response.status,
      data?.detail,
    )
  }

  return data as AiImageDiagramResponse
}

export async function planWithAi(body: AiPlannerRequest) {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${AI_API_URL}/ai/planner`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo planificar con el agente IA.',
      response.status,
      data?.detail,
    )
  }

  return data as AiPlannerResponse
}



export type DiagramExecutePlanRequest = {
  diagrama_id: number
  autor_codigo: string
  confirmed: true
  actions: AiPlannerAction[]
}

export type DiagramExecutePlanResponse = {
  success: boolean
  message: string
  executed: Record<string, unknown>[]
  failed_action?: AiPlannerAction | null
  diagrama?: DiagramaResponse | null
}

export async function executeDiagramPlan(body: DiagramExecutePlanRequest) {
  const token = localStorage.getItem('token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${AI_API_URL}/ai/diagram/execute-plan`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo ejecutar el plan del agente IA.',
      response.status,
      data?.detail,
    )
  }

  return data as DiagramExecutePlanResponse
}

export type AiCodegenFile = {
  path: string
  language: string
  content: string
}

export type GenerateSpringBackendRequest = {
  proyecto_id: number
  diagrama_id: number
  message: string
  target: 'spring_boot'
  project_name: string
  base_package: string
  database_name: string
}

export type GenerateSpringBackendResponse = {
  success: boolean
  summary: string
  target: string
  project_name: string
  base_package: string
  database_name: string
  files: AiCodegenFile[]
  warnings: string[]
  generation_id?: string | null
  download_url?: string | null
}

function getAuthorizationHeaders() {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

export async function generateSpringBackend(body: GenerateSpringBackendRequest) {
  const response = await fetch(`${AI_API_URL}/ai/codegen`, {
    method: 'POST',
    headers: getAuthorizationHeaders(),
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo generar el backend Spring Boot.',
      response.status,
      data?.detail,
    )
  }

  return data as GenerateSpringBackendResponse
}

type DownloadGeneratedBackendOptions = {
  generationId?: string | null
  downloadUrl?: string | null
  projectName: string
}

export async function downloadGeneratedBackend({
  downloadUrl,
  generationId,
  projectName,
}: DownloadGeneratedBackendOptions) {
  if (!generationId && !downloadUrl) {
    throw new ApiError('No hay un ZIP generado para descargar.', 400, null)
  }

  const token = localStorage.getItem('token')
  const headers: HeadersInit = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const downloadEndpoint = downloadUrl
    ? downloadUrl.startsWith('http')
      ? downloadUrl
      : `${AI_API_URL}${downloadUrl}`
    : `${AI_API_URL}/ai/codegen/${encodeURIComponent(generationId!)}/download`

  const response = await fetch(downloadEndpoint, {
    method: 'GET',
    headers,
  })

  const contentType = response.headers.get('content-type') ?? ''

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiError(
      data?.detail ?? data?.message ?? 'No se pudo descargar el ZIP generado.',
      response.status,
      data?.detail,
    )
  }

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null)
    throw new ApiError(
      data?.detail ?? data?.message ?? 'El backend no devolvio un archivo ZIP.',
      response.status,
      data?.detail,
    )
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new ApiError('El ZIP generado esta vacio o no fue devuelto por el backend.', response.status, null)
  }

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const cleanProjectName = projectName.trim() || generationId || 'backend-generado'

  anchor.href = objectUrl
  anchor.download = `${cleanProjectName}.zip`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
