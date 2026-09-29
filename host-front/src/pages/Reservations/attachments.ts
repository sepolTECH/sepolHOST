import { reservationsApi, type ReservationAttachment } from '../../services/api'

/** Abre um anexo protegido em nova aba (baixa com o cookie de sessão). */
export async function openAttachment(reservationId: string, attachment: ReservationAttachment) {
  // abre a aba já no clique (senão o navegador bloqueia o pop-up após o download)
  const win = window.open('', '_blank')
  try {
    const blob = await reservationsApi.getAttachment(reservationId, attachment.id)
    const url = URL.createObjectURL(blob)
    if (win) win.location.href = url
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.fileName
      a.click()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    win?.close()
    window.alert(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo')
  }
}
