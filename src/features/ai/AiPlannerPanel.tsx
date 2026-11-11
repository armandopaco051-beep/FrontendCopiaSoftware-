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

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionErrorEventLike = Event & {
  error: string
}

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  processLocally?: boolean
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type LocalSpeechRecognitionOptions = {
  langs: string[]
  processLocally: true
}

type BrowserSpeechRecognitionConstructor = {
  new(): BrowserSpeechRecognition
  available?: (
    options: LocalSpeechRecognitionOptions,
  ) => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
  install?: (options: LocalSpeechRecognitionOptions) => Promise<boolean>
}

const DICTATION_LANGUAGE = 'es-ES'

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
  const [isApplying, setIsApplying] = useState(false)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isPreparingVoice, setIsPreparingVoice] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const dictationBaseTextRef = useRef('')
  const panelMountedRef = useRef(true)

  const activeProyectoId = proyectoId ?? Number(localProyectoId)
  const activeDiagramaId = diagramaId ?? Number(localDiagramaId)
  const isBusy = isLoading || isApplying || isAnalyzingImage || isPreparingVoice
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
      speechRecognitionRef.current?.abort()
      speechRecognitionRef.current = null
    }
  }, [])

  function pushError(text: string) {
    setMessages((current) => [...current, createMessage('error', text)])
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

  async function handleApplyPlan(plan: ActionablePlan) {
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

  async function handlePlan() {
    if (isBusy || !chat.ready) return
    const cleanMessage = message.trim()
    if (!cleanMessage) return
    if (chatScope === 'individual' && !hasActiveDiagram()) return
    setIsLoading(true)
    let saved = false
    try {
      const stored = await chat.send(
        cleanMessage,
        Number.isInteger(activeDiagramaId) && activeDiagramaId > 0 ? activeDiagramaId : undefined,
      )
      saved = true
      setMessage('')
      if (chatScope === 'individual' || /@ia\b/i.test(cleanMessage)) {
        await chat.respond(stored.id, stored.diagrama_id ?? undefined, textProvider)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'No se pudo completar la solicitud.'
      pushError(saved
        ? `Tu consulta se guardó. Puedes reintentar la respuesta: ${detail}`
        : `No se pudo guardar el mensaje: ${detail}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function retryAnswer(messageId: number) {
    if (isBusy || !chat.ready) return
    setIsLoading(true)
    try {
      await chat.respond(messageId, activeDiagramaId > 0 ? activeDiagramaId : undefined, textProvider)
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'No se pudo recuperar la respuesta.')
    } finally {
      setIsLoading(false)
    }
  }

  async function toggleVoiceInput() {
    if (isListening) {
      speechRecognitionRef.current?.stop()
      return
    }
    if (isBusy || !chat.ready || speechRecognitionRef.current) return

    if (!window.isSecureContext) {
      pushError('El microfono requiere HTTPS o localhost. Abre la aplicacion desde una conexion segura.')
      return
    }

    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      pushError('Este navegador no permite dictado de voz. Usa Chrome o Edge actualizado.')
      return
    }

    if (!SpeechRecognition.available || !SpeechRecognition.install) {
      pushError(
        'Tu navegador no admite dictado local. Actualiza Chrome o Edge para transcribir sin enviar el audio a un servicio externo.',
      )
      return
    }

    setIsPreparingVoice(true)
    try {
      const localOptions: LocalSpeechRecognitionOptions = {
        langs: [DICTATION_LANGUAGE],
        processLocally: true,
      }
      const availability = await SpeechRecognition.available(localOptions)

      if (availability === 'unavailable') {
        pushError('El paquete de dictado local en espanol no esta disponible para este navegador o dispositivo.')
        return
      }

      if (availability !== 'available') {
        const installed = await SpeechRecognition.install(localOptions)
        if (!installed) {
          pushError('No se pudo instalar el paquete de dictado local en espanol.')
          return
        }
      }

      if (!panelMountedRef.current) return

      const recognition = new SpeechRecognition()
      recognition.lang = DICTATION_LANGUAGE
      recognition.processLocally = true
      recognition.continuous = true
      recognition.interimResults = true
      dictationBaseTextRef.current = message.trimEnd()

      recognition.onstart = () => setIsListening(true)
      recognition.onresult = (event) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index]
          const transcript = result[0]?.transcript?.trim() ?? ''
          if (!transcript) continue

          if (result.isFinal) {
            finalTranscript += `${finalTranscript ? ' ' : ''}${transcript}`
          } else {
            interimTranscript += `${interimTranscript ? ' ' : ''}${transcript}`
          }
        }

        const spokenText = [finalTranscript, interimTranscript].filter(Boolean).join(' ')
        const baseText = dictationBaseTextRef.current
        setMessage([baseText, spokenText].filter(Boolean).join(baseText ? ' ' : ''))
      }
      recognition.onerror = (event) => {
        if (event.error !== 'aborted') {
          const errorMessage = event.error === 'not-allowed'
            ? 'Debes permitir el acceso al microfono para usar el dictado.'
            : event.error === 'no-speech'
              ? 'No se detecto voz. Intenta hablar mas cerca del microfono.'
              : event.error === 'audio-capture'
                ? 'No se encontro un microfono disponible.'
                : event.error === 'language-not-supported' || event.error === 'language-unavailable'
                  ? 'Falta el paquete local de espanol. Vuelve a presionar el microfono para instalarlo.'
                  : event.error === 'network'
                    ? 'El navegador no pudo preparar el reconocimiento local. Actualizalo e instala el paquete de idioma.'
                    : `No se pudo reconocer la voz (${event.error}).`
          pushError(errorMessage)
        }
        setIsListening(false)
        speechRecognitionRef.current = null
      }
      recognition.onend = () => {
        setIsListening(false)
        speechRecognitionRef.current = null
      }

      speechRecognitionRef.current = recognition
      recognition.start()
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Debes permitir el acceso al microfono para usar el dictado.'
        : 'No se pudo preparar el dictado local. Verifica que Chrome o Edge esten actualizados.'
      pushError(message)
      speechRecognitionRef.current = null
      setIsListening(false)
    } finally {
      setIsPreparingVoice(false)
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
                          disabled={isBusy || chat.blocked || !canEdit}
                          onClick={() => handleApplyPlan(chatMessage.plan!)}
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

        {isLoading || isAnalyzingImage || isPreparingVoice ? (
          <article className="ai-chat-message assistant">
            <div className="ai-chat-bubble ai-typing">
              <Loader2 className="ai-spin" size={17} />
              <span>
                {isAnalyzingImage
                  ? 'Leyendo el diagrama de la imagen...'
                  : isPreparingVoice
                    ? 'Preparando dictado local...'
                    : groupPending ? 'Enviando mensaje...' : 'Guardando consulta y preparando respuesta...'}
              </span>
            </div>
          </article>
        ) : null}
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
            disabled={!isListening && (isBusy || !chat.ready)}
            onClick={toggleVoiceInput}
            title={isListening ? 'Detener dictado' : 'Dictar mensaje'}
            type="button"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>
        <textarea
          disabled={isBusy || isListening || !chat.ready}
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
        <button aria-label={groupPending ? 'Enviar mensaje al proyecto' : 'Enviar consulta a la IA'} disabled={isBusy || isListening || !chat.ready || !message.trim()} onClick={handlePlan} title="Enviar" type="button">
          {isLoading ? <Loader2 className="ai-spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
    </section>
  )
}
