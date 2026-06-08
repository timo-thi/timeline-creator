/**
 * Converts a client-space pointer position into the local SVG coordinate system.
 */
export function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse())

  return {
    x: transformed.x,
    y: transformed.y,
  }
}
