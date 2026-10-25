export function capitalizarNome(texto: string): string {
  const palavras = texto.trim().toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
  return palavras.map((palavra, index) => index === 0
    ? palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1)
    : palavra).join(' ')
}

export function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 11)
  if (digitos.length <= 2) return digitos ? `(${digitos}` : ''
  const ddd = digitos.slice(0, 2)
  const numero = digitos.slice(2)
  return numero.length > 8
    ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
    : `(${ddd}) ${numero.slice(0, 4)}${numero.length > 4 ? `-${numero.slice(4)}` : ''}`
}
