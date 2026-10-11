import { useState } from 'react'
import { formatarNumeroMascarado, normalizarDinheiroInterativo, normalizarNumeroDigitado, type NumericMask } from '../domain/inputMask'

type CampoProps = { rotulo: string; id: string; valor: string | number; onChange: (v: string) => void; tipo?: string; passo?: string; limite?: number; min?: string | number; disabled?: boolean; readOnly?: boolean }

const ICONOS = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  recipe: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></>,
  sell: <><path d="M4 7h16v13H4zM8 7a4 4 0 0 1 8 0M8 12h8M8 16h5" /></>,
  stock: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5M12 8v5" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  box: <><path d="m3 7 9-4 9 4-9 5zM3 7v10l9 4 9-4V7M12 12v9" /></>,
  cost: <><circle cx="12" cy="12" r="9" /><path d="M16 8.5c-.7-.8-1.8-1.2-3.2-1.2-1.7 0-2.8.8-2.8 2 0 3.3 6 1.3 6 4.5 0 1.3-1.2 2.2-3.2 2.2-1.5 0-2.8-.5-3.7-1.5M12 5.5v13" /></>,
  settings: <><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /><path d="m19.4 15 .1.1-1.4 2.4-.2-.1a2 2 0 0 0-2 .7l-.1.2h-2.8v-.2a2 2 0 0 0-1.4-1.4h-.2v-2.8l.2-.1a2 2 0 0 0 .7-2l-.1-.2 1.4-2.4.2.1a2 2 0 0 0 2-.7l.1-.2h2.8v.2a2 2 0 0 0 1.4 1.4h.2v2.8l-.2.1a2 2 0 0 0-.7 2z" transform="translate(-2 -2) scale(1.16)" /></>,
  price: <><path d="M4 19 19 4M7 7h.01M17 17h.01" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></>,
  add: <><path d="M12 5v14M5 12h14" /></>,
  edit: <><path d="m4 16-.8 4.8L8 20l11-11-4-4zM13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  cart: <><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 9H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  backup: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
} as const

export function Icon({ name, size = 20 }: { name: keyof typeof ICONOS; size?: number }) {
  return (
    <svg className="i" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONOS[name]}
    </svg>
  )
}

export function focarCampo(id: string) {
  requestAnimationFrame(() => {
    const campo = document.getElementById(id)
    if (campo instanceof HTMLElement) campo.focus()
  })
}

export function AlertaConclusao({ mensagem, onConcluir }: { mensagem: string; onConcluir: () => void }) {
  if (!mensagem) return null
  return (
    <div className="alert-overlay">
      <section className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-message">
        <span className="alert-icon"><Icon name="check" size={26} /></span>
        <h2 id="alert-title">Tudo certo!</h2>
        <p id="alert-message">{mensagem}</p>
        <button className="bt" type="button" autoFocus onClick={onConcluir}>Concluir</button>
      </section>
    </div>
  )
}

export function ConfirmacaoAcao({
  titulo = 'Confirmar ação', mensagem, confirmar = 'Confirmar', perigosa = false, onCancelar, onConfirmar,
}: {
  titulo?: string; mensagem: string; confirmar?: string; perigosa?: boolean; onCancelar: () => void; onConfirmar: () => void
}) {
  return (
    <div className="alert-overlay">
      <section className="alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
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

export const Campo = ({ rotulo, id, valor, onChange, tipo = 'text', passo, limite, min, disabled, readOnly, mascara, placeholder }: CampoComMascaraProps) => {
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
    const digitosAntes = (input.value.slice(0, input.selectionStart ?? input.value.length).match(/\d/g) ?? []).length
    const separadorAntes = /[,.]/.test(input.value.slice(0, input.selectionStart ?? input.value.length))
    const normalizado = mascara === 'dinheiro'
      ? normalizarDinheiroInterativo(input.value)
      : normalizarNumeroDigitado(input.value, mascara)
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
        inputMode={mascara ? (mascara === 'inteiro' ? 'numeric' : 'decimal') : tipo === 'number' ? 'decimal' : undefined}
        value={exibido}
        placeholder={placeholder ?? placeholderPadrao}
        maxLength={limite}
        min={min}
        disabled={disabled}
        readOnly={readOnly}
        data-testid={id}
        onMouseDown={(event) => {
          if (mascara === 'dinheiro' && document.activeElement !== event.currentTarget) {
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.select()
          }
        }}
        onFocus={(event) => {
          const input = event.currentTarget
          setRascunho(valorTexto)
          setFocado(true)
          if (mascara === 'dinheiro') input.select()
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

export const Selecao = ({ rotulo, id, valor, onChange, opcoes, disabled, placeholder = 'Selecione' }: {
  rotulo: string; id: string; valor: string; onChange: (v: string) => void; opcoes: [string, string][]; disabled?: boolean; placeholder?: string
}) => (
  <label className="fl"><small>{rotulo}</small>
    <select id={id} value={valor} disabled={disabled} data-testid={id} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {opcoes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select></label>
)
