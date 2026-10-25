import { useEffect, useRef, useState } from 'react'
import { formatarNumeroMascarado, limitarDigitos, normalizarDinheiroInterativo, normalizarNumeroDigitado, type NumericMask } from '../domain/inputMask'

type CampoProps = { rotulo: string; id: string; valor: string | number; onChange: (v: string) => void; tipo?: string; passo?: string; limite?: number; maxDigitos?: number; min?: string | number; minLength?: number; required?: boolean; disabled?: boolean; readOnly?: boolean; inputMode?: 'numeric' | 'decimal' }

const ICONOS = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  recipe: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></>,
  sell: <><path d="M4 7h16v13H4zM8 7a4 4 0 0 1 8 0M8 12h8M8 16h5" /></>,
  stock: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5M12 8v5" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  box: <><path d="m3 7 9-4 9 4-9 5zM3 7v10l9 4 9-4V7M12 12v9" /></>,
  cost: <><circle cx="12" cy="12" r="9" /><path d="M16 8.5c-.7-.8-1.8-1.2-3.2-1.2-1.7 0-2.8.8-2.8 2 0 3.3 6 1.3 6 4.5 0 1.3-1.2 2.2-3.2 2.2-1.5 0-2.8-.5-3.7-1.5M12 5.5v13" /></>,
  settings: <><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /><path d="m19.4 15 .1.1-1.4 2.4-.2-.1a2 2 0 0 0-2 .7l-.1.2h-2.8v-.2a2 2 0 0 0-1.4-1.4h-.2v-2.8l.2-.1a2 2 0 0 0 .7-2l-.1-.2 1.4-2.4.2.1a2 2 0 0 0 2-.7l.1-.2h2.8v.2a2 2 0 0 0 1.4 1.4h.2v2.8l-.2.1a2 2 0 0 0-.7 2z" transform="translate(-2 -2) scale(1.16)" /></>,
  calculator: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  truck: <><path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z" /><circle cx="7.5" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></>,
  chart: <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20" /></>,
  tag: <><path d="M20 13 13 20 3 10V4h6z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  price: <><path d="M4 19 19 4M7 7h.01M17 17h.01" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></>,
  add: <><path d="M12 5v14M5 12h14" /></>,
  edit: <><path d="m4 16-.8 4.8L8 20l11-11-4-4zM13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  cart: <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 9H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01M16 17h.01" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
} as const

export function Icon({ name, size = 20 }: { name: keyof typeof ICONOS; size?: number }) {
  return (
    <svg className="i" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONOS[name]}
    </svg>
  )
}

export function FecharModal({ onClick }: { onClick: () => void }) {
  return <button className="add-dialog-close" type="button" aria-label="Fechar modal" onClick={onClick}><Icon name="close" size={18} /></button>
}

export function focarCampo(id: string) {
  requestAnimationFrame(() => {
    const campo = document.getElementById(id)
    if (campo instanceof HTMLElement) campo.focus()
  })
}

