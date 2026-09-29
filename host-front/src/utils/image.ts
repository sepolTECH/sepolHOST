/** Preparação da foto do documento antes do envio. */

export const DOCUMENT_FILE_MAX = 5 * 1024 * 1024 // 5 MB (mesmo limite do back)
export const DOCUMENT_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ACCEPTED = DOCUMENT_FILE_ACCEPT.split(',')

const MAX_SIDE = 2000 // px — suficiente para ler um documento
const COMPRESS_ABOVE = 1.5 * 1024 * 1024

/**
 * Valida o arquivo e, se for uma foto grande (ex.: tirada pelo celular),
 * reduz para no máximo 2000px em JPEG. PDFs são enviados como estão.
 */
export async function prepareDocumentFile(file: File): Promise<File> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error('Formato não aceito. Envie JPG, PNG, WEBP ou PDF.')
  }
  if (file.type === 'application/pdf') {
    if (file.size > DOCUMENT_FILE_MAX) throw new Error('O PDF deve ter no máximo 5 MB.')
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Não foi possível ler a imagem.')
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= COMPRESS_ABOVE) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // PNG transparente vira fundo branco no JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Não foi possível processar a imagem.')
  if (blob.size > DOCUMENT_FILE_MAX) throw new Error('A imagem deve ter no máximo 5 MB.')
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}
