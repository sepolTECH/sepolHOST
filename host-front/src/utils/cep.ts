/** Consulta de CEP na ViaCEP (gratuita, sem chave). */
export interface CepResult {
  street: string
  district: string
  city: string
  state: string
}

export async function lookupCep(cep: string, signal?: AbortSignal): Promise<CepResult | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal })
  if (!res.ok) throw new Error('Falha ao consultar o CEP')
  const data = await res.json()
  if (data.erro) return null
  return {
    street: data.logradouro ?? '',
    district: data.bairro ?? '',
    city: data.localidade ?? '',
    state: data.uf ?? '',
  }
}
