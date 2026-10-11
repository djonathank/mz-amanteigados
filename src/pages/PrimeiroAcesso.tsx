import { useState, type FormEvent } from 'react'
import { useGoogleSync } from '../data/GoogleSyncContext'

export default function PrimeiroAcesso() {
  const google = useGoogleSync()
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const iniciar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (salvando || google.sincronizando) return
    setErro('')
    setSalvando(true)
    try {
      await google.conectar()
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
      <form className="cd" onSubmit={(event) => void iniciar(event)}>
        <p className="sb">Entre com sua conta Google para acessar o aplicativo e sincronizar seus dados entre aparelhos.</p>
        {(erro || google.erro) && <p className="notice error" role="alert">{erro || google.erro}</p>}
        <div className="first-access-actions">
          <button className="bt" type="submit" disabled={salvando || google.sincronizando} data-testid="primeiro-acesso.google">
            {google.sincronizando ? 'Conectando e sincronizando...' : salvando ? 'Conectando...' : 'Entrar com Google'}
          </button>
        </div>
      </form>
    </div>
  )
}
