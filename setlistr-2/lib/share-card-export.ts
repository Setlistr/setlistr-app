// Turns a share card on screen into the image that's shared, using the
// browser's own layout (html-to-image), so the export matches the preview.
// html2canvas, used before, drew text lower than the browser and overprinted
// the cards' stats.
//
// Always 1080px wide: 1080×1920 for a Story, 1080×1350 for the Feed. Rendered
// twice because WebKit (iOS) can miss images and web fonts on the first pass.
// Fails loudly: no fallback renderer, and an image of the wrong size or an
// empty file is an error, never a silent bad share.
import { toBlob } from 'html-to-image'

export type ShareFormat = 'story' | 'feed'
export const SHARE_SIZE: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  feed: { width: 1080, height: 1350 },
}

export async function exportShareCard(node: HTMLElement, format: ShareFormat): Promise<Blob> {
  const target = SHARE_SIZE[format]
  const width = node.offsetWidth
  if (!width) throw new Error('The card is not on screen')
  const height = Math.round(width * target.height / target.width)
  const options = {
    width, height,
    canvasWidth: target.width, canvasHeight: target.height, pixelRatio: 1,
    // The on-screen card has rounded corners; the shared image is full-bleed.
    style: { borderRadius: '0' },
    cacheBust: true,
  }
  await toBlob(node, options)
  const blob = await toBlob(node, options)
  if (!blob || blob.size < 10_000) throw new Error('The image came out empty')
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    const ok = bitmap.width === target.width && bitmap.height === target.height
    bitmap.close()
    if (!ok) throw new Error(`The image came out at the wrong size`)
  }
  return blob
}
