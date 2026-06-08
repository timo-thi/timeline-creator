import { type ChangeEvent, type PointerEvent, useRef, useState } from 'react'
import { dump, load } from 'js-yaml'
import './index.css'
import ControlPanel from './components/ControlPanel'
import EventDrawer from './components/EventDrawer'
import StagePreview from './components/StagePreview'
import { defaultTimeline } from './sampleData'
import {
  createEvent,
  getBoundsForEvents,
  normalizeDocument,
  safeFilename,
  toDateTimeLocalValue,
} from './lib/document'
import { toSvgPoint } from './lib/svg'
import type { EventLayout, TimelineDocument, TimelineEvent } from './types'
import { downloadTextFile, exportSvgElement } from './utils/export'
import { computeTimelineLayout } from './utils/timeline'

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
  const [message, setMessage] = useState('Ready.')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const exportSurfaceRef = useRef<HTMLDivElement | null>(null)
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

    const duplicate: TimelineEvent = {
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
    const nextBounds = getBoundsForEvents(documentState.events, defaultTimeline)
    setDocumentState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        startDate: nextBounds.startDate,
        endDate: nextBounds.endDate,
      },
    }))
    setMessage('Timeline bounds fitted to events.')
  }

  function handleRestoreSample() {
    const nextDocument = normalizeDocument(defaultTimeline)
    setDocumentState(nextDocument)
    setSelectedEventId(nextDocument.events[0]?.id ?? '')
    setIsDrawerOpen(false)
    setMessage('Sample timeline restored.')
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
        exportSurfaceRef.current,
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
        <ControlPanel
          documentState={documentState}
          selectedEvent={selectedEvent}
          fileInputRef={fileInputRef}
          onAddEvent={handleAddEvent}
          onDuplicateEvent={handleDuplicateEvent}
          onDeleteEvent={handleDeleteEvent}
          onFitBoundsToEvents={handleFitBoundsToEvents}
          onPatchSetting={patchSettings}
          onPatchTheme={patchTheme}
          onOpenDrawerFor={openDrawerFor}
          onExportDocument={handleExportDocument}
          onExportImage={handleExportImage}
          onResetAllOffsets={resetAllOffsets}
          onRestoreSample={handleRestoreSample}
          onImportClick={handleImportClick}
          onImportFile={handleImportFile}
          toDateTimeLocalValue={toDateTimeLocalValue}
        />
        <StagePreview
          documentState={documentState}
          selectedEvent={selectedEvent}
          layout={layout}
          message={message}
          svgRef={svgRef}
          exportSurfaceRef={exportSurfaceRef}
          eventLookup={eventLookup}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerDown={handlePointerDown}
          onOpenDrawerFor={openDrawerFor}
        />
      </div>

      {selectedEvent ? (
        <EventDrawer
          documentState={documentState}
          selectedEvent={selectedEvent}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onPatchSelectedEvent={patchSelectedEvent}
          onResetSelectedOffset={resetSelectedOffset}
          toDateTimeLocalValue={toDateTimeLocalValue}
        />
      ) : null}
    </>
  )
}

export default App
