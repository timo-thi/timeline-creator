import { type CSSProperties, type PointerEvent, type RefObject } from 'react'
import type { EventLayout, TimelineDocument, TimelineEvent, TimelineLayout } from '../types'
import { renderMarkdown } from '../utils/markdown'
import {
  buildDependencyPath,
  formatAxisDate,
  getEventDateLabels,
} from '../utils/timeline'

interface StagePreviewProps {
  documentState: TimelineDocument
  selectedEvent?: TimelineEvent
  layout: TimelineLayout
  message: string
  svgRef: RefObject<SVGSVGElement | null>
  exportSurfaceRef: RefObject<HTMLDivElement | null>
  eventLookup: Map<string, EventLayout>
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void
  onCanvasPointerDown: (event: PointerEvent<SVGSVGElement>) => void
  onPointerDown: (layoutEvent: EventLayout, event: PointerEvent<SVGGElement>) => void
  onOpenDrawerFor: (eventId: string) => void
}

function StagePreview({
  documentState,
  selectedEvent,
  layout,
  message,
  svgRef,
  exportSurfaceRef,
  eventLookup,
  onPointerMove,
  onPointerUp,
  onCanvasPointerDown,
  onPointerDown,
  onOpenDrawerFor,
}: StagePreviewProps) {
  return (
    <main className="stage">
      <header className="stage-header">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{documentState.settings.title}</h2>
          <p className="status">
            {formatAxisDate(
              new Date(documentState.settings.startDate).getTime(),
              documentState.settings.majorTickUnit,
            )}{' '}
            to{' '}
            {formatAxisDate(
              new Date(documentState.settings.endDate).getTime(),
              documentState.settings.majorTickUnit,
            )}
          </p>
        </div>
        <p className="status">{message}</p>
      </header>

      <div className="canvas-frame compact-frame">
        <div
          ref={exportSurfaceRef}
          className="export-surface"
          style={{ width: `${layout.width}px`, height: `${layout.height}px` }}
        >
          <svg
            ref={svgRef}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="timeline-svg"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={documentState.settings.theme.accent} />
            </marker>
            <marker
              id="timeline-arrowhead"
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={documentState.settings.theme.axis} />
            </marker>
          </defs>

          {documentState.settings.showBackground ? (
            <rect
              data-export-background="true"
              x="0"
              y="0"
              width={layout.width}
              height={layout.height}
              fill={documentState.settings.theme.background}
              rx="28"
              ry="28"
            />
          ) : null}

          {documentState.settings.showGrid
            ? layout.secondaryTicks.map((tick) =>
                documentState.settings.direction === 'horizontal' ? (
                  <line
                    key={tick.id}
                    x1={tick.x}
                    y1={tick.y - 6}
                    x2={tick.x}
                    y2={tick.y + 6}
                    stroke={documentState.settings.theme.grid}
                    strokeWidth="1"
                    opacity="0.75"
                  />
                ) : (
                  <line
                    key={tick.id}
                    x1={tick.x - 6}
                    y1={tick.y}
                    x2={tick.x + 6}
                    y2={tick.y}
                    stroke={documentState.settings.theme.grid}
                    strokeWidth="1"
                    opacity="0.75"
                  />
                ),
              )
            : null}

          {documentState.settings.showGrid
            ? layout.ticks.map((tick) => (
                <g key={tick.id}>
                  {documentState.settings.direction === 'horizontal' ? (
                    <>
                      <line
                        x1={tick.x}
                        y1={tick.y - 12}
                        x2={tick.x}
                        y2={tick.y + 12}
                        stroke={documentState.settings.theme.grid}
                        strokeWidth="1.5"
                      />
                      <text
                        x={tick.x}
                        y={tick.y - 22}
                        textAnchor="middle"
                        fill={documentState.settings.theme.inkMuted}
                        fontSize="12"
                      >
                        {tick.label}
                      </text>
                    </>
                  ) : (
                    <>
                      <line
                        x1={tick.x - 12}
                        y1={tick.y}
                        x2={tick.x + 12}
                        y2={tick.y}
                        stroke={documentState.settings.theme.grid}
                        strokeWidth="1.5"
                      />
                      <text
                        x={tick.x - 20}
                        y={tick.y + 4}
                        textAnchor="end"
                        fill={documentState.settings.theme.inkMuted}
                        fontSize="12"
                      >
                        {tick.label}
                      </text>
                    </>
                  )}
                </g>
              ))
            : null}

          {layout.segments.map((segment) => (
            <g key={segment.index}>
              <line
                x1={segment.axisStartX}
                y1={segment.axisStartY}
                x2={segment.axisEndX}
                y2={segment.axisEndY}
                stroke={documentState.settings.theme.axis}
                strokeWidth="3"
                strokeLinecap="round"
                markerEnd="url(#timeline-arrowhead)"
              />
              <circle
                cx={segment.axisStartX}
                cy={segment.axisStartY}
                r="5"
                fill={documentState.settings.theme.axis}
              />
              <circle
                cx={segment.axisEndX}
                cy={segment.axisEndY}
                r="5"
                fill={documentState.settings.theme.axis}
              />
            </g>
          ))}

          {layout.ranges.map((range) => {
            const event = documentState.events.find((candidate) => candidate.id === range.eventId)
            const accent = event?.style.accentColor ?? documentState.settings.theme.accent

            return (
              <line
                key={`${range.eventId}-${range.segmentIndex}`}
                x1={range.startX}
                y1={range.startY}
                x2={range.endX}
                y2={range.endY}
                stroke={accent}
                strokeWidth="9"
                strokeLinecap="round"
                opacity="0.65"
              />
            )
          })}

          {layout.events.map((eventLayout) => {
            const accent =
              eventLayout.event.style.accentColor ?? documentState.settings.theme.accent
            const connectorStartX =
              documentState.settings.direction === 'horizontal'
                ? eventLayout.pointX
                : eventLayout.side === 'left'
                  ? eventLayout.anchorX + eventLayout.cardWidth
                  : eventLayout.anchorX
            const connectorStartY =
              documentState.settings.direction === 'horizontal'
                ? eventLayout.side === 'above'
                  ? eventLayout.anchorY + eventLayout.cardHeight
                  : eventLayout.anchorY
                : eventLayout.pointY

            return (
              <g key={`connector-${eventLayout.event.id}`}>
                <line
                  x1={connectorStartX}
                  y1={connectorStartY}
                  x2={eventLayout.pointX}
                  y2={eventLayout.pointY}
                  stroke={accent}
                  strokeWidth="1.5"
                />
                <circle cx={eventLayout.pointX} cy={eventLayout.pointY} r="4.5" fill={accent} />
              </g>
            )
          })}

          {layout.events.flatMap((eventLayout) =>
            eventLayout.event.causes
              .map((causeId) => {
                const cause = eventLookup.get(causeId)
                if (!cause) {
                  return null
                }

                return (
                  <path
                    key={`${causeId}-${eventLayout.event.id}`}
                    d={buildDependencyPath(cause, eventLayout, layout.events)}
                    fill="none"
                    stroke={documentState.settings.theme.accent}
                    strokeWidth="2"
                    strokeDasharray="8 6"
                    strokeLinejoin="round"
                    markerEnd="url(#arrowhead)"
                    opacity="0.9"
                  />
                )
              })
              .filter(Boolean),
          )}

          {layout.events.map((eventLayout) => {
            const hasDescription = eventLayout.event.description.trim().length > 0
            const cardTheme = {
              accent: eventLayout.event.style.accentColor ?? documentState.settings.theme.accent,
              surface: eventLayout.event.style.surfaceColor ?? documentState.settings.theme.surface,
              strip:
                eventLayout.event.style.surfaceColor ?? documentState.settings.theme.surfaceMuted,
              text: eventLayout.event.style.textColor ?? documentState.settings.theme.ink,
              muted: documentState.settings.theme.inkMuted,
              border:
                eventLayout.event.style.borderColor ?? documentState.settings.theme.surfaceMuted,
            }

            return (
              <g
                key={eventLayout.event.id}
                className={
                  eventLayout.event.id === selectedEvent?.id ? 'timeline-card active' : 'timeline-card'
                }
                onPointerDown={(event) => onPointerDown(eventLayout, event)}
                onDoubleClick={() => onOpenDrawerFor(eventLayout.event.id)}
              >
                <rect
                  x={eventLayout.anchorX}
                  y={eventLayout.anchorY}
                  width={eventLayout.cardWidth}
                  height={eventLayout.cardHeight}
                  rx="18"
                  fill={cardTheme.surface}
                  stroke={eventLayout.event.id === selectedEvent?.id ? cardTheme.accent : cardTheme.border}
                  strokeWidth={eventLayout.event.id === selectedEvent?.id ? '2.5' : '1.5'}
                  data-export-stroke={cardTheme.border}
                  data-export-stroke-width="1.5"
                  filter="drop-shadow(0 18px 30px rgba(37, 28, 18, 0.12))"
                />
                <rect
                  x={eventLayout.anchorX}
                  y={eventLayout.anchorY}
                  width={eventLayout.cardWidth}
                  height={eventLayout.headerHeight}
                  rx="18"
                  fill={cardTheme.strip}
                  opacity="0.9"
                />
                <foreignObject
                  x={eventLayout.anchorX + 14}
                  y={eventLayout.anchorY}
                  width={eventLayout.cardWidth - 28}
                  height={eventLayout.headerHeight}
                >
                  <div className="card-date">
                    {getEventDateLabels(eventLayout.event).map((date, index) => (
                      <div key={date.label ?? index}>
                        {date.label ? <strong>{date.label}:</strong> : null} {date.value}
                      </div>
                    ))}
                  </div>
                </foreignObject>
                <foreignObject
                  x={eventLayout.anchorX + 14}
                  y={eventLayout.anchorY + eventLayout.headerHeight + 10}
                  width={eventLayout.cardWidth - 28}
                  height={eventLayout.cardHeight - eventLayout.headerHeight - 16}
                >
                  <div
                    className="card-html"
                    style={
                      {
                        color: cardTheme.text,
                        '--muted': cardTheme.muted,
                        '--accent': cardTheme.accent,
                      } as CSSProperties
                    }
                  >
                    <div className={hasDescription ? 'card-title' : 'card-title last'}>
                      {eventLayout.event.title || 'Untitled event'}
                    </div>
                    {hasDescription ? (
                      <div
                        className="card-markdown"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(eventLayout.event.description),
                        }}
                      />
                    ) : null}
                  </div>
                </foreignObject>
              </g>
            )
          })}
          </svg>
        </div>
      </div>

      <section className="legend compact-legend">
        <div>
          <strong>Bounds</strong>
          <span>Events are mapped inside the explicit start and end timestamps.</span>
        </div>
        <div>
          <strong>Ticks</strong>
          <span>Major labels follow the selected unit: hour, day, week, or month.</span>
        </div>
        <div>
          <strong>Edit</strong>
          <span>Open an event from the list or double-click a card to edit it in the drawer.</span>
        </div>
      </section>
    </main>
  )
}

export default StagePreview
