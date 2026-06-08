import { type CSSProperties, type ChangeEvent, type PointerEvent, useRef, useState } from 'react'
import { dump, load } from 'js-yaml'
import './index.css'
import { defaultTimeline } from './sampleData'
import type {
  EventLayout,
  TimelineDirection,
  TimelineDocument,
  TimelineEvent,
  TimelineTickUnit,
} from './types'
import { downloadTextFile, exportSvgElement } from './utils/export'
import { renderMarkdown } from './utils/markdown'
import {
  buildDependencyPath,
  computeTimelineLayout,
  formatAxisDate,
  formatEventDate,
} from './utils/timeline'

interface DragState {
  eventId: string
  pointerId: number
  originX: number
  originY: number
  startOffsetX: number
  startOffsetY: number
}

function App() {
  const [documentState, setDocumentState] = useState<TimelineDocument>(() =>
    normalizeDocument(defaultTimeline),
  )
  const [selectedEventId, setSelectedEventId] = useState<string>(
    defaultTimeline.events[0]?.id ?? '',
  )
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [message, setMessage] = useState<string>('Ready.')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const layout = computeTimelineLayout(documentState)
  const selectedEvent =
    documentState.events.find((event) => event.id === selectedEventId) ?? documentState.events[0]
  const eventLookup = new Map(layout.events.map((entry) => [entry.event.id, entry]))

  function patchSettings<K extends keyof TimelineDocument['settings']>(
    key: K,
    value: TimelineDocument['settings'][K],
  ) {
    setDocumentState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: value,
      },
    }))
  }

  function patchTheme<K extends keyof TimelineDocument['settings']['theme']>(
    key: K,
    value: TimelineDocument['settings']['theme'][K],
  ) {
    setDocumentState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        theme: {
          ...current.settings.theme,
          [key]: value,
        },
      },
    }))
  }

  function patchSelectedEvent(patch: Partial<TimelineEvent>) {
    if (!selectedEvent) {
      return
    }

    setDocumentState((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === selectedEvent.id
          ? {
              ...event,
              ...patch,
              style: patch.style ? { ...event.style, ...patch.style } : event.style,
              offset: patch.offset ? { ...event.offset, ...patch.offset } : event.offset,
            }
          : event,
      ),
    }))
  }

  function openDrawerFor(eventId: string) {
    setSelectedEventId(eventId)
    setIsDrawerOpen(true)
  }

  function handleAddEvent() {
    const baseDate = selectedEvent?.date ?? documentState.settings.startDate
    const newEvent = createEvent(baseDate)
    setDocumentState((current) => ({
      ...current,
      events: [...current.events, newEvent],
    }))
    setSelectedEventId(newEvent.id)
    setIsDrawerOpen(true)
    setMessage('Event added.')
  }

  function handleDuplicateEvent() {
    if (!selectedEvent) {
      return
    }

    const duplicate = {
      ...selectedEvent,
      id: crypto.randomUUID(),
      title: `${selectedEvent.title} copy`,
      causes: [...selectedEvent.causes],
      style: { ...selectedEvent.style },
      offset: { ...selectedEvent.offset },
    }

    setDocumentState((current) => ({
      ...current,
      events: [...current.events, duplicate],
    }))
    setSelectedEventId(duplicate.id)
    setIsDrawerOpen(true)
    setMessage('Event duplicated.')
  }

  function handleDeleteEvent() {
    if (!selectedEvent || documentState.events.length === 1) {
      return
    }

    setDocumentState((current) => {
      const remaining = current.events
        .filter((event) => event.id !== selectedEvent.id)
        .map((event) => ({
          ...event,
          causes: event.causes.filter((causeId) => causeId !== selectedEvent.id),
        }))

      return {
        ...current,
        events: remaining,
      }
    })

    const fallback = documentState.events.find((event) => event.id !== selectedEvent.id)
    setSelectedEventId(fallback?.id ?? '')
    setIsDrawerOpen(false)
    setMessage('Event removed.')
  }

  function resetSelectedOffset() {
    patchSelectedEvent({ offset: { x: 0, y: 0 } })
    setMessage('Selected event position reset.')
  }

  function resetAllOffsets() {
    setDocumentState((current) => ({
      ...current,
      events: current.events.map((event) => ({
        ...event,
        offset: { x: 0, y: 0 },
      })),
    }))
    setMessage('All event positions reset.')
  }

  function handleFitBoundsToEvents() {
    const timestamps = documentState.events.map((event) => new Date(event.date).getTime())
    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    const start = new Date(min - 30 * 60_000).toISOString()
    const end = new Date(Math.max(max + 30 * 60_000, min + 60 * 60_000)).toISOString()

    setDocumentState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        startDate: start,
        endDate: end,
      },
    }))
    setMessage('Timeline bounds fitted to events.')
  }

  function handleExportDocument(format: 'yaml' | 'json') {
    const filename = safeFilename(documentState.settings.title || 'timeline')
    if (format === 'yaml') {
      downloadTextFile(
        `${filename}.timeline.yaml`,
        dump(documentState, { noRefs: true, lineWidth: 120 }),
        'application/x-yaml;charset=utf-8',
      )
      setMessage('YAML exported.')
      return
    }

    downloadTextFile(
      `${filename}.timeline.json`,
      JSON.stringify(documentState, null, 2),
      'application/json;charset=utf-8',
    )
    setMessage('JSON exported.')
  }

  async function handleExportImage(format: 'png' | 'jpg' | 'svg', includeBackground: boolean) {
    if (!svgRef.current) {
      return
    }

    try {
      const filename = safeFilename(documentState.settings.title || 'timeline')
      await exportSvgElement(
        svgRef.current,
        format,
        includeBackground ? filename : `${filename}-transparent`,
        includeBackground,
        documentState.settings.theme.background,
      )
      setMessage(`${format.toUpperCase()} exported.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.')
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const contents = await file.text()
      const parsed =
        file.name.endsWith('.json') || contents.trimStart().startsWith('{')
          ? JSON.parse(contents)
          : load(contents)

      const nextDocument = normalizeDocument(parsed)
      setDocumentState(nextDocument)
      setSelectedEventId(nextDocument.events[0]?.id ?? '')
      setIsDrawerOpen(false)
      setMessage(`Imported ${file.name}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed.')
    } finally {
      event.target.value = ''
    }
  }

  function handlePointerDown(layoutEvent: EventLayout, event: PointerEvent<SVGGElement>) {
    const svg = svgRef.current
    if (!svg) {
      return
    }

    event.stopPropagation()
    const point = toSvgPoint(svg, event.clientX, event.clientY)
    setSelectedEventId(layoutEvent.event.id)
    setDragState({
      eventId: layoutEvent.event.id,
      pointerId: event.pointerId,
      originX: point.x,
      originY: point.y,
      startOffsetX: layoutEvent.event.offset.x,
      startOffsetY: layoutEvent.event.offset.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || !dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const point = toSvgPoint(svg, event.clientX, event.clientY)
    const deltaX = point.x - dragState.originX
    const deltaY = point.y - dragState.originY

    setDocumentState((current) => ({
      ...current,
      events: current.events.map((timelineEvent) =>
        timelineEvent.id === dragState.eventId
          ? {
              ...timelineEvent,
              offset: {
                x: Math.round(dragState.startOffsetX + deltaX),
                y: Math.round(dragState.startOffsetY + deltaY),
              },
            }
          : timelineEvent,
      ),
    }))
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    setDragState(null)
    setMessage('Event moved. Use reset to restore automatic placement.')
  }

  return (
    <>
      <div className="app-shell compact-shell">
        <aside className="control-panel compact-panel">
          <div className="panel-section hero-panel">
            <div>
              <p className="eyebrow">Forensics timeline</p>
              <h1>Chain of custody builder</h1>
            </div>
            <p className="panel-copy">
              Explicit bounds, wrapped segments, major date ticks, dependency arrows, and direct
              export from the browser.
            </p>
            <div className="toolbar">
              <button type="button" onClick={handleAddEvent}>
                Add event
              </button>
              <button type="button" onClick={handleDuplicateEvent} disabled={!selectedEvent}>
                Duplicate
              </button>
              <button
                type="button"
                className="danger"
                onClick={handleDeleteEvent}
                disabled={!selectedEvent || documentState.events.length === 1}
              >
                Delete
              </button>
            </div>
          </div>

          <div className="panel-section">
            <div className="split-header">
              <h2>Timeline</h2>
              <button type="button" className="ghost" onClick={handleFitBoundsToEvents}>
                Fit to events
              </button>
            </div>
            <div className="compact-grid">
              <label>
                <span>Title</span>
                <input
                  value={documentState.settings.title}
                  onChange={(event) => patchSettings('title', event.target.value)}
                />
              </label>
              <label>
                <span>Direction</span>
                <select
                  value={documentState.settings.direction}
                  onChange={(event) =>
                    patchSettings('direction', event.target.value as TimelineDirection)
                  }
                >
                  <option value="horizontal">Left to right</option>
                  <option value="vertical">Top to bottom</option>
                </select>
              </label>
              <label>
                <span>Start date</span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(documentState.settings.startDate)}
                  onChange={(event) =>
                    patchSettings('startDate', new Date(event.target.value).toISOString())
                  }
                />
              </label>
              <label>
                <span>End date</span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(documentState.settings.endDate)}
                  onChange={(event) =>
                    patchSettings('endDate', new Date(event.target.value).toISOString())
                  }
                />
              </label>
              <label>
                <span>Main tick unit</span>
                <select
                  value={documentState.settings.majorTickUnit}
                  onChange={(event) =>
                    patchSettings('majorTickUnit', event.target.value as TimelineTickUnit)
                  }
                >
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </label>
              <label>
                <span>Default card width</span>
                <input
                  type="number"
                  min="180"
                  max="420"
                  value={documentState.settings.cardWidth}
                  onChange={(event) => patchSettings('cardWidth', Number(event.target.value))}
                />
              </label>
              <label>
                <span>Timeline length</span>
                <input
                  type="number"
                  min="600"
                  step="100"
                  value={documentState.settings.timelineLength}
                  onChange={(event) => patchSettings('timelineLength', Number(event.target.value))}
                />
              </label>
              <label>
                <span>Wrap segment length</span>
                <input
                  type="number"
                  min="240"
                  step="50"
                  value={documentState.settings.segmentLength}
                  onChange={(event) => patchSettings('segmentLength', Number(event.target.value))}
                />
              </label>
            </div>
            <div className="toggle-row">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={documentState.settings.showBackground}
                  onChange={(event) => patchSettings('showBackground', event.target.checked)}
                />
                <span>Canvas background</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={documentState.settings.showGrid}
                  onChange={(event) => patchSettings('showGrid', event.target.checked)}
                />
                <span>Grid and major ticks</span>
              </label>
            </div>
          </div>

          <div className="panel-section">
            <h2>Theme</h2>
            <div className="color-row">
              {(
                [
                  ['background', 'Background'],
                  ['surface', 'Card'],
                  ['surfaceMuted', 'Strip'],
                  ['ink', 'Text'],
                  ['inkMuted', 'Muted'],
                  ['axis', 'Axis'],
                  ['grid', 'Grid'],
                  ['accent', 'Accent'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="color"
                    value={documentState.settings.theme[key]}
                    onChange={(event) => patchTheme(key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <div className="split-header">
              <h2>Events</h2>
              <span>{documentState.events.length}</span>
            </div>
            <div className="event-list compact-list">
              {documentState.events
                .slice()
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={event.id === selectedEvent?.id ? 'event-pill active' : 'event-pill'}
                    onClick={() => openDrawerFor(event.id)}
                  >
                    <strong>{event.title || 'Untitled event'}</strong>
                    <span>{formatEventDate(event.date)}</span>
                  </button>
                ))}
            </div>
          </div>

          <div className="panel-section">
            <h2>Import / export</h2>
            <div className="toolbar wrap">
              <button type="button" onClick={() => handleExportDocument('yaml')}>
                Export YAML
              </button>
              <button type="button" onClick={() => handleExportDocument('json')}>
                Export JSON
              </button>
              <button type="button" onClick={handleImportClick}>
                Import file
              </button>
            </div>
            <div className="toolbar wrap">
              <button type="button" onClick={() => handleExportImage('png', true)}>
                PNG
              </button>
              <button type="button" onClick={() => handleExportImage('png', false)}>
                PNG transparent
              </button>
              <button type="button" onClick={() => handleExportImage('jpg', true)}>
                JPG
              </button>
              <button type="button" onClick={() => handleExportImage('svg', true)}>
                SVG
              </button>
            </div>
            <div className="toolbar wrap">
              <button type="button" className="ghost" onClick={resetAllOffsets}>
                Reset all positions
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const nextDocument = normalizeDocument(defaultTimeline)
                  setDocumentState(nextDocument)
                  setSelectedEventId(nextDocument.events[0]?.id ?? '')
                  setIsDrawerOpen(false)
                  setMessage('Sample timeline restored.')
                }}
              >
                Load sample
              </button>
            </div>
            <input
              ref={fileInputRef}
              className="hidden-input"
              type="file"
              accept=".yaml,.yml,.json,.timeline.yaml,.timeline.json"
              onChange={handleImportFile}
            />
          </div>
        </aside>

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
            <svg
              ref={svgRef}
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className="timeline-svg"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
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
                        d={buildDependencyPath(cause, eventLayout)}
                        fill="none"
                        stroke={documentState.settings.theme.accent}
                        strokeWidth="2"
                        strokeDasharray="8 6"
                        markerEnd="url(#arrowhead)"
                        opacity="0.9"
                      />
                    )
                  })
                  .filter(Boolean),
              )}

              {layout.events.map((eventLayout) => {
                const cardTheme = {
                  accent: eventLayout.event.style.accentColor ?? documentState.settings.theme.accent,
                  surface:
                    eventLayout.event.style.surfaceColor ?? documentState.settings.theme.surface,
                  strip:
                    eventLayout.event.style.surfaceColor ??
                    documentState.settings.theme.surfaceMuted,
                  text: eventLayout.event.style.textColor ?? documentState.settings.theme.ink,
                  muted: documentState.settings.theme.inkMuted,
                  border:
                    eventLayout.event.style.borderColor ??
                    documentState.settings.theme.surfaceMuted,
                }
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
                  <g
                    key={eventLayout.event.id}
                    className={
                      eventLayout.event.id === selectedEvent?.id ? 'timeline-card active' : 'timeline-card'
                    }
                    onPointerDown={(event) => handlePointerDown(eventLayout, event)}
                    onDoubleClick={() => openDrawerFor(eventLayout.event.id)}
                  >
                    <line
                      x1={connectorStartX}
                      y1={connectorStartY}
                      x2={eventLayout.pointX}
                      y2={eventLayout.pointY}
                      stroke={cardTheme.accent}
                      strokeWidth="1.5"
                    />
                    <circle cx={eventLayout.pointX} cy={eventLayout.pointY} r="4.5" fill={cardTheme.accent} />
                    <rect
                      x={eventLayout.anchorX}
                      y={eventLayout.anchorY}
                      width={eventLayout.cardWidth}
                      height={eventLayout.cardHeight}
                      rx="18"
                      fill={cardTheme.surface}
                      stroke={
                        eventLayout.event.id === selectedEvent?.id ? cardTheme.accent : cardTheme.border
                      }
                      strokeWidth={eventLayout.event.id === selectedEvent?.id ? '2.5' : '1.5'}
                      filter="drop-shadow(0 18px 30px rgba(37, 28, 18, 0.12))"
                    />
                    <rect
                      x={eventLayout.anchorX}
                      y={eventLayout.anchorY}
                      width={eventLayout.cardWidth}
                      height="28"
                      rx="18"
                      fill={cardTheme.strip}
                      opacity="0.9"
                    />
                    <foreignObject
                      x={eventLayout.anchorX + 14}
                      y={eventLayout.anchorY + 16}
                      width={eventLayout.cardWidth - 28}
                      height={eventLayout.cardHeight - 24}
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
                        <div className="card-date">{formatEventDate(eventLayout.event.date)}</div>
                        <div className="card-title">{eventLayout.event.title || 'Untitled event'}</div>
                        <div
                          className="card-markdown"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(eventLayout.event.description),
                          }}
                        />
                      </div>
                    </foreignObject>
                  </g>
                )
              })}
            </svg>
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
      </div>

      {selectedEvent && isDrawerOpen ? (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <aside className="event-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Event editor</p>
                <h2>{selectedEvent.title || 'Untitled event'}</h2>
              </div>
              <div className="toolbar">
                <button type="button" className="ghost" onClick={resetSelectedOffset}>
                  Reset position
                </button>
                <button type="button" onClick={() => setIsDrawerOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="drawer-content">
              <label>
                <span>Title</span>
                <input
                  value={selectedEvent.title}
                  onChange={(event) => patchSelectedEvent({ title: event.target.value })}
                />
              </label>
              <label>
                <span>Date</span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocalValue(selectedEvent.date)}
                  onChange={(event) =>
                    patchSelectedEvent({ date: new Date(event.target.value).toISOString() })
                  }
                />
              </label>
              <label>
                <span>Description (Markdown)</span>
                <textarea
                  rows={10}
                  value={selectedEvent.description}
                  onChange={(event) => patchSelectedEvent({ description: event.target.value })}
                />
              </label>
              <div className="preview-block">
                <span>Markdown preview</span>
                <div
                  className="markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedEvent.description) }}
                />
              </div>
              <div className="compact-grid">
                <label>
                  <span>Side</span>
                  <select
                    value={selectedEvent.style.side ?? 'auto'}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          side: event.target.value as TimelineEvent['style']['side'],
                        },
                      })
                    }
                  >
                    <option value="auto">Automatic</option>
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label>
                  <span>Card width</span>
                  <input
                    type="number"
                    min="180"
                    max="420"
                    value={selectedEvent.style.width ?? documentState.settings.cardWidth}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          width: Number(event.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Accent</span>
                  <input
                    type="color"
                    value={selectedEvent.style.accentColor ?? documentState.settings.theme.accent}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          accentColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Surface</span>
                  <input
                    type="color"
                    value={selectedEvent.style.surfaceColor ?? documentState.settings.theme.surface}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          surfaceColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Border</span>
                  <input
                    type="color"
                    value={selectedEvent.style.borderColor ?? '#d2b38a'}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          borderColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  <span>Text</span>
                  <input
                    type="color"
                    value={selectedEvent.style.textColor ?? documentState.settings.theme.ink}
                    onChange={(event) =>
                      patchSelectedEvent({
                        style: {
                          textColor: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>

              <div className="dependency-picker">
                <span>Caused by</span>
                <div className="dependency-list">
                  {documentState.events
                    .filter((event) => event.id !== selectedEvent.id)
                    .map((event) => (
                      <label key={event.id} className="checkbox">
                        <input
                          type="checkbox"
                          checked={selectedEvent.causes.includes(event.id)}
                          onChange={(changeEvent) => {
                            const nextCauses = changeEvent.target.checked
                              ? [...selectedEvent.causes, event.id]
                              : selectedEvent.causes.filter((causeId) => causeId !== event.id)
                            patchSelectedEvent({ causes: nextCauses })
                          }}
                        />
                        <span>{event.title}</span>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}

function createEvent(baseDate: string): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    title: 'New event',
    date: baseDate,
    description: 'Describe the evidence handling step here.',
    causes: [],
    style: {},
    offset: { x: 0, y: 0 },
  }
}

function normalizeDocument(input: unknown): TimelineDocument {
  const fallback = structuredClone(defaultTimeline)
  if (!input || typeof input !== 'object') {
    return fallback
  }

  const parsed = input as Partial<TimelineDocument>
  const settings = parsed.settings ?? fallback.settings
  const events =
    Array.isArray(parsed.events) && parsed.events.length > 0 ? parsed.events : fallback.events
  const normalizedEvents = events.map((event, index) => normalizeEvent(event, index))
  const derivedBounds = getFallbackBounds(normalizedEvents, fallback)

  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    settings: {
      title: typeof settings.title === 'string' ? settings.title : fallback.settings.title,
      direction:
        settings.direction === 'vertical' || settings.direction === 'horizontal'
          ? settings.direction
          : fallback.settings.direction,
      startDate: isValidDateString(settings.startDate)
        ? settings.startDate
        : derivedBounds.startDate,
      endDate: isValidDateString(settings.endDate) ? settings.endDate : derivedBounds.endDate,
      timelineLength:
        typeof settings.timelineLength === 'number'
          ? settings.timelineLength
          : fallback.settings.timelineLength,
      segmentLength:
        typeof settings.segmentLength === 'number'
          ? settings.segmentLength
          : fallback.settings.segmentLength,
      majorTickUnit:
        settings.majorTickUnit === 'hour' ||
        settings.majorTickUnit === 'day' ||
        settings.majorTickUnit === 'week' ||
        settings.majorTickUnit === 'month'
          ? settings.majorTickUnit
          : fallback.settings.majorTickUnit,
      cardWidth:
        typeof settings.cardWidth === 'number'
          ? settings.cardWidth
          : fallback.settings.cardWidth,
      showBackground:
        typeof settings.showBackground === 'boolean'
          ? settings.showBackground
          : fallback.settings.showBackground,
      showGrid:
        typeof settings.showGrid === 'boolean' ? settings.showGrid : fallback.settings.showGrid,
      theme: {
        background:
          typeof settings.theme?.background === 'string'
            ? settings.theme.background
            : fallback.settings.theme.background,
        surface:
          typeof settings.theme?.surface === 'string'
            ? settings.theme.surface
            : fallback.settings.theme.surface,
        surfaceMuted:
          typeof settings.theme?.surfaceMuted === 'string'
            ? settings.theme.surfaceMuted
            : fallback.settings.theme.surfaceMuted,
        ink:
          typeof settings.theme?.ink === 'string'
            ? settings.theme.ink
            : fallback.settings.theme.ink,
        inkMuted:
          typeof settings.theme?.inkMuted === 'string'
            ? settings.theme.inkMuted
            : fallback.settings.theme.inkMuted,
        axis:
          typeof settings.theme?.axis === 'string'
            ? settings.theme.axis
            : fallback.settings.theme.axis,
        grid:
          typeof settings.theme?.grid === 'string'
            ? settings.theme.grid
            : fallback.settings.theme.grid,
        accent:
          typeof settings.theme?.accent === 'string'
            ? settings.theme.accent
            : fallback.settings.theme.accent,
      },
    },
    events: normalizedEvents,
  }
}

function normalizeEvent(input: unknown, index: number): TimelineEvent {
  const fallback =
    defaultTimeline.events[index % defaultTimeline.events.length] ??
    createEvent(new Date().toISOString())
  const parsed = (input && typeof input === 'object' ? input : {}) as Partial<TimelineEvent>

  return {
    id: typeof parsed.id === 'string' ? parsed.id : crypto.randomUUID(),
    title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
    date:
      typeof parsed.date === 'string' && !Number.isNaN(new Date(parsed.date).getTime())
        ? parsed.date
        : fallback.date,
    description:
      typeof parsed.description === 'string' ? parsed.description : fallback.description,
    causes: Array.isArray(parsed.causes)
      ? parsed.causes.filter((cause): cause is string => typeof cause === 'string')
      : [],
    style: {
      accentColor:
        typeof parsed.style?.accentColor === 'string' ? parsed.style.accentColor : undefined,
      surfaceColor:
        typeof parsed.style?.surfaceColor === 'string' ? parsed.style.surfaceColor : undefined,
      textColor:
        typeof parsed.style?.textColor === 'string' ? parsed.style.textColor : undefined,
      borderColor:
        typeof parsed.style?.borderColor === 'string' ? parsed.style.borderColor : undefined,
      width: typeof parsed.style?.width === 'number' ? parsed.style.width : undefined,
      side:
        parsed.style?.side === 'auto' ||
        parsed.style?.side === 'above' ||
        parsed.style?.side === 'below' ||
        parsed.style?.side === 'left' ||
        parsed.style?.side === 'right'
          ? parsed.style.side
          : undefined,
    },
    offset: {
      x: typeof parsed.offset?.x === 'number' ? parsed.offset.x : 0,
      y: typeof parsed.offset?.y === 'number' ? parsed.offset.y : 0,
    },
  }
}

function getFallbackBounds(events: TimelineEvent[], fallback: TimelineDocument) {
  const timestamps = events.map((event) => new Date(event.date).getTime())
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  return {
    startDate: Number.isFinite(min)
      ? new Date(min - 30 * 60_000).toISOString()
      : fallback.settings.startDate,
    endDate: Number.isFinite(max)
      ? new Date(Math.max(max + 30 * 60_000, min + 60 * 60_000)).toISOString()
      : fallback.settings.endDate,
  }
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

function toSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse())
  return {
    x: transformed.x,
    y: transformed.y,
  }
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'timeline'
}

export default App
