import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Mic, MicOff, Send } from 'lucide-react'
import { ApiError } from '../../services/api'
import type { DiagramaResponse } from '../../services/diagramaService'
import type { AiPlannerAction, AiPlannerQuestion, AiPlannerResponse } from '../../services/aiService'
import {
  analyzeDiagramImage,
  executeDiagramPlan,
  planWithAi,
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
  new (): BrowserSpeechRecognition
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
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  plan?: ActionablePlan
  warnings?: string[]
  questions?: AiPlannerQuestion[]
  imageStats?: { classes: number; relations: number }
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
  options?: Pick<ChatMessage, 'warnings' | 'questions' | 'imageStats'>,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    plan,
    ...options,
  }
}

export function AiPlannerPanel({
  compact = false,
  diagramaId,
  proyectoId,
  autorCodigo,
  canEdit = true,
  onDiagramUpdated,
}: AiPlannerPanelProps) {
  const [message, setMessage] = useState('')
  const [localProyectoId, setLocalProyectoId] = useState(proyectoId ? String(proyectoId) : '')
  const [localDiagramaId, setLocalDiagramaId] = useState(diagramaId ? String(diagramaId) : '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isPreparingVoice, setIsPreparingVoice] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const dictationBaseTextRef = useRef('')

  const activeProyectoId = proyectoId ?? Number(localProyectoId)
  const activeDiagramaId = diagramaId ?? Number(localDiagramaId)
  const isBusy = isLoading || isApplying || isAnalyzingImage || isPreparingVoice

  useEffect(() => {
    return () => {
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
        autor_codigo: autorCodigo,
        confirmed: true,
        actions: plan.actions,
      })
      if (!result.success) {
        pushError(result.message || 'El agente IA no pudo aplicar el plan.')
        return
      }
      if (result.diagrama) {
        onDiagramUpdated?.(result.diagrama)
      }
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
    const cleanMessage = message.trim()
    if (!cleanMessage) {
      pushError('Escribe o dicta una peticion para el agente IA.')
      return
    }
    if (!hasActiveDiagram()) return

    setMessages((current) => [...current, createMessage('user', cleanMessage)])
    setMessage('')
    setIsLoading(true)
    try {
      const nextPlan: AiPlannerResponse = await planWithAi({
        message: cleanMessage,
        proyecto_id: activeProyectoId,
        diagrama_id: activeDiagramaId,
      })
      setMessages((current) => [
        ...current,
        createMessage('assistant', nextPlan.summary || 'Ya tengo un plan para tu diagrama.', nextPlan),
      ])
    } catch (requestError) {
      pushError(
        requestError instanceof ApiError
          ? String(requestError.message)
          : 'No se pudo conectar con el backend IA.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function toggleVoiceInput() {
    if (isListening) {
      speechRecognitionRef.current?.stop()
      return
    }

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

      const recognition = new SpeechRecognition()
      recognition.lang = DICTATION_LANGUAGE
      recognition.processLocally = true
      recognition.continuous = false
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

    setMessages((current) => [...current, createMessage('user', `Imagen: ${image.name}`)])
    setIsAnalyzingImage(true)
    try {
      const result = await analyzeDiagramImage({
        image,
        proyectoId: activeProyectoId,
        diagramaId: activeDiagramaId,
      })

      const responseOptions = {
        warnings: result.warnings,
        questions: result.questions,
        imageStats: { classes: result.classes.length, relations: result.relations.length },
      }

      if (!result.can_execute || result.actions.length === 0) {
        const message = result.actions.length === 0 && result.questions.length === 0
          ? `${result.summary} El diagrama ya coincide o no se detectaron cambios aplicables.`
          : `${result.summary} No se aplicaron cambios porque hay datos visuales por confirmar.`
        setMessages((current) => [
          ...current,
          createMessage('assistant', message, undefined, responseOptions),
        ])
        return
      }

      setIsApplying(true)
      const execution = await executeDiagramPlan({
        diagrama_id: activeDiagramaId,
        autor_codigo: autorCodigo,
        confirmed: true,
        actions: result.actions,
      })
      if (!execution.success) {
        pushError(execution.message || 'No se pudo dibujar el contenido reconocido en la imagen.')
        return
      }
      if (execution.diagrama) {
        onDiagramUpdated?.(execution.diagrama)
      }
      setMessages((current) => [
        ...current,
        createMessage(
          'assistant',
          `${result.summary} ${execution.message || 'El contenido fue dibujado en la pizarra.'}`,
          undefined,
          responseOptions,
        ),
      ])
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
        <div>
          <p>Asistente</p>
          <h2>Conversar el diagrama</h2>
        </div>
      </header>

      <div className="ai-chat-messages">
        {messages.length === 0 ? (
          <div className="ai-chat-empty">
            <strong>Escribi lo que quieres construir.</strong>
            <p>Por ejemplo: crea un sistema de ventas con clientes, productos y pedidos.</p>
          </div>
        ) : null}

        {messages.map((chatMessage) => {
          const sortedActions = [...(chatMessage.plan?.actions ?? [])].sort(
            (first, second) => first.order - second.order,
          )
          const visibleQuestions = chatMessage.plan?.questions ?? chatMessage.questions ?? []
          return (
            <article className={`ai-chat-message ${chatMessage.role}`} key={chatMessage.id}>
              <div className="ai-chat-bubble">
                <p>{chatMessage.text}</p>

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

                    <button
                      className="primary-action ai-apply-button"
                      disabled={isApplying || !canEdit || !chatMessage.plan.can_execute || sortedActions.length === 0}
                      onClick={() => handleApplyPlan(chatMessage.plan!)}
                      type="button"
                    >
                      {isApplying ? 'Aplicando...' : 'Aplicar plan'}
                    </button>
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
                    : 'Planificando respuesta...'}
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
          <label className="ai-composer-icon" title="Analizar imagen">
            <ImagePlus size={18} />
            <input
              accept="image/png,image/jpeg,image/webp"
              disabled={isBusy || isListening}
              onChange={(event) => {
                const image = event.target.files?.[0]
                if (image) void handleImage(image)
              }}
              ref={imageInputRef}
              type="file"
            />
          </label>
          <button
            aria-label={isListening ? 'Detener dictado' : 'Dictar peticion'}
            className={isListening ? 'ai-composer-icon active' : 'ai-composer-icon'}
            disabled={isBusy}
            onClick={toggleVoiceInput}
            title={isListening ? 'Detener dictado' : 'Dictar peticion'}
            type="button"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        </div>
        <textarea
          disabled={isBusy || isListening}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handlePlan()
            }
          }}
          placeholder={isListening ? 'Escuchando...' : 'Pide algo para tu diagrama...'}
          value={message}
        />
        <button aria-label="Enviar peticion IA" disabled={isBusy || isListening || !message.trim()} onClick={handlePlan} title="Enviar" type="button">
          {isLoading ? <Loader2 className="ai-spin" size={18} /> : <Send size={18} />}
        </button>
      </div>
    </section>
  )
}
