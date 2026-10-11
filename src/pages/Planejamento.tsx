import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarNecessidadesEncomendas } from '../data/phase2'
import { useDb } from '../data/DbContext'

interface Faltante {
  receita: string; insumo: string; unidade: string; necessario: number; disponivel: number; faltante: number
}

export default function Planejamento() {
  const db = useDb()
  const [lista, setLista] = useState<Faltante[]>([])
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    let ativo = true
    void listarNecessidadesEncomendas(db).then((rows) => {
      if (ativo) setLista(rows)
    }).catch((error) => {
      if (ativo) setErro(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (ativo) setCarregando(false)
    })
    return () => { ativo = false }
  }, [db])
  return (
    <>
      <Link className="back-link" to="/estoque">‹ Estoque</Link>
      <h1>Lista de compras</h1>
      <p className="sb">Insumos que faltam para atender as encomendas abertas.</p>
      {erro && <p className="notice error" role="alert">{erro}</p>}
      {carregando && <p className="notice" role="status">Calculando necessidades...</p>}
      {!carregando && !erro && !lista.length && <p className="notice">O estoque atual cobre as encomendas abertas, ou ainda não há encomendas.</p>}
      {lista.map((item) => <section className="cd" key={`${item.receita}-${item.insumo}`}>
        <div className="r"><span><b>{item.insumo}</b><small>Receita: {item.receita} · falta {item.faltante} {item.unidade}</small></span>
          <b>{item.faltante} {item.unidade}</b></div>
        <small>Necessário: {item.necessario} · disponível: {item.disponivel}</small>
      </section>)}
      {!!lista.length && <Link className="bt" to="/compra">Registrar compra de insumo</Link>}
    </>
  )
}
