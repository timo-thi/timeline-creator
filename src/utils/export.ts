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

  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(svgBlob)

  try {
    const image = await loadImage(objectUrl)
    const width = Number(svg.getAttribute('width')) || svg.viewBox.baseVal.width
    const height = Number(svg.getAttribute('height')) || svg.viewBox.baseVal.height
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width)
    canvas.height = Math.ceil(height)
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Canvas export is not available in this browser.')
    }

    if (format === 'jpg' || includeBackground) {
      context.fillStyle = includeBackground ? backgroundColor : '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mimeType, format === 'jpg' ? 0.94 : undefined),
    )

    if (!blob) {
      throw new Error('Canvas export failed to produce an image.')
    }

    downloadBlob(`${filename}.${format}`, blob)
  } finally {
    URL.revokeObjectURL(objectUrl)
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
