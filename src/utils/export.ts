import { toBlob as nodeToBlob } from 'html-to-image'

export type ExportImageFormat = 'png' | 'jpg' | 'svg'

/**
 * Downloads the current document as a YAML file for later editing/import.
 */
export function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  downloadBlob(filename, blob)
}

/**
 * Serializes the live SVG to a standalone string, optionally forcing transparency.
 */
export function serializeSvg(svg: SVGSVGElement, includeBackground: boolean) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml')

  const backgroundNode = clone.querySelector('[data-export-background="true"]')
  if (backgroundNode && !includeBackground) {
    backgroundNode.remove()
  }

  return new XMLSerializer().serializeToString(clone)
}

/**
 * Exports the current SVG as SVG, PNG, or JPG without involving a server round trip.
 */
export async function exportSvgElement(
  svg: SVGSVGElement,
  exportNode: HTMLElement | null,
  format: ExportImageFormat,
  filename: string,
  includeBackground: boolean,
  backgroundColor: string,
) {
  const serialized = serializeSvg(svg, includeBackground)

  if (format === 'svg') {
    downloadTextFile(`${filename}.svg`, serialized, 'image/svg+xml;charset=utf-8')
    return
  }

  const blob = await exportRasterFromNode(
    exportNode ?? svg,
    format,
    includeBackground,
    backgroundColor,
  )
  downloadBlob(`${filename}.${format}`, blob)
}

async function exportRasterFromNode(
  node: HTMLElement | SVGSVGElement,
  format: 'png' | 'jpg',
  includeBackground: boolean,
  backgroundColor: string,
) {
  const target = ensureHtmlExportTarget(node, includeBackground, backgroundColor)
  const width = Math.ceil(target.clientWidth || target.scrollWidth)
  const height = Math.ceil(target.clientHeight || target.scrollHeight)

  try {
    const blob = await nodeToBlob(target, {
      cacheBust: true,
      pixelRatio: 2,
      canvasWidth: Math.ceil(width) * 2,
      canvasHeight: Math.ceil(height) * 2,
      backgroundColor: format === 'jpg' ? backgroundColor : includeBackground ? backgroundColor : undefined,
      filter: (currentNode) => {
        if (!includeBackground && currentNode instanceof Element) {
          return !currentNode.matches('[data-export-background="true"]')
        }

        return true
      },
    })

    if (!blob) {
      throw new Error(`Failed to create ${format.toUpperCase()} export.`)
    }

    if (format === 'jpg' && blob.type !== 'image/jpeg') {
      return convertBlobFormat(blob, Math.ceil(width), Math.ceil(height), 'image/jpeg')
    }

    return blob
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Failed to create ${format.toUpperCase()} export.`,
      { cause: error },
    )
  } finally {
    if (target.dataset.temporaryExportTarget === 'true') {
      target.remove()
    }
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load exported SVG for raster conversion.'))
    image.src = url
  })
}

async function convertBlobFormat(blob: Blob, width: number, height: number, mimeType: string) {
  const url = URL.createObjectURL(blob)

  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas export is not available in this browser.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const converted = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, 0.94),
    )

    if (!converted) {
      throw new Error('Canvas export failed to produce an image.')
    }

    return converted
  } finally {
    URL.revokeObjectURL(url)
  }
}

function ensureHtmlExportTarget(
  node: HTMLElement | SVGSVGElement,
  includeBackground: boolean,
  backgroundColor: string,
) {
  if (node instanceof HTMLElement) {
    return node
  }

  const width = Number(node.getAttribute('width')) || node.viewBox.baseVal.width
  const height = Number(node.getAttribute('height')) || node.viewBox.baseVal.height
  const wrapper = document.createElement('div')
  wrapper.dataset.temporaryExportTarget = 'true'
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-100000px'
  wrapper.style.top = '0'
  wrapper.style.width = `${Math.ceil(width)}px`
  wrapper.style.height = `${Math.ceil(height)}px`
  wrapper.style.background = includeBackground ? backgroundColor : 'transparent'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.lineHeight = '0'
  wrapper.appendChild(node.cloneNode(true))
  document.body.appendChild(wrapper)
  return wrapper
}
