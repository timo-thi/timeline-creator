import { defaultTimeline } from '../sampleData'
import type {
  TimelineDocument,
  TimelineEvent,
  TimelineSettings,
  TimelineZoomSection,
} from '../types'

/**
 * Creates a blank event anchored to the provided date.
 */
export function createEvent(baseDate: string): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    title: 'New event',
    date: baseDate,
    description: '',
    causes: [],
    style: {},
    offset: { x: 0, y: 0 },
  }
}

/**
 * Normalizes imported or partial document data to the app schema.
 */
export function normalizeDocument(input: unknown): TimelineDocument {
  const fallback = structuredClone(defaultTimeline)
  if (!input || typeof input !== 'object') {
    return fallback
  }

  const parsed = input as Partial<TimelineDocument>
  const settings = parsed.settings ?? fallback.settings
  const legacySettings = settings as unknown as { segmentLength?: unknown }
  const legacySegmentLength =
    typeof legacySettings.segmentLength === 'number' && Number.isFinite(legacySettings.segmentLength)
      ? legacySettings.segmentLength
      : undefined
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
        legacySegmentLength ??
        (typeof settings.timelineLength === 'number'
          ? settings.timelineLength
          : fallback.settings.timelineLength),
      lineCount:
        typeof settings.lineCount === 'number' && Number.isFinite(settings.lineCount)
          ? clampLineCount(settings.lineCount)
          : legacySegmentLength
            ? clampLineCount(
                Math.ceil(
                  (settings.timelineLength ?? fallback.settings.timelineLength) /
                    legacySegmentLength,
                ),
              )
            : fallback.settings.lineCount,
      majorTickUnit:
        settings.majorTickUnit === 'hour' ||
        settings.majorTickUnit === 'day' ||
        settings.majorTickUnit === 'week' ||
        settings.majorTickUnit === 'month'
          ? settings.majorTickUnit
          : fallback.settings.majorTickUnit,
      secondaryTickUnit: isFinerTickUnit(settings.secondaryTickUnit, settings.majorTickUnit)
        ? settings.secondaryTickUnit
        : undefined,
      showSecondaryTickLabels:
        typeof settings.showSecondaryTickLabels === 'boolean'
          ? settings.showSecondaryTickLabels
          : false,
      cardWidth:
        typeof settings.cardWidth === 'number'
          ? settings.cardWidth
          : fallback.settings.cardWidth,
      groupRelatedEvents:
        typeof settings.groupRelatedEvents === 'boolean' ? settings.groupRelatedEvents : true,
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
    zoomSections: Array.isArray(parsed.zoomSections)
      ? parsed.zoomSections
          .map((section) => normalizeZoomSection(section, fallback.settings))
          .filter((section) => section !== null)
      : [],
  }
}

/**
 * Produces a timestamp window that comfortably covers the current events.
 */
export function getBoundsForEvents(events: TimelineEvent[], fallback: TimelineDocument) {
  const timestamps = events.flatMap((event) => [
    new Date(event.date).getTime(),
    ...(event.endDate ? [new Date(event.endDate).getTime()] : []),
  ])
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

/**
 * Formats an ISO timestamp for a datetime-local input.
 */
export function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

/**
 * Sanitizes a document title to a filesystem-friendly export name.
 */
export function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'timeline'
}

export function documentToXml(document: TimelineDocument) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${valueToXml('timelineDocument', document)}`
}

function valueToXml(name: string, value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    return `${indent}<${name}>\n${value
      .map((item) => valueToXml('item', item, `${indent}  `))
      .join('\n')}\n${indent}</${name}>`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    return `${indent}<${name}>\n${entries
      .map(
        ([key, item]) =>
          `${indent}  <field name="${escapeXml(key)}">\n${valueToXml(
            'value',
            item,
            `${indent}    `,
          )}\n${indent}  </field>`,
      )
      .join('\n')}\n${indent}</${name}>`
  }

  if (value === undefined) {
    return `${indent}<${name}/>`
  }

  return `${indent}<${name}>${escapeXml(String(value))}</${name}>`
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
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
    endDate: isValidDateString(parsed.endDate) ? parsed.endDate : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : '',
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

function normalizeZoomSection(
  input: unknown,
  fallbackSettings: TimelineSettings,
): TimelineZoomSection | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const parsed = input as Partial<TimelineZoomSection>
  if (
    !isValidDateString(parsed.startDate) ||
    !isValidDateString(parsed.endDate) ||
    new Date(parsed.endDate).getTime() <= new Date(parsed.startDate).getTime()
  ) {
    return null
  }

  const offsets =
    parsed.offsets && typeof parsed.offsets === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.offsets).flatMap(([eventId, offset]) =>
            offset && typeof offset.x === 'number' && typeof offset.y === 'number'
              ? [[eventId, { x: offset.x, y: offset.y }]]
              : [],
          ),
        )
      : {}

  return {
    id: typeof parsed.id === 'string' ? parsed.id : crypto.randomUUID(),
    title: typeof parsed.title === 'string' ? parsed.title : 'Zoom section',
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    timelineLength:
      typeof parsed.timelineLength === 'number' && Number.isFinite(parsed.timelineLength)
        ? Math.max(1, parsed.timelineLength)
        : fallbackSettings.timelineLength,
    lineCount:
      typeof parsed.lineCount === 'number' && Number.isFinite(parsed.lineCount)
        ? clampLineCount(parsed.lineCount)
        : fallbackSettings.lineCount,
    showSecondaryTickLabels:
      typeof parsed.showSecondaryTickLabels === 'boolean'
        ? parsed.showSecondaryTickLabels
        : fallbackSettings.showSecondaryTickLabels,
    offsets,
  }
}

function getFallbackBounds(events: TimelineEvent[], fallback: TimelineDocument) {
  return getBoundsForEvents(events, fallback)
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime())
}

function clampLineCount(value: number) {
  return Math.min(20, Math.max(1, Math.round(value)))
}

function isFinerTickUnit(
  secondary: TimelineDocument['settings']['secondaryTickUnit'],
  major: TimelineDocument['settings']['majorTickUnit'],
) {
  const order = ['hour', 'day', 'week', 'month']
  return secondary !== undefined && order.indexOf(secondary) < order.indexOf(major)
}
