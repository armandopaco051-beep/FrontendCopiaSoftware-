import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Mic, MicOff, Send } from 'lucide-react'
import { ApiError } from '../../services/api'
import { useProjectChat } from './useProjectChat'
import type { TextProvider } from '../../services/chatService'
import { ChatScopeSelector } from './ChatScopeSelector'
import { AiProviderSelector } from './AiProviderSelector'
import type { ChatScope } from './ChatScopeSelector'
import { getUserProfileFromToken } from '../../utils/auth'
import type { DiagramaResponse } from '../../services/diagramaService'
import type { AiPlannerAction, AiPlannerQuestion } from '../../services/aiService'
import {
  executeDiagramPlan,
} from '../../services/aiService'

type SpeechRecognitionAlternativeLike = {
  transcript: string
  confidence?: number
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  0: SpeechRecognitionAlternativeLike
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: {
    length: number
    [index: number]: SpeechRecognitionResultLike
  }
}

type SpeechRecognitionErrorEventLike = Event & {
  error: string
  message?: string
}

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = {
  new(): BrowserSpeechRecognition
}

function getDictationLanguage(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language
    if (lang.toLowerCase().startsWith('es')) {
      return lang
    }
  }
  return 'es-ES'
}

function getSpeechRecognitionConstructor() {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }

  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
}

type AiPlannerPanelProps = {
  proyectoId?: number | null
  diagramaId?: number | null
  diagramaNombre?: string
  autorCodigo?: string | null
  compact?: boolean
  canEdit?: boolean
  onDiagramUpdated?: (diagrama: DiagramaResponse) => void
}

type ActionablePlan = {
  summary: string
  actions: AiPlannerAction[]
  questions: AiPlannerQuestion[]
  can_execute: boolean
  diagrama_version?: number
}

type ChatMessage = {
  id: string
  createdAt: string
  senderCode?: string | null
  diagramId?: number | null
  retryMessageId?: number
  role: 'user' | 'assistant' | 'error'
  text: string
  senderName?: string
  recipientName?: string
  providerLabel?: string
  plan?: ActionablePlan
  warnings?: string[]
  questions?: AiPlannerQuestion[]
  imageStats?: { classes: number; relations: number }
}

function readStoredPlan(value: Record<string, unknown> | null): ActionablePlan | undefined {
  if (!value || typeof value.summary !== 'string' || typeof value.can_execute !== 'boolean'
    || !Array.isArray(value.actions) || !Array.isArray(value.questions)) return undefined
  if (!value.actions.every((action) => action && typeof action === 'object'
    && typeof action.order === 'number' && typeof action.tool === 'string'
    && typeof action.description === 'string' && typeof action.arguments === 'object'
    && action.arguments !== null && typeof action.requires_confirmation === 'boolean')) return undefined
  if (!value.questions.every((question) => typeof question === 'string')) return undefined
  return value as ActionablePlan
}

function readImageStats(value: Record<string, unknown> | null): ChatMessage['imageStats'] {
  const stats = value?.imageStats
  if (!stats || typeof stats !== 'object' || !('classes' in stats) || !('relations' in stats)
    || typeof stats.classes !== 'number' || typeof stats.relations !== 'number') return undefined
  return { classes: stats.classes, relations: stats.relations }
}

function getQuestionText(question: AiPlannerQuestion) {
  if (typeof question === 'string') {
    return question
  }
  return question.question ?? question.text ?? question.message ?? JSON.stringify(question)
}

function createMessage(
  role: ChatMessage['role'],
  text: string,
  plan?: ActionablePlan,
  options?: Pick<ChatMessage, 'warnings' | 'questions' | 'imageStats' | 'senderName'>,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    role,
    text,
    plan,
    ...options,
  }
}

