import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { ProyectosPage } from './pages/proyectos/Proyectos'
import {
  ArrowRight,
  Check,
  Command,
  Database,
  GitBranch,
  Layers3,
  Moon,
  MousePointer2,
  Play,
  Sparkles,
  Sun,
  UsersRound,
  Zap,
} from 'lucide-react'
import LoginPage from './LoginPage'
import { EstudiantePage } from './pages/estudiante/EstudiantePage'
import { IAPage } from './pages/IA/IA'
import { PerfilPage } from './pages/perfil/PerfilPage'
import { UsuariosPage } from './pages/usuario/UsuariosPage'
import { VersionHistoryPage } from './pages/versiones/VersionHistoryPage'
import type { DiagramaResponse } from './services/diagramaService'
import { AUTH_UNAUTHORIZED_EVENT } from './services/api'
import type { AuthUserProfile } from './utils/auth'
import { getStoredToken, getUserProfileFromToken, isStudentToken, isSuperAdminToken } from './utils/auth'
import './App.css'

const fadeUp = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
}

const staggerGroup = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
}

type Benefit = {
  icon: LucideIcon
  title: string
  text: string
  link: string
}

const benefits: Benefit[] = [
  {
    icon: UsersRound,
    title: 'Colabora en tiempo real',
    text: 'Invita a producto, ingenieria y datos. Todos pueden comentar, editar y ver quien esta trabajando.',
    link: 'Conoce la colaboracion',
  },
  {
    icon: Zap,
    title: 'Piensa rapido, itera mejor',
    text: 'Arrastra tablas, conecta relaciones y explora alternativas sin tocar una linea de SQL.',
    link: 'Explora el editor',
  },
  {
    icon: GitBranch,
    title: 'Listo para produccion',
    text: 'Manten una documentacion que evoluciona con tu producto y exporta el resultado cuando estes listo.',
    link: 'Ver exportaciones',
  },
]

const steps = [
  {
    number: '01',
    title: 'Arranca con una idea',
    text: 'Crea un canvas en blanco o parte de una plantilla. El modelo se adapta a tu forma de pensar.',
  },
  {
    number: '02',
    title: 'Invita a las personas correctas',
    text: 'Envia el workspace con un link y resuelve dudas directamente sobre el diagrama.',
  },
  {
    number: '03',
    title: 'Convierte decisiones en codigo',
    text: 'Exporta tu esquema y lleva la documentacion desde la pizarra hasta tu stack.',
  },
]

const plans = [
  {
    name: 'Personal',
    price: 'Gratis',
    description: 'Para empezar a ordenar tus ideas.',
    features: ['3 proyectos activos', 'Colaboracion en tiempo real', 'Exportacion PNG y SQL'],
  },
  {
    name: 'Equipo',
    price: '$12',
    detail: '/ miembro / mes',
    description: 'Para equipos que construyen juntos.',
    badge: 'Mas elegido',
    features: [
      'Proyectos ilimitados',
      'Historial de versiones',
      'Permisos y comentarios',
      'Exportacion para produccion',
    ],
  },
]

const tableNames = ['users', 'projects', 'tasks']
const activityMessages = [
  'Ana agrego owner_id',
  'Jose comento tasks.status',
  'Mia exporto el SQL',
]

type AppPage = 'landing' | 'login' | 'usuarios' | 'proyectos' | 'perfil' | 'estudiante' | 'ia' | 'historialVersiones'

const pagePaths: Record<AppPage, string> = {
  landing: '/',
  login: '/login',
  usuarios: '/usuarios',
  proyectos: '/proyectos',
  perfil: '/perfil',
  estudiante: '/estudiante',
  ia: '/ia',
  historialVersiones: '/historial-versiones',
}

function getPageFromPath(pathname: string): AppPage {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'
  const match = Object.entries(pagePaths).find(([_page, path]) => path === normalizedPath)

  return (match?.[0] as AppPage | undefined) ?? 'landing'
}
  