export function useModalAcessivel(aberto: boolean, aoFechar: () => void, seletor: string) {
  const fecharRef = useRef(aoFechar)
  fecharRef.current = aoFechar

  useEffect(() => {
    if (!aberto) return
    const modal = document.querySelector<HTMLElement>(seletor)
    if (!modal) return
    const focoAnterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const obterFocaveis = () => [...modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true')
    const animation = requestAnimationFrame(() => {
      const focaveis = obterFocaveis()
      const alvo = modal.querySelector<HTMLElement>('[autofocus]') ?? focaveis[0] ?? modal
      alvo.focus()
    })
    const keydown = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
      if (dialogs[dialogs.length - 1] !== modal) return
      if (event.key === 'Escape') {
        event.preventDefault()
        fecharRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focaveis = obterFocaveis()
      if (!focaveis.length) {
        event.preventDefault()
        modal.focus()
        return
      }
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (event.shiftKey && (document.activeElement === primeiro || !modal.contains(document.activeElement))) {
        event.preventDefault()
        ultimo.focus()
      } else if (!event.shiftKey && (document.activeElement === ultimo || !modal.contains(document.activeElement))) {
        event.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      cancelAnimationFrame(animation)
      document.removeEventListener('keydown', keydown)
      if (focoAnterior?.isConnected) focoAnterior.focus()
    }
  }, [aberto, seletor])
}

export function MensagemModal({
  tipo, mensagem, onFechar, titulo,
}: {
  tipo: 'sucesso' | 'erro'; mensagem: string; onFechar: () => void; titulo?: string
}) {
  useModalAcessivel(Boolean(mensagem), onFechar, '#mensagem-modal')
  if (!mensagem) return null
  return (
    <div className="alert-overlay">
      <section id="mensagem-modal" className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mensagem-modal-titulo" aria-describedby="mensagem-modal-texto">
        <FecharModal onClick={onFechar} />
        <span className={`alert-icon${tipo === 'erro' ? ' danger' : ''}`}><Icon name={tipo === 'erro' ? 'close' : 'check'} size={26} /></span>
        <h2 id="mensagem-modal-titulo">{titulo ?? (tipo === 'erro' ? 'Não foi possível concluir' : 'Tudo certo!')}</h2>
        <p id="mensagem-modal-texto">{mensagem}</p>
        <div className="alert-actions">
          <button className="bt o" type="button" onClick={onFechar}>Cancelar</button>
          <button className="bt" type="button" autoFocus onClick={onFechar}>Confirmar</button>
        </div>
      </section>
    </div>
  )
}

const dataIsoLocal = (data: Date) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`

const dataLocalFromIso = (valor: string) => {
  const [ano, mes, dia] = valor.split('-').map(Number)
  return valor ? new Date(ano, mes - 1, dia) : new Date()
}

export function SeletorData({
  rotulo, id, valor, onChange, min, max, required, permitirValor, disabled,
}: {
  rotulo: string; id: string; valor: string; onChange: (valor: string) => void
  min?: string; max?: string; required?: boolean; permitirValor?: string; disabled?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [mesExibido, setMesExibido] = useState(() => {
    const data = dataLocalFromIso(valor)
    return new Date(data.getFullYear(), data.getMonth(), 1)
  })
  const seletor = `[id="${id}-calendario"]`
  const fechar = () => setAberto(false)

  useModalAcessivel(aberto, fechar, seletor)

  const hoje = dataIsoLocal(new Date())
  const selecionada = valor ? dataLocalFromIso(valor) : null
  const primeiroDia = new Date(mesExibido.getFullYear(), mesExibido.getMonth(), 1)
  const deslocamento = (primeiroDia.getDay() + 6) % 7
  const diasNoMes = new Date(mesExibido.getFullYear(), mesExibido.getMonth() + 1, 0).getDate()
  const dias = Array.from({ length: Math.ceil((deslocamento + diasNoMes) / 7) * 7 }, (_, index) => {
    const dia = index - deslocamento + 1
    return dia > 0 && dia <= diasNoMes
      ? new Date(mesExibido.getFullYear(), mesExibido.getMonth(), dia)
      : null
  })
  const tituloMes = mesExibido.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return <>
    <label className="fl">
      <small>{rotulo}{required ? ' *' : ''}</small>
      <button
        id={id}
        className="date-picker-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        disabled={disabled}
        aria-label={`${rotulo}: ${valor ? selecionada?.toLocaleDateString('pt-BR') : 'não selecionada'}. Abrir calendário`}
        data-testid={id}
        onClick={() => {
          const data = dataLocalFromIso(valor)
          setMesExibido(new Date(data.getFullYear(), data.getMonth(), 1))
          setAberto(true)
        }}
      >
        <span>{valor ? selecionada?.toLocaleDateString('pt-BR') : 'Selecione'}</span>
        <Icon name="calendar" />
      </button>
    </label>
    {aberto && <div className="alert-overlay date-picker-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) fechar()
    }}>
      <section
        id={`${id}-calendario`}
        className="date-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
      >
        <FecharModal onClick={fechar} />
        <div className="date-picker-heading">
          <p>{rotulo}</p>
          <h2 id={`${id}-titulo`}>{valor ? selecionada?.toLocaleDateString('pt-BR', {
            weekday: 'long', day: 'numeric', month: 'long',
          }) : 'Escolha uma data'}</h2>
        </div>
        <div className="date-picker-month">
          <button type="button" className="date-picker-nav" aria-label="Mês anterior"
            onClick={() => setMesExibido(new Date(mesExibido.getFullYear(), mesExibido.getMonth() - 1, 1))}>‹</button>
          <b>{tituloMes}</b>
          <button type="button" className="date-picker-nav" aria-label="Próximo mês"
            onClick={() => setMesExibido(new Date(mesExibido.getFullYear(), mesExibido.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="date-picker-grid" role="grid" aria-label={tituloMes}>
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((dia, index) =>
            <span className="date-picker-weekday" role="columnheader" key={`${dia}-${index}`}>{dia}</span>)}
          {dias.map((dia, index) => {
            if (!dia) return <span className="date-picker-empty" role="gridcell" key={`empty-${index}`} />
            const iso = dataIsoLocal(dia)
            const indisponivel = (min !== undefined && iso < min && iso !== permitirValor)
              || (max !== undefined && iso > max)
            const selecionado = iso === valor
            return <button
              key={iso}
              className={`date-picker-day${selecionado ? ' selected' : ''}${iso === hoje ? ' today' : ''}`}
              type="button"
              role="gridcell"
              aria-label={dia.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={selecionado}
              disabled={indisponivel}
              onClick={() => {
                onChange(iso)
                fechar()
              }}
            >{dia.getDate()}</button>
          })}
        </div>
        <div className="date-picker-actions">
          {!required && valor && <button className="bt o" type="button" onClick={() => {
            onChange('')
            fechar()
          }}>Limpar data</button>}
          <button className="bt" type="button" onClick={fechar}>Fechar</button>
        </div>
      </section>
    </div>}
  </>
}

export function AlertaConclusao({ mensagem, onConcluir }: { mensagem: string; onConcluir: () => void }) {
  return <MensagemModal tipo="sucesso" mensagem={mensagem} onFechar={onConcluir} />
}

export function ConfirmacaoAcao({
  titulo = 'Confirmar ação', mensagem, confirmar = 'Confirmar', perigosa = false, onCancelar, onConfirmar, id,
}: {
  titulo?: string; mensagem: string; confirmar?: string; perigosa?: boolean; onCancelar: () => void; onConfirmar: () => void; id?: string
}) {
  return (
    <div className="alert-overlay">
      <section id={id} className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" tabIndex={-1}>
        <FecharModal onClick={onCancelar} />
        <span className={`alert-icon${perigosa ? ' danger' : ''}`}><Icon name={perigosa ? 'trash' : 'check'} size={26} /></span>
        <h2 id="confirm-title">{titulo}</h2>
        <p id="confirm-message">{mensagem}</p>
        <div className="alert-actions">
          <button className="bt o" type="button" onClick={onCancelar}>Cancelar</button>
          <button className={`bt${perigosa ? ' danger-button' : ''}`} type="button" autoFocus onClick={onConfirmar}>{confirmar}</button>
        </div>
      </section>
    </div>
  )
}

type CampoComMascaraProps = CampoProps & { mascara?: NumericMask; placeholder?: string }

export const Campo = ({ rotulo, id, valor, onChange, tipo = 'text', passo, limite, maxDigitos, min, minLength, required, disabled, readOnly, inputMode, mascara, placeholder }: CampoComMascaraProps) => {
  const [focado, setFocado] = useState(false)
  const [rascunho, setRascunho] = useState<string | null>(null)
  const valorTexto = String(valor)
  const valorAtual = focado && rascunho !== null ? rascunho : valorTexto
  const exibido = mascara ? formatarNumeroMascarado(valorAtual, mascara, focado) : valorTexto
  const placeholderPadrao = mascara === 'dinheiro'
    ? 'R$ 0,00'
    : mascara === 'percentual'
      ? '0%'
      : mascara
        ? '0'
        : `Digite ${rotulo.toLocaleLowerCase('pt-BR')}`

  const atualizarComMascara = (input: HTMLInputElement) => {
    if (!mascara) {
      onChange(input.value)
      return
    }
    const textoDigitado = maxDigitos === undefined ? input.value : limitarDigitos(input.value, maxDigitos)
    const digitosAntes = (textoDigitado.slice(0, input.selectionStart ?? input.value.length).match(/\d/g) ?? []).length
    const separadorAntes = /[,.]/.test(textoDigitado.slice(0, input.selectionStart ?? input.value.length))
    const normalizado = mascara === 'dinheiro'
      ? normalizarDinheiroInterativo(textoDigitado)
      : normalizarNumeroDigitado(textoDigitado, mascara)
    setRascunho(normalizado)
    onChange(normalizado)
    requestAnimationFrame(() => {
      const formatado = formatarNumeroMascarado(normalizado, mascara, true)
      if (mascara === 'dinheiro') {
        input.setSelectionRange(formatado.length, formatado.length)
        return
      }
      let posicao = 0
      let digitos = 0
      while (posicao < formatado.length && digitos < digitosAntes) {
        if (/\d/.test(formatado[posicao])) digitos++
        posicao++
      }
      if (separadorAntes) {
        const separador = formatado.indexOf(',')
        if (separador >= 0) posicao = Math.max(posicao, separador + 1)
      }
      input.setSelectionRange(posicao, posicao)
    })
  }

  return (
    <label className="fl"><small>{rotulo}</small>
      <input
        id={id}
        type={mascara ? 'text' : tipo}
        step={mascara ? undefined : passo}
        inputMode={mascara ? (mascara === 'inteiro' ? 'numeric' : 'decimal') : inputMode ?? (tipo === 'number' ? 'decimal' : undefined)}
        value={exibido}
        placeholder={placeholder ?? placeholderPadrao}
        maxLength={maxDigitos === undefined ? limite : undefined}
        min={min}
        minLength={minLength}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        data-testid={id}
        onMouseDown={(event) => {
          if (mascara && document.activeElement !== event.currentTarget) {
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.select()
          }
        }}
        onFocus={(event) => {
          const input = event.currentTarget
          setRascunho(valorTexto)
          setFocado(true)
          if (mascara) input.select()
        }}
        onBlur={(event) => {
          setFocado(false)
          setRascunho(null)
          if (mascara) onChange(normalizarNumeroDigitado(event.currentTarget.value, mascara).replace(/\.$/, ''))
        }}
        onChange={(event) => atualizarComMascara(event.currentTarget)}
      /></label>
  )
}

export const Selecao = ({ rotulo, id, valor, onChange, opcoes, disabled, required, placeholder = 'Selecione' }: {
  rotulo: string; id: string; valor: string; onChange: (v: string) => void; opcoes: [string, string][]; disabled?: boolean; required?: boolean; placeholder?: string
}) => (
  <label className="fl"><small>{rotulo}</small>
    <select id={id} value={valor} disabled={disabled} required={required} data-testid={id} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select></label>
)
