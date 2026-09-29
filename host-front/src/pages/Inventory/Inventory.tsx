import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Segmented } from '../../components/ui/Segmented'
import '../Guests/Guests.css'
import '../Reservations/Reservations.css'
import { InspectionsTab } from './InspectionsTab'
import './Inventory.css'
import { PropertiesTab } from './PropertiesTab'

type Tab = 'vistorias' | 'imoveis'

export function Inventory() {
  // A aba fica na URL (?aba=imoveis) para sobreviver a recarregar a página
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'imoveis' ? 'imoveis' : 'vistorias'

  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>(undefined)
  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  return (
    <div className="guests">
      <header className="page-header">
        <div>
          <p className="page-header__crumb">Controle interno</p>
          <h1 className="page-header__title">Inventário</h1>
          <p className="page-header__subtitle">
            Cadastre os itens de cada imóvel e confira tudo na vistoria após o check-out do hóspede.
          </p>
        </div>
      </header>

      <div className="inv-tabs">
        <Segmented<Tab>
          ariaLabel="Seção do inventário"
          value={tab}
          onChange={(v) => setParams(v === 'imoveis' ? { aba: 'imoveis' } : {}, { replace: true })}
          options={[
            { value: 'vistorias', label: 'Vistorias' },
            { value: 'imoveis', label: 'Itens do imóvel' },
          ]}
        />
      </div>

      {tab === 'vistorias' ? <InspectionsTab onNotify={showToast} /> : <PropertiesTab />}

      <div className={`toast ${toast ? 'is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  )
}
