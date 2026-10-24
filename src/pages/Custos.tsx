import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { lerConfig, salvarConfig } from '../data/repos'
import { AlertaConclusao, Campo } from './ui'

const CAMPOS: [string, string, string][] = [
  ['hora_trabalho', 'Valor da hora de trabalho (R$)', '20'],
  ['gas_lote', 'Gás e energia por receita (R$)', '3.5'],
  ['taxa_pix', 'Taxa do Pix (%)', '0'],
  ['taxa_cartao', 'Taxa do cartão (%)', '3.5'],
  ['margem_padrao', 'Margem padrão (%)', '40'],
  ['chave_pix', 'Chave Pix', ''],
]

export default function Custos() {
  const db = useDb()
  const [v, setV] = useState<Record<string, string>>({})
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    let ativo = true
    void lerConfig(db).then((config) => {
      if (!ativo) return
      const legacy = (centsKey: string) => {
        const value = config[centsKey]
        return value === undefined ? undefined : String(Number(value) / 100)
      }
      setV(Object.fromEntries(CAMPOS.map(([key, , fallback]) => {
        const stored = config[key] ?? (key === 'gas_lote'
          ? legacy('gas_lote_cents')
          : key === 'hora_trabalho'
            ? legacy('valor_hora_cents') ?? legacy('hora_trabalho_cents')
            : undefined)
        return [key, stored ?? fallback]
      })))
    }).catch((e) => {
      if (ativo) setErro(e instanceof Error ? e.message : String(e))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db])
  const valoresValidos = CAMPOS.filter(([key]) => key !== 'chave_pix').every(([key]) => {
    const value = Number(v[key])
    return Number.isFinite(value) && value >= 0
  })
  const valido = valoresValidos && Number(v.margem_padrao) + Math.max(Number(v.taxa_pix), Number(v.taxa_cartao)) < 100

  const salvar = async () => {
    if (!valido || salvando) return
    setSalvando(true)
    setErro('')
    try {
      await salvarConfig(db, v)
      setConfirmacao('Custos salvos. A hora de trabalho entra no cálculo quando a receita tiver tempo de preparo.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <AlertaConclusao mensagem={confirmacao} onConcluir={() => setConfirmacao('')} />
      <Link className="back-link" to="/mais">‹ Mais</Link>
      <h1>Custos</h1>
      <p className="sb">Valores usados para calcular o preço dos pacotes</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {carregando ? <p className="notice" role="status">Carregando configurações...</p> : (
      <div className="cd">
        <h2>Custos e taxas</h2>
        <div className="settings-grid">
          {CAMPOS.map(([k, rotulo]) => (
            <Campo key={k} rotulo={rotulo} id={`custos.${k}`} valor={v[k] ?? ''}
              mascara={k === 'hora_trabalho' || k === 'gas_lote' ? 'dinheiro' : k === 'chave_pix' ? undefined : 'percentual'}
              placeholder={k === 'chave_pix' ? 'Digite sua chave Pix' : undefined}
              onChange={(x) => { setV({ ...v, [k]: x }); setConfirmacao('') }} />
          ))}
        </div>
        <button className="bt" disabled={!valido || salvando} data-testid="custos.salvar" onClick={salvar}>
          {salvando ? 'Salvando...' : 'Salvar custos'}
        </button>
        {!valido && <p className="notice">Informe valores válidos, entre zero e 100% para taxas e margem.</p>}
      </div>
      )}
    </>
  )
}
