import { type ChangeEvent, type PointerEvent, useRef, useState } from 'react'
import { dump, load } from 'js-yaml'
import './index.css'
import ControlPanel from './components/ControlPanel'
import EventDrawer from './components/EventDrawer'
import StagePreview from './components/StagePreview'
import { defaultTimeline } from './sampleData'
import {
  createEvent,
  documentToXml,
  getBoundsForEvents,
  normalizeDocument,
  safeFilename,
  toDateTimeLocalValue,
} from './lib/document'
import { toSvgPoint } from './lib/svg'
import type { EventLayout, TimelineDocument, TimelineEvent, TimelineZoomSection } from './types'
import { downloadTextFile } from './utils/export'
import { computeTimelineLayout } from './utils/timeline'

interface DragState {
  sectionId: string
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
  const [selectedSectionId, setSelectedSectionId] = useState('main')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [message, setMessage] = useState('Ready.')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedEvent = documentState.events.find((event) => event.id === selectedEventId)
  const previews = [
    {
      id: 'main',
      title: documentState.settings.title,
      document: documentState,
    },
    ...documentState.zoomSections.map((section) => ({
      id: section.id,
      title: section.title,
      document: createZoomDocument(documentState, section),
    })),
  ].map((preview) => {
    const layout = computeTimelineLayout(preview.document)
    return {
      ...preview,
      layout,
      eventLookup: new Map(layout.events.map((entry) => [entry.event.id, entry])),
    }
  })

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
    setSelectedSectionId('main')
    setIsDrawerOpen(true)
  }

  function openDrawerForSection(sectionId: string, eventId: string) {
    setSelectedEventId(eventId)
    setSelectedSectionId(sectionId)
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
        zoomSections: current.zoomSections.map((section) => {
          const offsets = { ...section.offsets }
          delete offsets[selectedEvent.id]
          return { ...section, offsets }
        }),
      }
    })

    const fallback = documentState.events.find((event) => event.id !== selectedEvent.id)
    setSelectedEventId(fallback?.id ?? '')
    setIsDrawerOpen(false)
    setMessage('Event removed.')
  }

  function resetSelectedOffset() {
    if (selectedSectionId !== 'main') {
      patchZoomOffset(selectedSectionId, selectedEvent?.id ?? '', { x: 0, y: 0 })
    } else {
      patchSelectedEvent({ offset: { x: 0, y: 0 } })
    }
    setMessage('Selected event position reset.')
  }

  function resetAllOffsets() {
    setDocumentState((current) => ({
      ...current,
      events: current.events.map((event) => ({
        ...event,
        offset: { x: 0, y: 0 },
      })),
      zoomSections: current.zoomSections.map((section) => ({ ...section, offsets: {} })),
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

  function handleExportDocument(format: 'yaml' | 'json' | 'xml') {
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

    if (format === 'json') {
      downloadTextFile(
        `${filename}.timeline.json`,
        JSON.stringify(documentState, null, 2),
        'application/json;charset=utf-8',
      )
      setMessage('JSON exported.')
      return
    }

    downloadTextFile(
      `${filename}.timeline.xml`,
      documentToXml(documentState),
      'application/xml;charset=utf-8',
    )
    setMessage('XML exported.')
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

  function handlePointerDown(
    sectionId: string,
    layoutEvent: EventLayout,
    event: PointerEvent<SVGGElement>,
  ) {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) {
      return
    }

    event.stopPropagation()
    const point = toSvgPoint(svg, event.clientX, event.clientY)
    setSelectedEventId(layoutEvent.event.id)
    setSelectedSectionId(sectionId)
    setDragState({
      sectionId,
      eventId: layoutEvent.event.id,
      pointerId: event.pointerId,
      originX: point.x,
      originY: point.y,
      startOffsetX: layoutEvent.event.offset.x,
      startOffsetY: layoutEvent.event.offset.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleCanvasPointerDown(sectionId: string) {
    setSelectedEventId('')
    setSelectedSectionId(sectionId)
    setIsDrawerOpen(false)
  }

  function handlePointerMove(sectionId: string, event: PointerEvent<SVGSVGElement>) {
    if (!dragState || dragState.sectionId !== sectionId || dragState.pointerId !== event.pointerId) {
      return
    }

    const point = toSvgPoint(event.currentTarget, event.clientX, event.clientY)
    const deltaX = point.x - dragState.originX
    const deltaY = point.y - dragState.originY

    const offset = {
      x: Math.round(dragState.startOffsetX + deltaX),
      y: Math.round(dragState.startOffsetY + deltaY),
    }
    if (sectionId === 'main') {
      setDocumentState((current) => ({
        ...current,
        events: current.events.map((timelineEvent) =>
          timelineEvent.id === dragState.eventId ? { ...timelineEvent, offset } : timelineEvent,
        ),
      }))
    } else {
      patchZoomOffset(sectionId, dragState.eventId, offset)
    }
  }

  function handlePointerUp(sectionId: string, event: PointerEvent<SVGSVGElement>) {
    if (!dragState || dragState.sectionId !== sectionId || dragState.pointerId !== event.pointerId) {
      return
    }

    setDragState(null)
    setMessage('Event moved. Use reset to restore automatic placement.')
  }

  function patchZoomOffset(sectionId: string, eventId: string, offset: TimelineEvent['offset']) {
    setDocumentState((current) => ({
      ...current,
      zoomSections: current.zoomSections.map((section) =>
        section.id === sectionId
          ? { ...section, offsets: { ...section.offsets, [eventId]: offset } }
          : section,
      ),
    }))
  }

  function addZoomSection() {
    const start = new Date(documentState.settings.startDate).getTime()
    const end = new Date(documentState.settings.endDate).getTime()
    const section: TimelineZoomSection = {
      id: crypto.randomUUID(),
      title: `Zoom ${documentState.zoomSections.length + 1}`,
      startDate: new Date(start + (end - start) * 0.25).toISOString(),
      endDate: new Date(start + (end - start) * 0.75).toISOString(),
      timelineLength: documentState.settings.timelineLength,
      lineCount: documentState.settings.lineCount,
      showSecondaryTickLabels: documentState.settings.showSecondaryTickLabels,
      offsets: {},
    }
    setDocumentState((current) => ({ ...current, zoomSections: [...current.zoomSections, section] }))
  }

  function patchZoomSection(sectionId: string, patch: Partial<TimelineZoomSection>) {
    setDocumentState((current) => ({
      ...current,
      zoomSections: current.zoomSections.map((section) =>
        section.id === sectionId ? { ...section, ...patch } : section,
      ),
    }))
  }

  function deleteZoomSection(sectionId: string) {
    setDocumentState((current) => ({
      ...current,
      zoomSections: current.zoomSections.filter((section) => section.id !== sectionId),
    }))
    if (selectedSectionId === sectionId) {
      setSelectedSectionId('main')
    }
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
          onAddZoomSection={addZoomSection}
          onPatchZoomSection={patchZoomSection}
          onDeleteZoomSection={deleteZoomSection}
          onResetAllOffsets={resetAllOffsets}
          onRestoreSample={handleRestoreSample}
          onImportClick={handleImportClick}
          onImportFile={handleImportFile}
          toDateTimeLocalValue={toDateTimeLocalValue}
        />
        <main className="preview-stack">
          <p className="status preview-status">{message}</p>
          {previews.map((preview) => (
            <StagePreview
              key={preview.id}
              sectionId={preview.id}
              title={preview.title}
              documentState={preview.document}
              selectedEvent={selectedEvent}
              layout={preview.layout}
              eventLookup={preview.eventLookup}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onCanvasPointerDown={handleCanvasPointerDown}
              onPointerDown={handlePointerDown}
              onOpenDrawerFor={openDrawerForSection}
            />
          ))}
        </main>
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

function createZoomDocument(
  documentState: TimelineDocument,
  section: TimelineZoomSection,
): TimelineDocument {
  const start = new Date(section.startDate).getTime()
  const end = new Date(section.endDate).getTime()
  const events = documentState.events
    .filter((event) => {
      const eventStart = new Date(event.date).getTime()
      const eventEnd = new Date(event.endDate ?? event.date).getTime()
      return eventStart <= end && eventEnd >= start
    })
    .map((event) => ({
      ...event,
      offset: section.offsets[event.id] ?? { x: 0, y: 0 },
    }))

  return {
    ...documentState,
    settings: {
      ...documentState.settings,
      title: section.title,
      startDate: section.startDate,
      endDate: section.endDate,
      timelineLength: section.timelineLength,
      lineCount: section.lineCount,
      showSecondaryTickLabels: section.showSecondaryTickLabels,
    },
    events,
  }
}

export default App
