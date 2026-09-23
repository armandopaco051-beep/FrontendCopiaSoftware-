import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import './GuidedTour.css'

export type GuidedTourStep = {
  title: string
  description: string
  target?: string
}

type GuidedTourProps = {
  isOpen: boolean
  steps: GuidedTourStep[]
  theme: 'dark' | 'light'
  onFinish: () => void
}

type SpotlightRect = {
  top: number
  left: number
  width: number
  height: number
}

type CardPosition = {
  top: number
  left: number
}

const viewportGap = 16
const targetPadding = 8
const cardGap = 14

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function GuidedTour({ isOpen, steps, theme, onFinish }: GuidedTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null)
  const [cardPosition, setCardPosition] = useState<CardPosition | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const step = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  useLayoutEffect(() => {
    if (!isOpen || !step) {
      return
    }

    let targetElement: HTMLElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let settleTimer: number | undefined

    function updatePlacement() {
      targetElement = step.target
        ? document.querySelector<HTMLElement>(step.target)
        : null

      if (!targetElement) {
        setSpotlightRect(null)
        setCardPosition(null)
        return
      }

      const target = targetElement.getBoundingClientRect()
      const nextRect = {
        top: Math.max(target.top - targetPadding, viewportGap),
        left: Math.max(target.left - targetPadding, viewportGap),
        width: Math.min(target.width + targetPadding * 2, window.innerWidth - viewportGap * 2),
        height: Math.min(target.height + targetPadding * 2, window.innerHeight - viewportGap * 2),
      }
      const cardWidth = Math.min(cardRef.current?.offsetWidth ?? 390, window.innerWidth - viewportGap * 2)
      const cardHeight = cardRef.current?.offsetHeight ?? 280
      const desiredLeft = target.left + target.width / 2 - cardWidth / 2
      const hasRoomBelow = target.bottom + cardGap + cardHeight <= window.innerHeight - viewportGap
      const hasRoomAbove = target.top - cardGap - cardHeight >= viewportGap
      const hasRoomRight = target.right + cardGap + cardWidth <= window.innerWidth - viewportGap
      const hasRoomLeft = target.left - cardGap - cardWidth >= viewportGap
      let left = clamp(desiredLeft, viewportGap, window.innerWidth - cardWidth - viewportGap)
      let top = target.bottom + cardGap

      if (hasRoomBelow) {
        top = target.bottom + cardGap
      } else if (hasRoomAbove) {
        top = target.top - cardHeight - cardGap
      } else if (hasRoomRight) {
        left = target.right + cardGap
        top = clamp(
          target.top + target.height / 2 - cardHeight / 2,
          viewportGap,
          window.innerHeight - cardHeight - viewportGap,
        )
      } else if (hasRoomLeft) {
        left = target.left - cardWidth - cardGap
        top = clamp(
          target.top + target.height / 2 - cardHeight / 2,
          viewportGap,
          window.innerHeight - cardHeight - viewportGap,
        )
      } else {
        top = clamp(target.top, viewportGap, window.innerHeight - cardHeight - viewportGap)
      }

      setSpotlightRect(nextRect)
      setCardPosition({ top, left })
    }

    targetElement = step.target
      ? document.querySelector<HTMLElement>(step.target)
      : null

    if (targetElement) {
      const target = targetElement.getBoundingClientRect()
      const isOutsideViewport = target.top < 0 || target.bottom > window.innerHeight

      if (isOutsideViewport) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        settleTimer = window.setTimeout(updatePlacement, 320)
      }

      resizeObserver = new ResizeObserver(updatePlacement)
      resizeObserver.observe(targetElement)
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)

    return () => {
      if (settleTimer) {
        window.clearTimeout(settleTimer)
      }
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [isOpen, step, stepIndex])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setStepIndex(0)
        onFinish()
      } else if (event.key === 'ArrowRight') {
        setStepIndex((current) => {
          if (current >= steps.length - 1) {
            window.requestAnimationFrame(() => {
              setStepIndex(0)
              onFinish()
            })
            return current
          }
          return current + 1
        })
      } else if (event.key === 'ArrowLeft') {
        setStepIndex((current) => Math.max(current - 1, 0))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const focusTimer = window.setTimeout(() => nextButtonRef.current?.focus(), 80)

    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onFinish, steps.length])

  useEffect(() => {
    if (isOpen) {
      nextButtonRef.current?.focus()
    }
  }, [isOpen, stepIndex])

  if (!step || typeof document === 'undefined') {
    return null
  }

  function goNext() {
    if (isLastStep) {
      closeTour()
      return
    }

    setStepIndex((current) => current + 1)
  }

  function closeTour() {
    setStepIndex(0)
    onFinish()
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          animate={{ opacity: 1 }}
          className={`guided-tour ${theme === 'light' ? 'guided-tour-light' : ''}`}
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          <div className="guided-tour-click-guard" />
          {spotlightRect ? (
            <motion.div
              animate={spotlightRect}
              className="guided-tour-spotlight"
              initial={false}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : (
            <div className="guided-tour-backdrop" />
          )}

          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-describedby="guided-tour-description"
            aria-labelledby="guided-tour-title"
            aria-modal="true"
            className={`guided-tour-card ${cardPosition ? '' : 'is-centered'}`}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            key={stepIndex}
            ref={cardRef}
            role="dialog"
            style={cardPosition ?? undefined}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className="guided-tour-meta">
              <span>Paso {stepIndex + 1} de {steps.length}</span>
              <button aria-label="Saltar recorrido" onClick={closeTour} type="button">
                Saltar <X size={16} />
              </button>
            </div>

            <h2 id="guided-tour-title">{step.title}</h2>
            <p id="guided-tour-description">{step.description}</p>

            <div className="guided-tour-progress" aria-hidden="true">
              <motion.span
                animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
              />
            </div>

            <div className="guided-tour-actions">
              <button
                className="guided-tour-previous"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
                type="button"
              >
                <ArrowLeft size={15} /> Anterior
              </button>
              <button className="guided-tour-next" onClick={goNext} ref={nextButtonRef} type="button">
                {isLastStep ? (
                  <>Finalizar <Check size={16} /></>
                ) : (
                  <>Siguiente <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
