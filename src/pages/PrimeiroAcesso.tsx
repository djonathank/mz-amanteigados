import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { useGoogleSync } from '../data/GoogleSyncContext'
import { salvarConfig } from '../data/repos'

export default function PrimeiroAcesso() {
  const db = useDb()
  const google = useGoogleSync()
  const navigate = useNavigate()
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const conectarGoogle = async () => {
    if (salvando || google.sincronizando) return
    setErro('')
    setSalvando(true)
    try {
      const conta = await google.conectar()
      const nomePerfil = conta.nome || conta.email.split('@')[0]
      await salvarConfig(db, { nome_usuario: nomePerfil })
      navigate('/', { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setSalvando(false)
    }
  }

  return (
    <div className="first-access">
      <header className="first-access-brand">
        <img className="home-avatar" src="/assets/mz-gestao-icon.svg" alt="MZ Gestão" />
        <p>Bem-vindo ao</p>
        <h1>MZ Gestão</h1>
        <span>Amanteigadas que Derretem na Boca</span>
      </header>
      <form className="cd" onSubmit={(event) => { event.preventDefault(); void conectarGoogle() }}>
        <p className="sb">Entre com sua conta Google. Seus dados serão carregados da planilha e cada alteração será sincronizada automaticamente.</p>
        {(erro || google.erro) && <p className="notice error" role="alert">{erro || google.erro}</p>}
        <div className="first-access-actions">
          <button className="bt" type="submit" disabled={salvando || google.sincronizando} data-testid="primeiro-acesso.google">
            {salvando || google.sincronizando ? 'Conectando e carregando a planilha...' : 'Entrar com Google'}
          </button>
        </div>
      </form>
    </div>
  )
}
