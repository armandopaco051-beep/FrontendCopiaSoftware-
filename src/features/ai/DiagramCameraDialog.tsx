import { useEffect, useId, useRef, useState } from 'react'

type Props = {
  onClose: () => void
  onAnalyze: (file: File) => void
}

export function DiagramCameraDialog({ onClose, onAnalyze }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')
  const openRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    openRef.current = true
    return () => {
      openRef.current = false
      dialog.close()
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    let cancelled = false
    let stream: MediaStream | undefined

    async function openCamera() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('Abre DrawSchema mediante HTTPS para usar la cámara. También puedes adjuntar una foto.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled || !video) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        video.srcObject = stream
      } catch (cause) {
        if (cancelled) return
        const denied = cause instanceof DOMException && cause.name === 'NotAllowedError'
        setError(denied
          ? 'Permite el acceso a la cámara en tu navegador o adjunta una foto.'
          : 'No se pudo abrir la cámara. Comprueba que esté disponible o adjunta una foto.')
      }
    }

    void openCamera()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video?.videoWidth || !video.videoHeight || capturing) return
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 2560 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('No se pudo capturar la foto. Puedes adjuntarla como archivo.')
      return
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    setCapturing(true)
    canvas.toBlob((blob) => {
      if (!openRef.current) return
      setCapturing(false)
      if (!blob?.size) {
        setError('No se pudo guardar la captura. Intenta tomar la foto otra vez.')
        return
      }
      const file = new File([blob], 'foto-diagrama.jpg', { type: blob.type })
      onAnalyze(file)
    }, 'image/jpeg', 0.92)
  }

  return (
    <dialog
      className="ai-camera-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
    >
      <h2 id={titleId}>Tomar foto del diagrama</h2>
      <video className="ai-camera-preview" ref={videoRef} autoPlay muted playsInline onCanPlay={() => setReady(true)} />
      <p role={error ? 'alert' : undefined}>
        {error || (ready ? 'Encuadra todo el diagrama y evita reflejos.' : 'Esperando acceso a la cámara…')}
      </p>
      <div className="ai-camera-actions">
        <button className="ghost-button" type="button" onClick={onClose}>Cancelar</button>
        <button className="primary-action" type="button" disabled={!ready || capturing} onClick={capture}>Capturar</button>
      </div>
    </dialog>
  )
}
