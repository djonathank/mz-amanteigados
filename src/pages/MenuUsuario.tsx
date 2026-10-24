import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDb } from '../data/DbContext'
import { useGoogleSync } from '../data/GoogleSyncContext'
import { lerConfig, salvarConfig } from '../data/repos'
import { AVATAR_DEFAULT, carregarAvatar } from './avatar'

export default function MenuUsuario() {
  const db = useDb()
  const google = useGoogleSync()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')
  const [carregandoPerfil, setCarregandoPerfil] = useState(true)
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [avatar, setAvatar] = useState(carregarAvatar)
  const [salvandoAvatar, setSalvandoAvatar] = useState(false)
  const seletorImagem = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ativo = true
    void lerConfig(db).then((config) => {
      if (ativo) setNome(config.nome_usuario || google.nome || google.email.split('@')[0] || '')
    }).catch((error) => {
      if (ativo) setErro(error instanceof Error ? error.message : String(error))
    }).finally(() => {
      if (ativo) setCarregandoPerfil(false)
    })
    return () => { ativo = false }
  }, [db, google.email, google.nome])

  const salvarNome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nomeSalvo = nome.trim()
    if (!nomeSalvo) {
      setErro('Informe um nome para continuar.')
      setMensagem('')
      return
    }
    setErro('')
    setMensagem('')
    setSalvandoNome(true)
    try {
      await salvarConfig(db, { nome_usuario: nomeSalvo })
      setNome(nomeSalvo)
      setMensagem('Nome atualizado.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvandoNome(false)
    }
  }

  const desconectar = async () => {
    setErro('')
    try {
      await google.desconectar()
      navigate('/', { replace: true })
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  const alterarAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!arquivo) return
    setErro('')
    setMensagem('')
    if (!arquivo.type.startsWith('image/')) {
      setErro('Selecione um arquivo de imagem válido.')
      return
    }
    if (arquivo.size > 10 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 10 MB.')
      return
    }

    setSalvandoAvatar(true)
    try {
      const imagemUrl = URL.createObjectURL(arquivo)
      const imagem = new Image()
      try {
        await new Promise<void>((resolve, reject) => {
          imagem.onload = () => resolve()
          imagem.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'))
          imagem.src = imagemUrl
        })
      } finally {
        URL.revokeObjectURL(imagemUrl)
      }

      const lado = Math.min(imagem.naturalWidth, imagem.naturalHeight)
      if (!lado) throw new Error('A imagem selecionada não possui dimensões válidas.')
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const contexto = canvas.getContext('2d')
      if (!contexto) throw new Error('Não foi possível preparar a imagem neste aparelho.')
      contexto.fillStyle = '#fffdf8'
      contexto.fillRect(0, 0, canvas.width, canvas.height)
      contexto.drawImage(
        imagem,
        (imagem.naturalWidth - lado) / 2,
        (imagem.naturalHeight - lado) / 2,
        lado,
        lado,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      const imagemRedimensionada = canvas.toDataURL('image/jpeg', 0.82)
      setAvatar(imagemRedimensionada)
      setMensagem('Imagem do avatar atualizada até o fim desta sessão.')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    } finally {
      setSalvandoAvatar(false)
    }
  }

  const restaurarAvatar = () => {
    try {
      setAvatar(AVATAR_DEFAULT)
      setMensagem('Imagem padrão restaurada.')
      setErro('')
    } catch (error) {
      setErro(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="menu-user-page">
      <Link className="back-link" to="/">‹ Voltar ao início</Link>
      <h1>Menu</h1>
      <p className="sb">Seu perfil, conta Google e sincronização</p>

      <section className="cd profile-card" aria-labelledby="profile-title">
        <div className="profile-heading">
          <button
            className="profile-avatar-button"
            type="button"
            aria-label="Alterar imagem do avatar"
            disabled={salvandoAvatar}
            onClick={() => seletorImagem.current?.click()}
          >
            <img className="profile-avatar" src={avatar} alt="" />
          </button>
          <div>
            <h2 id="profile-title">Seu perfil</h2>
            <p className="helper">Toque na imagem para escolher uma foto deste aparelho.</p>
          </div>
        </div>
        <input
          ref={seletorImagem}
          className="avatar-file-input"
          type="file"
          accept="image/*"
          aria-label="Escolher imagem do avatar"
          data-testid="perfil.imagem"
          onChange={(event) => void alterarAvatar(event)}
        />
        <div className="avatar-actions">
          <button className="bt o" type="button" disabled={salvandoAvatar} onClick={() => seletorImagem.current?.click()}>
            {salvandoAvatar ? 'Atualizando imagem...' : 'Escolher imagem'}
          </button>
          {avatar !== AVATAR_DEFAULT && (
            <button className="bt o" type="button" disabled={salvandoAvatar} onClick={restaurarAvatar}>
              Restaurar imagem padrão
            </button>
          )}
        </div>
        <form onSubmit={(event) => void salvarNome(event)}>
          <label className="fl" htmlFor="nome-usuario">
            <small>Nome do usuário</small>
            <input
              id="nome-usuario"
              type="text"
              autoComplete="name"
              maxLength={60}
              required
              value={nome}
              disabled={carregandoPerfil || salvandoNome}
              placeholder="Como gostaria de ser chamado?"
              data-testid="perfil.nome"
              onChange={(event) => {
                setNome(event.currentTarget.value)
                setMensagem('')
              }}
            />
          </label>
          <button className="bt" type="submit" disabled={carregandoPerfil || salvandoNome} data-testid="perfil.salvar-nome">
            {salvandoNome ? 'Salvando...' : 'Salvar nome'}
          </button>
        </form>
        {mensagem && <p className="notice success" role="status">{mensagem}</p>}
      </section>

      <section className="cd" aria-labelledby="google-sync-title">
        <h2 id="google-sync-title">Conta Google e sincronização</h2>
        <p className="sb">
          {google.email
            ? `Conectado como ${google.email}. Seus dados são sincronizados com uma planilha no seu Google Drive.`
            : 'Conecte sua conta Google para criar uma planilha no seu Drive e sincronizar seus dados entre aparelhos conectados à mesma conta.'}
        </p>
        {(erro || google.erro) && <p className="notice error" role="alert">{erro || google.erro}</p>}
        {google.sincronizadoEm && <p className="notice success" role="status">Última sincronização: {new Date(google.sincronizadoEm).toLocaleString('pt-BR')}</p>}
        <div className="g">
          {!google.email ? (
            <button className="bt" disabled={google.sincronizando} data-testid="google.conectar" onClick={() => void google.conectar().catch(() => undefined)}>
              {google.sincronizando ? 'Conectando e sincronizando...' : 'Entrar com Google e sincronizar'}
            </button>
          ) : (
            <>
              <button className="bt o" disabled={google.sincronizando} data-testid="google.reconectar" onClick={() => void google.conectar().catch(() => undefined)}>
                Reconectar conta Google
              </button>
              <button className="bt" disabled={google.sincronizando} data-testid="google.sincronizar" onClick={() => void google.sincronizarAgora().catch(() => undefined)}>
                {google.sincronizando ? 'Sincronizando...' : 'Sincronizar agora'}
              </button>
              <button className="bt o" data-testid="google.abrir-planilha" disabled={!google.planilhaUrl}
                onClick={() => window.open(google.planilhaUrl, '_blank', 'noopener,noreferrer')}>
                Abrir planilha
              </button>
              <button className="bt o" data-testid="google.desconectar" disabled={google.sincronizando}
                onClick={() => void desconectar()}>
                Desconectar Google
              </button>
            </>
          )}
        </div>
        <p className="helper">
          {google.email
            ? 'A planilha Google é o armazenamento permanente. O app usa dados temporários apenas durante esta sessão.'
            : 'Entre com uma conta Google para acessar e sincronizar seus dados.'}
        </p>
      </section>
    </div>
  )
}
