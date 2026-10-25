import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { lerConfig, salvarConfig } from '../data/repos'
import { Campo, MensagemModal } from './ui'

const CAMPOS: [string, string, string, 'dinheiro' | 'percentual'][] = [
  ['hora_trabalho', 'Valor da hora trabalhada (R$)', '20', 'dinheiro'],
  ['gas_lote', 'Gás e energia por receita (R$)', '3.5', 'dinheiro'],
  ['taxa_pix', 'Taxa do Pix (%)', '0', 'percentual'],
  ['taxa_cartao_credito', 'Taxa de cartão de crédito (%)', '3.5', 'percentual'],
  ['taxa_cartao_debito', 'Taxa de cartão de débito (%)', '3.5', 'percentual'],
  ['margem_padrao', 'Margem padrão (%)', '40', 'percentual'],
]

export default function Custos() {
  const db = useDb()
  const [valores, setValores] = useState<Record<string, string>>({})
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    void lerConfig(db).then((config) => {
      if (!ativo) return
      const legacy = (key: string) => config[key] === undefined ? undefined : String(Number(config[key]) / 100)
      const defaults = Object.fromEntries(CAMPOS.map(([key, , fallback]) => {
        const stored = config[key]
          ?? (key === 'gas_lote' ? legacy('gas_lote_cents')
            : key === 'hora_trabalho' ? legacy('valor_hora_cents') ?? legacy('hora_trabalho_cents')
              : key === 'taxa_cartao_credito' || key === 'taxa_cartao_debito' ? config.taxa_cartao
                : undefined)
        return [key, stored ?? fallback]
      }))
      setValores(defaults)
    }).catch((error) => {
      if (ativo) setErro(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db])

  const valoresValidos = CAMPOS.every(([key, , , mascara]) => {
    const value = Number(valores[key])
    const limite = mascara === 'percentual' ? 100 : 999.99
    return Number.isFinite(value) && value >= 0 && value <= limite
  })
  const taxaCartao = Math.max(Number(valores.taxa_cartao_credito), Number(valores.taxa_cartao_debito))
  const valido = valoresValidos && Number(valores.margem_padrao) + Math.max(Number(valores.taxa_pix), taxaCartao) < 100

  const salvar = async () => {
    if (!valido || salvando) return
    setSalvando(true)
    setErro('')
    try {
      await salvarConfig(db, { ...valores, taxa_cartao: valores.taxa_cartao_credito })
      setConfirmacao('Custos salvos. A hora de trabalho entra no cálculo quando a receita tiver tempo de preparo.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <MensagemModal tipo="sucesso" mensagem={confirmacao} onFechar={() => setConfirmacao('')} />
      <MensagemModal tipo="erro" mensagem={erro} onFechar={() => setErro('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Custos</h1>
      <p className="sb">Valores usados para calcular o preço dos produtos</p>
      {carregando ? <p className="notice" role="status">Carregando custos...</p> : (
        <div className="cd">
          <h2>Custos e taxas</h2>
          <div className="settings-grid">
            {CAMPOS.map(([key, rotulo, , mascara]) => (
              <Campo key={key} rotulo={rotulo} id={`custos.${key}`} valor={valores[key] ?? ''}
                mascara={mascara}
                onChange={(value) => {
                  setValores((current) => ({ ...current, [key]: value }))
                  setConfirmacao('')
                  setErro('')
                }} />
            ))}
          </div>
          <button className="bt" disabled={!valido || salvando} data-testid="custos.salvar" onClick={() => void salvar()}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          {!valoresValidos && <p className="notice">Percentuais devem ficar entre 0% e 100%; valores em reais, entre R$ 0,00 e R$ 999,99.</p>}
          {valoresValidos && !valido && <p className="notice">A margem somada à maior taxa de pagamento precisa ser menor que 100%.</p>}
        </div>
      )}
    </>
  )
}
