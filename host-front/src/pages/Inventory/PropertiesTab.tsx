import { Building2, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  inventoryApi,
  type InventoryItemInput,
  type InventoryProperty,
  type PropertyInventoryItem,
} from '../../services/api'
import { formatMoney } from '../../utils/money'
import { ItemsEditor } from './ItemsEditor'

/**
 * Aba "Itens do imóvel": cadastro do inventário que é copiado para cada nova reserva.
 * Os imóveis vêm do cadastro em Ajustes › Imóveis.
 */
export function PropertiesTab() {
  const navigate = useNavigate()
  const [properties, setProperties] = useState<InventoryProperty[] | null>(null)
  const [selected, setSelected] = useState('')
  const [loadError, setLoadError] = useState('')

  const [items, setItems] = useState<PropertyInventoryItem[]>([])
  const [totalCents, setTotalCents] = useState(0)
  const [itemsKey, setItemsKey] = useState('')

  const applyProperties = useCallback((data: InventoryProperty[]) => {
    setProperties(data)
    setLoadError('')
    // Seleciona o primeiro imóvel na primeira carga
    setSelected((cur) => cur || (data.find((p) => p.itemsCount > 0) ?? data[0])?.name || '')
  }, [])

  const loadProperties = useCallback(async () => {
    try {
      applyProperties((await inventoryApi.properties()).data)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar imóveis')
    }
  }, [applyProperties])

  useEffect(() => {
    let cancelled = false
    inventoryApi
      .properties()
      .then(({ data }) => !cancelled && applyProperties(data))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Erro ao carregar imóveis'))
    return () => {
      cancelled = true
    }
  }, [applyProperties])

  const loadItems = useCallback(async (property: string) => {
    const data = await inventoryApi.items(property)
    setItems(data.items)
    setTotalCents(data.totalCents)
    setItemsKey(property)
  }, [])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    inventoryApi
      .items(selected)
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setTotalCents(data.totalCents)
        setItemsKey(selected)
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Erro ao carregar itens'))
    return () => {
      cancelled = true
    }
  }, [selected])

  async function refresh() {
    await Promise.all([loadItems(selected), loadProperties()])
  }

  const add = async (draft: InventoryItemInput) => {
    await inventoryApi.addItem(selected, draft)
    await refresh()
  }
  const update = async (id: string, draft: InventoryItemInput) => {
    await inventoryApi.updateItem(id, draft)
    await refresh()
  }
  const remove = async (id: string) => {
    await inventoryApi.removeItem(id)
    await refresh()
  }

  const ready = itemsKey === selected
  const unitCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const options = properties ?? []
  const current = options.find((p) => p.name === selected)

  return (
    <>
      <div className="inv-toolbar">
        <div className="ui-field inv-toolbar__select">
          <label htmlFor="inv-property">Imóvel</label>
          <select
            id="inv-property"
            className="ui-input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!options.length}
          >
            {!options.length && <option value="">Nenhum imóvel cadastrado</option>}
            {options.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {p.itemsCount} {p.itemsCount === 1 ? 'item' : 'itens'}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => navigate('/ajustes/imoveis')}>
          <Plus aria-hidden />
          Gerenciar imóveis
        </button>
      </div>

      {loadError && <p className="ui-field__error">{loadError}</p>}

      {properties && !options.length ? (
        <section className="panel">
          <div className="panel__state">
            <span className="panel__state-icon">
              <Building2 strokeWidth={1.6} />
            </span>
            <p>Nenhum imóvel cadastrado ainda. Cadastre seus imóveis em Ajustes › Imóveis para montar o inventário de cada um.</p>
          </div>
        </section>
      ) : (
        selected && (
          <>
            <div className="kpis inv-kpis">
              <div className="kpi">
                <span>Itens cadastrados</span>
                <strong>{ready ? items.length : '—'}</strong>
              </div>
              <div className="kpi">
                <span>Unidades no total</span>
                <strong>{ready ? unitCount : '—'}</strong>
              </div>
              <div className="kpi kpi--dark">
                <span>Valor total do inventário</span>
                <strong>{ready ? formatMoney(totalCents) : '—'}</strong>
              </div>
            </div>

            <section className="panel inv-panel">
              <p className="ui-field__hint inv-panel__hint">
                Toda nova reserva de <strong>{current?.name ?? selected}</strong> recebe uma cópia desta lista para a
                vistoria do check-out. Mudanças aqui não alteram reservas que já foram criadas.
              </p>
              <ItemsEditor
                items={ready ? items : []}
                emptyText={ready ? 'Nenhum item cadastrado neste imóvel ainda. Use o formulário acima.' : 'Carregando…'}
                onAdd={add}
                onUpdate={update}
                onRemove={remove}
              />
            </section>
          </>
        )
      )}
    </>
  )
}
