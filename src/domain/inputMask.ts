export type NumericMask = 'dinheiro' | 'percentual' | 'quantidade' | 'inteiro'

const CASAS_DECIMAIS: Record<NumericMask, number> = {
  dinheiro: 2,
  percentual: 2,
  quantidade: 4,
  inteiro: 0,
}

export function normalizarNumeroDigitado(value: string, mask: NumericMask): string {
  const limpo = value.replace(/[^\d,.-]/g, '')
  const negativo = limpo.startsWith('-')
  const semSinal = limpo.replace(/-/g, '')
  const ultimaVirgula = semSinal.lastIndexOf(',')
  const ultimoPonto = semSinal.lastIndexOf('.')
  if (ultimaVirgula < 0 && /^\d{1,3}(?:\.\d{3})+$/.test(semSinal)) {
    return `${negativo ? '-' : ''}${semSinal.replace(/\./g, '')}`
  }
  const separadorDecimal = Math.max(ultimaVirgula, ultimoPonto)
  const inteiroBruto = separadorDecimal < 0 ? semSinal : semSinal.slice(0, separadorDecimal)
  const fracaoBruta = separadorDecimal < 0 ? '' : semSinal.slice(separadorDecimal + 1)
  const inteiro = inteiroBruto.replace(/[,.]/g, '')
  const fracao = fracaoBruta.replace(/[,.]/g, '').slice(0, CASAS_DECIMAIS[mask])
  const sinal = negativo ? '-' : ''

  if (separadorDecimal < 0 || mask === 'inteiro') return `${sinal}${inteiro}`
  return `${sinal}${inteiro || '0'}.${fracao}`
}

export function filtrarEntradaNumerica(value: string, options: { negativo?: boolean; decimal?: boolean } = {}): string {
  const { negativo = false, decimal = true } = options
  let result = ''
  let separadorUsado = false
  for (const caractere of value) {
    if (/\d/.test(caractere)) {
      result += caractere
    } else if (negativo && caractere === '-' && result === '' && !result.startsWith('-')) {
      result = '-'
    } else if (decimal && (caractere === ',' || caractere === '.') && !separadorUsado) {
      result += '.'
      separadorUsado = true
    }
  }
  return result
}

export function filtrarNumeroSemMascara(value: string, decimal = true, maxDigitos = 10): string {
  let result = ''
  let digitos = 0
  let separadorUsado = false
  for (const caractere of value) {
    if (/\d/.test(caractere) && digitos < maxDigitos) {
      result += caractere
      digitos++
    } else if (decimal && digitos < maxDigitos && (caractere === ',' || caractere === '.') && !separadorUsado) {
      result += '.'
      separadorUsado = true
    }
  }
  return result
}

export function limitarDigitos(value: string, maxDigitos: number): string {
  let digitos = 0
  return [...value].filter((caractere) => {
    if (!/\d/.test(caractere)) return true
    if (digitos >= maxDigitos) return false
    digitos++
    return true
  }).join('')
}

/** Converte a sequência de teclas de um campo monetário em reais.
 * Assim, ao digitar 1, 2 e 3 o campo mostra R$ 0,01, R$ 0,12 e R$ 1,23.
 */
export function normalizarDinheiroInterativo(value: string): string {
  const digitos = (value.match(/\d/g) ?? []).join('').replace(/^0+(?=\d)/, '')
  if (!digitos) return ''
  const centavos = digitos.padStart(3, '0')
  const inteiro = centavos.slice(0, -2)
  const fracao = centavos.slice(-2)
  return `${inteiro}.${fracao}`
}

export function formatarNumeroMascarado(value: string, mask: NumericMask, focado: boolean): string {
  if (!value || value === '-') return value

  const normalizado = normalizarNumeroDigitado(value, mask)
  const negativo = normalizado.startsWith('-')
  const unsigned = negativo ? normalizado.slice(1) : normalizado
  const [inteiroBruto = '0', fracaoBruta] = unsigned.split('.')
  const inteiro = (Number(inteiroBruto || '0')).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  let numero = `${negativo ? '-' : ''}${inteiro}`

  if (fracaoBruta !== undefined && fracaoBruta !== '') {
    const fracao = mask === 'dinheiro' ? fracaoBruta.padEnd(2, '0') : fracaoBruta
    numero += `,${fracao}`
  } else if (focado && value.endsWith('.')) {
    numero += ','
  } else if (mask === 'dinheiro' && !focado) {
    numero += ',00'
  }

  if (mask === 'dinheiro') return `R$\u00a0${numero}`
  if (mask === 'percentual') return `${numero}%`
  return numero
}