export function AiPlannerPanel({
  compact = false,
  diagramaId,
  diagramaNombre,
  proyectoId,
  autorCodigo,
  canEdit = true,
  onDiagramUpdated,
}: AiPlannerPanelProps) {
  const [chatScope, setChatScope] = useState<ChatScope>('individual')
  const [textProvider, setTextProvider] = useState<TextProvider>(() => localStorage.getItem('drawschema:text-provider') === 'local' ? 'local' : 'gemini')
  const [conversationMessages, setConversationMessages] = useState<Record<string, ChatMessage[]>>({})
  const [localProyectoId, setLocalProyectoId] = useState(proyectoId ? String(proyectoId) : '')
  const [localDiagramaId, setLocalDiagramaId] = useState(diagramaId ? String(diagramaId) : '')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingSends, setPendingSends] = useState(0)
  const [queuedMessages, setQueuedMessages] = useState<Array<{ id: number; key: string; text: string }>>([])
  const nextQueuedId = useRef(0)
  const replyQueueRef = useRef(Promise.resolve())
  const planDecisionRef = useRef<(() => void) | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [localRequestStartedAt, setLocalRequestStartedAt] = useState<number | null>(null)
  const [localElapsedSeconds, setLocalElapsedSeconds] = useState(0)
  const [localTypicalSeconds, setLocalTypicalSeconds] = useState<number | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isPreparingVoice, setIsPreparingVoice] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const speechTimeoutRef = useRef<number | undefined>(undefined)
  const dictationBaseTextRef = useRef('')
  const panelMountedRef = useRef(true)

  const activeProyectoId = proyectoId ?? Number(localProyectoId)
  const activeDiagramaId = diagramaId ?? Number(localDiagramaId)
  const composerBusy = isApplying || isAnalyzingImage || isPreparingVoice
  const isBusy = isLoading || pendingSends > 0 || composerBusy
  const groupPending = chatScope === 'grupal' // Shared image attachments are not enabled yet.
  const currentUser = getUserProfileFromToken(localStorage.getItem('token'))
  const chat = useProjectChat(activeProyectoId, chatScope, currentUser?.codigo || autorCodigo || '')

  const conversationKey = [
    currentUser?.codigo || autorCodigo || 'sin-sesion',
    activeProyectoId,
    activeDiagramaId,
    chatScope,
  ].join(':')

  const temporaryMessages = chat.blocked ? [] : conversationMessages[conversationKey] ?? []
  const persistedMessages: ChatMessage[] = chat.messages.map((stored) => ({
    id: `stored-${stored.id}`,
    createdAt: stored.creado_en,
    role: stored.rol,
    text: stored.texto,
    senderName: stored.autor_nombre,
    senderCode: stored.autor_codigo,
    providerLabel: stored.resultado_ia?.provider === 'local' ? 'IA local'
      : stored.resultado_ia?.provider === 'gemini' ? 'Gemini' : undefined,
    diagramId: stored.diagrama_id,
    recipientName: typeof stored.resultado_ia?.destinatario_nombre === 'string'
      ? stored.resultado_ia.destinatario_nombre : undefined,
    warnings: Array.isArray(stored.resultado_ia?.warnings) ? stored.resultado_ia.warnings.filter((item): item is string => typeof item === 'string') : undefined,
    imageStats: readImageStats(stored.resultado_ia),
    plan: stored.diagrama_id === activeDiagramaId ? readStoredPlan(stored.resultado_ia) : undefined,
    retryMessageId: stored.rol === 'user'
      && stored.diagrama_id === (activeDiagramaId > 0 ? activeDiagramaId : null)
      && stored.autor_codigo === (currentUser?.codigo || autorCodigo)
      && !stored.texto.startsWith('Imagen:')
      && (chatScope === 'individual' || /@ia\b/i.test(stored.texto))
      && !chat.messages.some((reply) => reply.resultado_ia?.reply_to === String(stored.id))
        ? stored.id : undefined,
  }))
  const messages = [...persistedMessages, ...temporaryMessages].sort(
    (first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt),
  )

  function setMessages(
    update: (current: ChatMessage[]) => ChatMessage[],
  ) {
    setConversationMessages((current) => ({
      ...current,
      [conversationKey]: update(current[conversationKey] ?? []),
    }))
  }

  function changeChatScope(nextScope: ChatScope) {
    if (isBusy || isListening) return

    setChatScope(nextScope)
    setMessage('')
  }
  useEffect(() => {
    panelMountedRef.current = true
    return () => {
      panelMountedRef.current = false
      planDecisionRef.current?.()
      planDecisionRef.current = null
      window.clearTimeout(speechTimeoutRef.current)
      speechRecognitionRef.current?.abort()
      speechRecognitionRef.current = null
    }
  }, [])

  function pushError(text: string) {
    setMessages((current) => [...current, createMessage('error', text)])
  }

  useEffect(() => {
    if (localRequestStartedAt === null) return
    const timer = window.setInterval(() => {
      setLocalElapsedSeconds(Math.floor((performance.now() - localRequestStartedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [localRequestStartedAt])

  async function requestChatAnswer(messageId: number, diagramId?: number) {
    if (textProvider !== 'local') return chat.respond(messageId, diagramId, textProvider)

    const startedAt = performance.now()
    setLocalElapsedSeconds(0)
    setLocalRequestStartedAt(startedAt)
    try {
      const answer = await chat.respond(messageId, diagramId, textProvider)
      const seconds = (performance.now() - startedAt) / 1000
      if (seconds >= 1) {
        setLocalTypicalSeconds((previous) => previous === null ? seconds : previous * 0.7 + seconds * 0.3)
      }
      return answer
    } finally {
      setLocalRequestStartedAt(null)
    }
  }

  function hasActiveDiagram() {
    if (!Number.isFinite(activeProyectoId) || activeProyectoId <= 0) {
      pushError('Selecciona o escribe un proyecto valido.')
      return false
    }
    if (!Number.isFinite(activeDiagramaId) || activeDiagramaId <= 0) {
      pushError('Selecciona o escribe un diagrama valido.')
      return false
    }
    return true
  }

  function finishPlanDecision() {
    const resume = planDecisionRef.current
    planDecisionRef.current = null
    setPendingPlanId(null)
    resume?.()
  }

  async function processQueuedReply(messageId: number, diagramId?: number) {
    setIsLoading(true)
    try {
      const answer = await requestChatAnswer(messageId, diagramId)
      const plan = readStoredPlan(answer.resultado_ia)
      if (!panelMountedRef.current || !canEdit || !plan?.can_execute || !plan.actions.length) return

      setIsLoading(false)
      await new Promise<void>((resume) => {
        planDecisionRef.current = resume
        setPendingPlanId(`stored-${answer.id}`)
      })
    } finally {
      if (panelMountedRef.current) setIsLoading(false)
    }
  }

  async function handleApplyPlan(plan: ActionablePlan, chatMessageId?: string) {
    if (!hasActiveDiagram()) return
    if (!autorCodigo) {
      pushError('No se encontro el codigo del usuario.')
      return
    }
    if (!canEdit) {
      pushError('No tienes permiso para modificar este diagrama.')
      return
    }
    if (!plan.can_execute || plan.actions.length === 0) {
      pushError('Este plan tiene preguntas pendientes o no contiene acciones aplicables.')
      return
    }

    setIsApplying(true)
    try {
      const result = await executeDiagramPlan({
        diagrama_id: activeDiagramaId,
        proyecto_id: activeProyectoId,
        autor_codigo: autorCodigo,
        confirmed: true,
        actions: plan.actions,
        expected_version: plan.diagrama_version,
      })
      if (!result.success) {
        pushError(result.message || 'El agente IA no pudo aplicar el plan.')
        return
      }
      if (!result.diagrama || result.diagrama.id !== activeDiagramaId
        || !Array.isArray(result.diagrama.contenido?.nodes)
        || !Array.isArray(result.diagrama.contenido?.edges)) {
        pushError('La ejecución no devolvió el diagrama activo actualizado. Recarga el diagrama antes de volver a aplicar el plan.')
        return
      }
      if (!panelMountedRef.current) return
      onDiagramUpdated?.(result.diagrama)
      if (chatMessageId === pendingPlanId) finishPlanDecision()
      setMessages((current) => [
        ...current,
        createMessage('assistant', result.message || 'Listo, actualice el diagrama.'),
      ])
    } catch (requestError) {
      pushError(
        requestError instanceof ApiError
          ? String(requestError.message)
          : 'No se pudo aplicar el plan del agente IA.',
      )
    } finally {
      setIsApplying(false)
    }
  }

  function handlePlan() {
    if (composerBusy || isListening || !chat.ready) return
    const cleanMessage = message.trim()
    if (!cleanMessage) return
    if (chatScope === 'individual' && !hasActiveDiagram()) return

    const diagramId = Number.isInteger(activeDiagramaId) && activeDiagramaId > 0
      ? activeDiagramaId : undefined
    const needsReply = chatScope === 'individual' || /@ia\b/i.test(cleanMessage)
    const queuedId = ++nextQueuedId.current
    setMessage('')
    setPendingSends((count) => count + 1)
    setQueuedMessages((queue) => [...queue, { id: queuedId, key: conversationKey, text: cleanMessage }])

    // Wait for the previous reply and any plan save before posting this message.
    replyQueueRef.current = replyQueueRef.current.then(async () => {
      if (!panelMountedRef.current) return

      let saved = false
      try {
        const stored = await chat.send(cleanMessage, diagramId)
        saved = true
        if (!panelMountedRef.current) return
        setQueuedMessages((queue) => queue.filter((item) => item.id !== queuedId))
        if (needsReply) await processQueuedReply(stored.id, stored.diagrama_id ?? undefined)
      } catch (error) {
        if (!panelMountedRef.current) return
        const detail = error instanceof Error ? error.message : 'No se pudo completar la solicitud.'
        if (saved) {
          pushError(`Tu consulta se guardó. Puedes reintentar la respuesta: ${detail}`)
        } else {
          pushError(`No se pudo enviar el mensaje: ${detail}`)
          setMessage((draft) => draft ? `${cleanMessage}\n${draft}` : cleanMessage)
        }
      } finally {
        if (panelMountedRef.current) {
          if (!saved) setQueuedMessages((queue) => queue.filter((item) => item.id !== queuedId))
          setPendingSends((count) => count - 1)
        }
      }
    })
  }

  function retryAnswer(messageId: number) {
    if (isBusy || !chat.ready) return
    setPendingSends((count) => count + 1)
    setIsLoading(true)
    replyQueueRef.current = replyQueueRef.current.then(async () => {
      try {
        await processQueuedReply(messageId, activeDiagramaId > 0 ? activeDiagramaId : undefined)
      } catch (error) {
        if (panelMountedRef.current) {
          pushError(error instanceof Error ? error.message : 'No se pudo recuperar la respuesta.')
        }
      } finally {
        if (panelMountedRef.current) {
          setPendingSends((count) => count - 1)
          setIsLoading(false)
        }
      }
    })
  }

  async function toggleVoiceInput() {
    if (isListening) {
      window.clearTimeout(speechTimeoutRef.current)
      speechRecognitionRef.current?.stop()
      return
    }
    if (composerBusy || !chat.ready || speechRecognitionRef.current) return

    if (!window.isSecureContext) {
      pushError('El micrófono requiere HTTPS o localhost. Abre la aplicación desde una conexión segura.')
      return
    }

    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      pushError(
        'Este navegador no soporta la API de voz nativa (Web Speech API). Te recomendamos usar Google Chrome o Microsoft Edge.',
      )
      return
    }

    // Solicitar permiso de micrófono con getUserMedia si está disponible para asegurar el diálogo de permisos del navegador
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Detener inmediatamente las pistas para dejar libre el micrófono para SpeechRecognition
        stream.getTracks().forEach((track) => track.stop())
      } catch (mediaError) {
        if (mediaError instanceof DOMException) {
          if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
            pushError('Permiso denegado. Haz clic en el icono del candado en la barra de direcciones y activa el micrófono.')
            return
          }
          if (mediaError.name === 'NotFoundError' || mediaError.name === 'DevicesNotFoundError') {
            pushError('No se encontró ningún micrófono conectado en tu equipo.')
            return
          }
        }
      }
    }

    if (!panelMountedRef.current) return

    setIsPreparingVoice(true)
    try {
      const recognition = new SpeechRecognition()
      recognition.lang = getDictationLanguage()
      recognition.continuous = true
      recognition.interimResults = true

      dictationBaseTextRef.current = message.trimEnd()
      let accumulatedFinal = ''
      let receivedText = false

      const resetInactivityTimeout = (seconds = 10) => {
        window.clearTimeout(speechTimeoutRef.current)
        speechTimeoutRef.current = window.setTimeout(() => {
          if (speechRecognitionRef.current === recognition) {
            recognition.stop()
          }
        }, seconds * 1000)
      }

      const finishDictation = () => {
        if (speechRecognitionRef.current !== recognition) return false
        window.clearTimeout(speechTimeoutRef.current)
        speechRecognitionRef.current = null
        setIsListening(false)
        setIsPreparingVoice(false)
        return true
      }

      recognition.onstart = () => {
        setIsPreparingVoice(false)
        setIsListening(true)
        resetInactivityTimeout(12)
      }

      recognition.onresult = (event) => {
        if (speechRecognitionRef.current !== recognition) return

        let interimTranscript = ''
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index]
          const transcript = result[0]?.transcript?.trim() ?? ''
          if (!transcript) continue

          if (result.isFinal) {
            accumulatedFinal += `${accumulatedFinal ? ' ' : ''}${transcript}`
          } else {
            interimTranscript += `${interimTranscript ? ' ' : ''}${transcript}`
          }
        }

        const spokenText = [accumulatedFinal, interimTranscript].filter(Boolean).join(' ')
        if (spokenText) {
          receivedText = true
          resetInactivityTimeout(8)
          const baseText = dictationBaseTextRef.current
          setMessage([baseText, spokenText].filter(Boolean).join(baseText ? ' ' : ''))
        }
      }

      recognition.onerror = (event) => {
        if (!finishDictation()) return
        if (event.error !== 'aborted') {
          const errorMessage = event.error === 'not-allowed'
            ? 'Debes permitir el acceso al micrófono para usar el dictado (candado en la barra de URL).'
            : event.error === 'no-speech'
              ? (receivedText ? null : 'No se detectó voz. Intenta hablar más cerca del micrófono.')
              : event.error === 'audio-capture'
                ? 'No se encontró un micrófono disponible o está en uso por otra aplicación.'
                : event.error === 'network'
                  ? 'Error de conexión con el servicio de voz del navegador. Revisa tu conexión a internet.'
                  : `No se pudo reconocer la voz (${event.error}).`

          if (errorMessage) {
            pushError(errorMessage)
          }
        }
      }

      recognition.onend = () => {
        finishDictation()
      }

      speechRecognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      speechRecognitionRef.current = null
      setIsListening(false)
      setIsPreparingVoice(false)
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Debes permitir el acceso al micrófono para usar el dictado.'
        : error instanceof Error
          ? error.message
          : 'No se pudo iniciar el dictado por voz.'
      pushError(message)
    }
  }

  async function handleImage(image: File) {
    if (isBusy || !chat.ready) return
    if (!hasActiveDiagram()) return
    if (!autorCodigo) {
      pushError('No se encontro el codigo del usuario.')
      return
    }
    if (!canEdit) {
      pushError('No tienes permiso para crear elementos desde una imagen.')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type)) {
      pushError('La imagen debe ser PNG, JPEG o WebP.')
      return
    }
    if (image.size > 10 * 1024 * 1024) {
      pushError('La imagen supera el limite de 10 MB.')
      return
    }

    setIsAnalyzingImage(true)
    try {
      const stored = await chat.analyze(image, activeDiagramaId)
      const plan = readStoredPlan(stored.resultado_ia)
      if (plan?.can_execute && plan.actions.length > 0) {
        await handleApplyPlan(plan)
      }
    } catch (requestError) {
      pushError(
        requestError instanceof ApiError
          ? String(requestError.message)
          : 'No se pudo analizar la imagen con el agente IA.',
      )
    } finally {
      setIsApplying(false)
      setIsAnalyzingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  return (
    <section className={compact ? 'ai-chat-panel ai-chat-panel-compact' : 'ai-chat-panel'}>
      <header className="ai-planner-header">
        <div className="ai-chat-scope-heading">
          <p>Asistente</p>
          <h2>Conversar el diagrama</h2>
          <small className="ai-chat-scope-description">
            {activeDiagramaId > 0 ? `Diagrama activo: ${diagramaNombre || `#${activeDiagramaId}`} · #${activeDiagramaId}` : 'Sin diagrama activo'}
          </small>
          <ChatScopeSelector value={chatScope} disabled={isBusy || isListening} onChange={changeChatScope} />
          <AiProviderSelector value={textProvider} disabled={isBusy || isListening}
            onChange={(provider) => {
              setTextProvider(provider)
              localStorage.setItem('drawschema:text-provider', provider)
            }} />
        </div>
      </header>

      <div className="ai-chat-messages" aria-live="polite">
        {chat.loading ? <p className="ai-chat-status" role="status">Cargando conversación...</p> : null}
        {chat.error ? (
          <div className="ai-chat-status" role="alert">
            <p>{chat.error}</p>
            <button type="button" disabled={isBusy || chat.loading} onClick={chat.retry}>Reintentar conexión</button>
          </div>
        ) : null}
        {chat.hasOlder ? (
          <button type="button" className="ai-chat-history-button" disabled={chat.loadingOlder} onClick={() => void chat.loadOlder()}>
            {chat.loadingOlder ? 'Cargando...' : 'Ver mensajes anteriores'}
          </button>
        ) : null}
        {!chat.loading && messages.length === 0 ? (
          <div className="ai-chat-empty">
            <strong>{groupPending ? 'Chat del proyecto' : 'Escribe lo que quieres construir.'}</strong>
            <p>{groupPending
              ? 'Los miembros del proyecto pueden leer y enviar mensajes aquí. Menciona @IA para consultar al asistente; la respuesta se guarda para todos.'
              : 'Tus consultas y las respuestas de la IA quedan guardadas en esta conversación privada.'}</p>
          </div>
        ) : null}

        {messages.map((chatMessage) => {
          const sortedActions = [...(chatMessage.plan?.actions ?? [])].sort(
            (first, second) => first.order - second.order,
          )
          const visibleQuestions = chatMessage.plan?.questions ?? chatMessage.questions ?? []
          return (
            <article className={`ai-chat-message ${chatMessage.role}${chatMessage.role === 'user' && chatMessage.senderCode && chatMessage.senderCode !== (currentUser?.codigo || autorCodigo) ? ' peer' : ''}`} key={chatMessage.id}>
              <div className="ai-chat-bubble">
                <div className="ai-chat-author">
                  {chatMessage.role === 'assistant'
                    ? `${chatMessage.providerLabel || 'Asistente IA'}${chatMessage.recipientName ? ` · para ${chatMessage.recipientName}` : ''}`
                    : chatMessage.role === 'error' ? 'Aviso' : chatMessage.senderName || 'Tú'}
                </div>
                <p>{chatMessage.text}</p>
                {chatMessage.diagramId && chatMessage.diagramId !== activeDiagramaId ? (
                  <small>Mensaje del diagrama #{chatMessage.diagramId}; no se usa como contexto del diagrama activo.</small>
                ) : null}
                {chatMessage.retryMessageId ? (
                  <button type="button" disabled={isBusy || !chat.ready} onClick={() => void retryAnswer(chatMessage.retryMessageId!)}>
                    Obtener respuesta IA
                  </button>
                ) : null}

                {chatMessage.imageStats ? (
                  <div className="ai-image-stats">
                    <span>{chatMessage.imageStats.classes} clases</span>
                    <span>{chatMessage.imageStats.relations} relaciones</span>
                  </div>
                ) : null}

                {chatMessage.warnings?.length ? (
                  <div className="ai-chat-warnings">
                    {chatMessage.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                  </div>
                ) : null}

                {visibleQuestions.length > 0 ? (
                  <div className="ai-chat-questions">
                    <strong className="ai-chat-section-title">
                      {chatMessage.plan ? 'Antes de avanzar' : 'No se pudo interpretar con certeza'}
                    </strong>
                    {visibleQuestions.map((question, index) => (
                      <p key={`${getQuestionText(question)}-${index}`}>{getQuestionText(question)}</p>
                    ))}
                  </div>
                ) : null}

                {chatMessage.plan ? (
                  <>
                    {sortedActions.length > 0 ? (
                      <div className="ai-chat-actions">
                        <strong className="ai-chat-section-title">Plan sugerido</strong>
                        {sortedActions.map((action) => (
                          <div className="ai-chat-action" key={`${action.order}-${action.tool}`}>
                            <span>{action.order}</span>
                            <div>
                              <strong>{action.description}</strong>
                              <small>{action.requires_confirmation ? 'Requiere confirmacion' : 'Listo para revisar'}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {sortedActions.length > 0 && chatMessage.plan.can_execute ? (
                      <>
                        <button
                          className="primary-action ai-apply-button"
                          disabled={composerBusy || isLoading || isListening || chat.blocked || !canEdit
                            || (pendingPlanId !== null && pendingPlanId !== chatMessage.id)
                            || (pendingPlanId === null && pendingSends > 0)}
                          onClick={() => handleApplyPlan(chatMessage.plan!, chatMessage.id)}
                          type="button"
                        >
                          {isApplying ? 'Aplicando...' : 'Aplicar plan'}
                        </button>
                        {!canEdit ? <small>Tu rol no permite modificar este diagrama.</small> : null}
                      </>
                    ) : (
                      <small>
                        {visibleQuestions.length > 0
                          ? 'Responde las preguntas en el chat para completar el plan.'
                          : sortedActions.length > 0
                            ? 'Esta propuesta todavía no está lista para ejecutarse. Pide a la IA que complete el plan.'
                            : null}
                      </small>
                    )}
                  </>
                ) : null}
              </div>
            </article>
          )
        })}

        {isLoading || pendingSends > 0 || isAnalyzingImage || isPreparingVoice ? (
          <article className="ai-chat-message assistant">
            <div className="ai-chat-bubble ai-typing">
              <Loader2 className="ai-spin" size={17} />
              <span>
                {pendingPlanId !== null
                  ? 'La cola espera a que se aplique y guarde el plan anterior.'
                  : localRequestStartedAt !== null
                  ? `Esperando a la IA local · ${localElapsedSeconds} s transcurridos. ${localTypicalSeconds === null
                    ? 'La consulta puede estar en cola.'
                    : `Duración habitual en esta sesión: ~${Math.round(localTypicalSeconds)} s. Puede variar según la cola.`}`
                  : isAnalyzingImage
                  ? 'Leyendo el diagrama de la imagen...'
                  : isPreparingVoice
                    ? 'Preparando dictado local...'
                    : groupPending ? 'Enviando mensaje...' : 'Guardando consulta y preparando respuesta...'}
                {(isLoading || pendingPlanId !== null) && pendingSends > 1
                  ? ` · En cola en este chat: ${pendingSends - 1}`
                  : ''}
              </span>
            </div>
          </article>
        ) : null}
        {queuedMessages.filter((item) => item.key === conversationKey).map((item) => (
          <article className="ai-chat-message user" key={item.id}>
            <div className="ai-chat-bubble">
              <small>En espera de envío</small>
              <p>{item.text}</p>
            </div>
          </article>
        ))}
      </div>

      {!proyectoId || !diagramaId ? (
        <div className="ai-context-grid">
          {!proyectoId ? (
            <label>
              Proyecto ID
              <input min="1" onChange={(event) => setLocalProyectoId(event.target.value)} placeholder="2" type="number" value={localProyectoId} />
            </label>
          ) : null}
          {!diagramaId ? (
            <label>
              Diagrama ID
              <input min="1" onChange={(event) => setLocalDiagramaId(event.target.value)} placeholder="1" type="number" value={localDiagramaId} />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="ai-chat-composer">
        <div className="ai-composer-tools">
          <label className="ai-composer-icon" title="Analizar imagen con Gemini">
            <ImagePlus size={18} />
            <input
              accept="image/png,image/jpeg,image/webp"
              disabled={isBusy || isListening || !chat.ready}
              onChange={(event) => {
                const image = event.target.files?.[0]
                if (image) void handleImage(image)
              }}
              ref={imageInputRef}
              type="file"
            />
          </label>
          <button
            aria-label={isListening ? 'Detener dictado' : 'Dictar mensaje'}
            aria-pressed={isListening}
            className={isListening ? 'ai-composer-icon active' : 'ai-composer-icon'}
            disabled={!isListening && (composerBusy || !chat.ready)}
            onClick={toggleVoiceInput}
            title={isListening ? 'Detener dictado' : 'Dictar mensaje'}
            type="button"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>
        <textarea
          disabled={composerBusy || isListening || !chat.ready}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handlePlan()
            }
          }}
          placeholder={chat.loading ? 'Cargando conversación...' : !chat.ready ? 'Selecciona un proyecto y conecta el chat' : isListening ? 'Escuchando...' : groupPending ? 'Escribe al equipo o menciona @IA...'  : 'Pide algo para tu diagrama...'}
          value={message}
        />
        <button aria-label={groupPending ? 'Enviar mensaje al proyecto' : 'Enviar consulta a la IA'} disabled={composerBusy || isListening || !chat.ready || !message.trim()} onClick={handlePlan} title="Enviar" type="button">
          <Send size={18} />
        </button>
      </div>
    </section>
  )
}