function App() {
  const [activeTable, setActiveTable] = useState(1)
  const [activityIndex, setActivityIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState<AppPage>(() => getPageFromPath(window.location.pathname))
  const [theme, setTheme] = useState<'dark' | 'light'>('light')
  const [authToken, setAuthToken] = useState<string | null>(() => getStoredToken())
  const [profileOverride, setProfileOverride] = useState<AuthUserProfile | null>(null)
  const userProfile = profileOverride ?? getUserProfileFromToken(authToken)

  function navigateTo(page: AppPage, options?: { replace?: boolean }) {
    const path = pagePaths[page]

    if (window.location.pathname !== path) {
      if (options?.replace) {
        window.history.replaceState(null, '', path)
      } else {
        window.history.pushState(null, '', path)
      }
    }

    setCurrentPage(page)
  }

  function navigateToVersionHistory(diagrama: DiagramaResponse) {
    const params = new URLSearchParams({
      diagrama_id: String(diagrama.id),
      proyecto_id: String(diagrama.id_proyecto),
      nombre: diagrama.nombre,
    })
    window.history.pushState(null, '', `${pagePaths.historialVersiones}?${params.toString()}`)
    setCurrentPage('historialVersiones')
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveTable((current) => (current + 1) % tableNames.length)
      setActivityIndex((current) => (current + 1) % activityMessages.length)
    }, 2200)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const currentPathPage = getPageFromPath(window.location.pathname)
    const currentPath = pagePaths[currentPathPage]

    if (window.location.pathname !== currentPath) {
      window.history.replaceState(null, '', currentPath)
    }

    function handleBrowserNavigation() {
      setCurrentPage(getPageFromPath(window.location.pathname))
    }

    window.addEventListener('popstate', handleBrowserNavigation)

    return () => window.removeEventListener('popstate', handleBrowserNavigation)
  }, [])

  useEffect(() => {
    function handleUnauthorizedSession() {
      setAuthToken(null)
      setProfileOverride(null)
      window.history.replaceState(null, '', pagePaths.login)
      setCurrentPage('login')
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)

    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorizedSession)
  }, [])

  function handleLoginSuccess(token: string) {
    const hasSuperAdminAccess = isSuperAdminToken(token)
    const hasStudentAccess = isStudentToken(token)

    setAuthToken(token)
    setProfileOverride(null)
    navigateTo(hasSuperAdminAccess ? 'usuarios' : hasStudentAccess ? 'estudiante' : 'landing', { replace: true })
  }

  function handleVersionRestored(diagrama: DiagramaResponse) {
    sessionStorage.setItem(
      'drawschema:open-diagram',
      JSON.stringify({
        diagramaId: diagrama.id,
        proyectoId: diagrama.id_proyecto,
      }),
    )
    navigateTo('estudiante')
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  if (currentPage === 'login') {
    return (
      <LoginPage
        theme={theme}
        onBack={() => navigateTo('landing')}
        onToggleTheme={toggleTheme}
        onLoginSuccess={handleLoginSuccess}
      />
    )
  }

  if (currentPage === 'usuarios') {
    return (
      <UsuariosPage
        theme={theme}
        userProfile={userProfile}
        onBack={() => navigateTo('landing')}
        onProfile={() => navigateTo('perfil')}
        onProjects={() => navigateTo('proyectos')}
        onToggleTheme={toggleTheme}
      />
    )
  }

  if (currentPage === 'proyectos') {
    return (
      <ProyectosPage
        theme={theme}
        userProfile={userProfile}
        onBack={() => navigateTo('landing')}
        onProfile={() => navigateTo('perfil')}
        onToggleTheme={toggleTheme}
        onUsers={() => navigateTo('usuarios')}
      />
    )
  }

  if (currentPage === 'estudiante') {
    return (
      <EstudiantePage
        theme={theme}
        userProfile={userProfile}
        onBack={() => navigateTo('landing')}
        onProfile={() => navigateTo('perfil')}
        onToggleTheme={toggleTheme}
        onVersionHistory={navigateToVersionHistory}
      />
    )
  }

  if (currentPage === 'perfil') {
    const isStudentProfile = userProfile?.idRol === '5'

    return (
      <PerfilPage
        isStudentProfile={isStudentProfile}
        theme={theme}
        userProfile={userProfile}
        onBack={() => navigateTo('landing')}
        onProfileUpdated={setProfileOverride}
        onProjects={() => navigateTo('proyectos')}
        onStudentHome={() => navigateTo('estudiante')}
        onToggleTheme={toggleTheme}
        onUsers={() => navigateTo('usuarios')}
      />
    )
  }

  if (currentPage === 'ia') {
    return <IAPage theme={theme} userProfile={userProfile} />
  }

  if (currentPage === 'historialVersiones') {
    return (
      <VersionHistoryPage
        theme={theme}
        userProfile={userProfile}
        onBack={() => navigateTo('estudiante')}
        onRestored={handleVersionRestored}
      />
    )
  }

  return (
    <main className={`landing ${theme === 'light' ? 'landing-light' : ''}`}>
      <div className="hero-glow"></div>

      <motion.header
        className="navbar"
        initial={false}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <a className="brand" href="#top" aria-label="DrawSchema inicio">
          <span className="brand-icon">
            <Database size={18} />
          </span>
          <strong>DrawSchema</strong>
          <span>Producto</span>
        </a>

        <nav className="nav-links" aria-label="Navegacion principal">
          <a href="#how">Como funciona</a>
          <a href="#teams">Para equipos</a>
          <a href="#pricing">Precios</a>
          <button className="nav-link-button" onClick={() => navigateTo('login')} type="button">
            Iniciar sesion
          </button>
        </nav>

        <button
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="theme-toggle"
          onClick={toggleTheme}
          type="button"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <motion.a className="nav-cta magnetic-link" href="#pricing" whileHover={{ y: -2 }}>
          Empezar gratis <ArrowRight size={16} />
        </motion.a>
      </motion.header>

      <motion.section
        animate="visible"
        className="hero-section"
        id="top"
        initial="hidden"
        variants={staggerGroup}
      >
        <motion.p className="pill" variants={fadeUp}>
          <Sparkles size={14} /> El nuevo estandar para modelar datos
        </motion.p>
        <motion.h1 variants={fadeUp}>Pensa la estructura. Construi lo que sigue.</motion.h1>
        <motion.p className="hero-copy" variants={fadeUp}>
          La pizarra colaborativa para disenar bases de datos que todos entienden.
          Desde la primera idea hasta el esquema listo para produccion.
        </motion.p>

        <motion.div className="hero-actions" variants={fadeUp}>
          <motion.a
            className="primary-button magnetic-link"
            href="#pricing"
            whileHover={{ scale: 1.04, y: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            Crear workspace gratis <ArrowRight size={18} />
          </motion.a>
          <motion.a
            className="secondary-button magnetic-link"
            href="#product"
            whileHover={{ scale: 1.04, y: -3 }}
            whileTap={{ scale: 0.98 }}
          >
            <Play size={17} fill="currentColor" /> Ver como funciona
          </motion.a>
        </motion.div>

        <motion.p className="microcopy" variants={fadeUp}>
          Sin tarjeta de credito - 3 proyectos gratis - colaboracion ilimitada
        </motion.p>
      </motion.section>

      <motion.section
        aria-label="Vista del producto"
        className="product-section"
        id="product"
        initial="hidden"
        transition={{ duration: 0.7 }}
        variants={fadeUp}
        viewport={{ once: true, amount: 0.28 }}
        whileInView="visible"
      >
        <motion.div className="product-window" whileHover={{ scale: 1.01 }}>
          <div className="window-topbar">
            <div className="window-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p>workspace / product-schema</p>
            <div className="status">
              <span>{activityMessages[activityIndex]}</span>
              <strong>AM</strong>
              <strong>JS</strong>
              <strong>+3</strong>
            </div>
          </div>

          <div className="schema-board">
            <div className="grid-pulse"></div>
            <svg className="relation-svg" viewBox="0 0 760 390" aria-hidden="true">
              <path d="M230 155 C310 155 330 260 390 260" />
              <path d="M510 260 C560 260 570 145 650 145" />
            </svg>

            <div className="toolbox">
              <span>
                <MousePointer2 size={16} />
              </span>
              <span>
                <Layers3 size={16} />
              </span>
              <span>
                <Command size={16} />
              </span>
            </div>

            <motion.article
              animate={{ y: [0, -8, 0] }}
              className={`schema-card card-users ${activeTable === 0 ? 'active-card' : ''}`}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="schema-card-title">
                <strong>users</strong>
                <span></span>
              </div>
              <p>id - uuid - PK</p>
              <p>email - varchar</p>
              <p>created_at - timestamp</p>
            </motion.article>

            <motion.article
              animate={{ y: [0, 10, 0] }}
              className={`schema-card card-projects ${activeTable === 1 ? 'active-card' : ''}`}
              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="schema-card-title">
                <strong>projects</strong>
                <span></span>
              </div>
              <p>id - uuid - PK</p>
              <p>owner_id - uuid - FK</p>
              <p>name - varchar</p>
            </motion.article>

            <motion.article
              animate={{ y: [0, -6, 0] }}
              className={`schema-card card-tasks ${activeTable === 2 ? 'active-card' : ''}`}
              transition={{ duration: 4.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="schema-card-title">
                <strong>tasks</strong>
                <span></span>
              </div>
              <p>id - uuid - PK</p>
              <p>project_id - uuid - FK</p>
              <p>status - enum</p>
            </motion.article>

            <div className="collab-cursor cursor-one">
              <span></span>
              Ana
            </div>
            <div className="collab-cursor cursor-two">
              <span></span>
              JS
            </div>

            <span className="zoom">{activeTable === 1 ? '125%' : '100%'}</span>
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        className="truth-section"
        id="teams"
        initial="hidden"
        variants={staggerGroup}
        viewport={{ once: true, amount: 0.22 }}
        whileInView="visible"
      >
        <motion.p className="section-kicker" variants={fadeUp}>
          Una sola fuente de verdad
        </motion.p>
        <motion.h2 variants={fadeUp}>De la conversacion al modelo, sin perder contexto.</motion.h2>
        <motion.p className="section-copy" variants={fadeUp}>
          Las decisiones importantes no deberian vivir en una captura de pantalla perdida.
          DrawSchema convierte las ideas de tu equipo en un sistema visual, compartido
          y siempre actualizado.
        </motion.p>

        <motion.div className="benefit-grid" variants={staggerGroup}>
          {benefits.map((benefit) => {
            const Icon = benefit.icon

            return (
              <motion.article
                className="benefit-card animated-card"
                key={benefit.title}
                variants={fadeUp}
                whileHover={{ y: -10, borderColor: '#5a5a5a' }}
              >
                <span className="benefit-icon">
                  <Icon size={21} />
                </span>
                <h3>{benefit.title}</h3>
                <p>{benefit.text}</p>
                <a href="#how">
                  {benefit.link} <ArrowRight size={15} />
                </a>
              </motion.article>
            )
          })}
        </motion.div>
      </motion.section>

      <motion.section
        className="steps-section"
        id="how"
        initial="hidden"
        variants={staggerGroup}
        viewport={{ once: true, amount: 0.22 }}
        whileInView="visible"
      >
        <motion.p className="section-kicker" variants={fadeUp}>
          Como funciona
        </motion.p>
        <motion.h2 variants={fadeUp}>Menos friccion. Mas claridad.</motion.h2>
        <motion.p className="section-copy" variants={fadeUp}>
          Un flujo simple para que tu equipo se concentre en las decisiones, no en las herramientas.
        </motion.p>

        <motion.div className="steps-list" variants={staggerGroup}>
          {steps.map((step) => (
            <motion.article className="step-item animated-card" key={step.number} variants={fadeUp}>
              <span>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        className="final-cta"
        initial="hidden"
        variants={fadeUp}
        viewport={{ once: true, amount: 0.35 }}
        whileInView="visible"
      >
        <motion.div whileHover={{ scale: 0.99 }}>
          <p className="section-kicker">Para equipos que piensan a futuro</p>
          <h2>Tu proximo sistema empieza con una conversacion.</h2>
          <motion.a
            className="dark-button magnetic-link"
            href="#pricing"
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
          >
            Empezar ahora <ArrowRight size={18} />
          </motion.a>
        </motion.div>
      </motion.section>

      <motion.section
        className="pricing-section"
        id="pricing"
        initial="hidden"
        variants={staggerGroup}
        viewport={{ once: true, amount: 0.2 }}
        whileInView="visible"
      >
        <motion.div className="pricing-grid" variants={staggerGroup}>
          {plans.map((plan) => (
            <motion.article
              className="price-card animated-card"
              key={plan.name}
              variants={fadeUp}
              whileHover={{ y: -8, borderColor: '#f4f4f1' }}
            >
              <div className="plan-top">
                <p className="section-kicker">{plan.name}</p>
                {plan.badge ? <span>{plan.badge}</span> : null}
              </div>
              <h3>
                {plan.price}
                {plan.detail ? <small>{plan.detail}</small> : null}
              </h3>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={16} /> {feature}
                  </li>
                ))}
              </ul>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <footer className="footer">
        <div>
          <a className="brand" href="#top" aria-label="DrawSchema inicio">
            <span className="brand-icon">
              <Database size={18} />
            </span>
            <strong>DrawSchema</strong>
          </a>
          <p>Disena mejor. Construi con claridad.</p>
        </div>
        <nav aria-label="Navegacion secundaria">
          <a href="#product">Producto</a>
          <a href="#pricing">Precios</a>
          <a href="#top">Volver arriba</a>
        </nav>
        <p>2025 DrawSchema</p>
      </footer>
    </main>
  )
}

export default App
