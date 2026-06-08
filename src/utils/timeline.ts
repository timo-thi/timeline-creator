import type {
  EventLayout,
  EventSide,
  SegmentLayout,
  TickLayout,
  TimelineDocument,
  TimelineEvent,
  TimelineLayout,
  TimelineTickUnit,
} from '../types'
import { summarizeMarkdown } from './markdown'

const CARD_PADDING = 18
const LANE_SIZE = 184
const AXIS_BAND = 140
const OUTER_PADDING = 72
const SEGMENT_GAP = 84
const CONNECTOR_GAP = 16
const LANE_INTERVAL_PADDING = 20
const MIN_TIME_SPAN_MS = 60 * 60 * 1000

interface PendingEventLayout {
  event: TimelineEvent
  segmentIndex: number
  anchorOffset: number
  pointOffset: number
  cardWidth: number
  cardHeight: number
  lane: number
  side: Exclude<EventSide, 'auto'>
}

/**
 * Computes deterministic positions for the entire timeline, including wrapped segments.
 */
export function computeTimelineLayout(document: TimelineDocument): TimelineLayout {
  const sortedEvents = [...document.events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const { minDate, maxDate } = getDateBounds(document, sortedEvents)
  const direction = document.settings.direction
  const segmentLength = Math.max(240, document.settings.segmentLength)
  const timelineLength = Math.max(segmentLength, document.settings.timelineLength)
  const segmentCount = Math.max(1, Math.ceil(timelineLength / segmentLength))

  const lanesPerSegment = Array.from({ length: segmentCount }, () => ({
    before: [] as number[][][],
    after: [] as number[][][],
  }))

  const pending: PendingEventLayout[] = []

  for (const event of sortedEvents) {
    const offsetAbs = getAbsoluteOffset(event.date, minDate, maxDate, timelineLength)
    const segmentIndex = Math.min(segmentCount - 1, Math.floor(offsetAbs / segmentLength))
    const pointOffset =
      segmentIndex === segmentCount - 1
        ? Math.min(offsetAbs % segmentLength, segmentLength)
        : offsetAbs % segmentLength
    const cardWidth = Math.max(180, event.style.width ?? document.settings.cardWidth)
    const cardHeight = estimateCardHeight(event, cardWidth)
    const side = resolveSide(event.style.side, direction, pending.length)
    const sideKey = side === 'above' || side === 'left' ? 'before' : 'after'
    const anchorOffset = clamp(pointOffset - cardWidth / 2, 0, segmentLength - cardWidth)
    const intervalStart = anchorOffset - LANE_INTERVAL_PADDING
    const intervalEnd = anchorOffset + cardWidth + LANE_INTERVAL_PADDING
    const lane = placeInLane(lanesPerSegment[segmentIndex][sideKey], intervalStart, intervalEnd)

    pending.push({
      event,
      segmentIndex,
      anchorOffset,
      pointOffset,
      cardWidth,
      cardHeight,
      lane,
      side,
    })
  }

  const segments = buildSegments(direction, segmentLength, segmentCount, lanesPerSegment)
  const events = pending.map((item) =>
    direction === 'horizontal'
      ? finalizeHorizontalEvent(item, segments[item.segmentIndex])
      : finalizeVerticalEvent(item, segments[item.segmentIndex]),
  )
  const ticks = buildTicks(document, segments, minDate, maxDate, timelineLength, segmentLength)

  const width =
    direction === 'horizontal'
      ? OUTER_PADDING * 2 + segmentLength
      : segments[segments.length - 1].axisEndX + OUTER_PADDING
  const height =
    direction === 'horizontal'
      ? segments[segments.length - 1].axisEndY + OUTER_PADDING
      : OUTER_PADDING * 2 + segmentLength

  return {
    width,
    height,
    minDate,
    maxDate,
    segments,
    ticks,
    events,
  }
}

/**
 * Builds an orthogonal arrow path between a cause and its effect.
 */
export function buildDependencyPath(from: EventLayout, to: EventLayout): string {
  const startX = from.anchorX + (to.pointX >= from.pointX ? from.cardWidth : 0)
  const startY = from.anchorY + from.cardHeight / 2
  const endX = to.anchorX + (to.pointX >= from.pointX ? 0 : to.cardWidth)
  const endY = to.anchorY + to.cardHeight / 2
  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2

  return [
    `M ${startX} ${startY}`,
    `L ${startX + CONNECTOR_GAP * Math.sign(midX - startX || 1)} ${startY}`,
    `Q ${midX} ${startY} ${midX} ${midY}`,
    `Q ${midX} ${endY} ${endX - CONNECTOR_GAP * Math.sign(endX - midX || 1)} ${endY}`,
    `L ${endX} ${endY}`,
  ].join(' ')
}

/**
 * Returns a stable date label used in cards and segment markers.
 */
export function formatEventDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date))
}

export function formatAxisDate(timestamp: number, unit: TimelineTickUnit): string {
  const optionsByUnit: Record<TimelineTickUnit, Intl.DateTimeFormatOptions> = {
    hour: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    day: { month: 'short', day: 'numeric' },
    week: { month: 'short', day: 'numeric' },
    month: { month: 'short', year: 'numeric' },
  }

  return new Intl.DateTimeFormat(undefined, optionsByUnit[unit]).format(timestamp)
}

function buildSegments(
  direction: TimelineDocument['settings']['direction'],
  segmentLength: number,
  segmentCount: number,
  lanesPerSegment: Array<{ before: number[][][]; after: number[][][] }>,
): SegmentLayout[] {
  const segments: SegmentLayout[] = []
  let runningCross = OUTER_PADDING

  for (let index = 0; index < segmentCount; index += 1) {
    const beforeCount = lanesPerSegment[index].before.length
    const afterCount = lanesPerSegment[index].after.length
    const beforeSpan = Math.max(1, beforeCount) * LANE_SIZE
    const afterSpan = Math.max(1, afterCount) * LANE_SIZE

    if (direction === 'horizontal') {
      const axisY = runningCross + beforeSpan + AXIS_BAND / 2
      segments.push({
        index,
        axisStartX: OUTER_PADDING,
        axisStartY: axisY,
        axisEndX: OUTER_PADDING + segmentLength,
        axisEndY: axisY,
        mainStart: OUTER_PADDING,
        mainEnd: OUTER_PADDING + segmentLength,
      })
      runningCross += beforeSpan + AXIS_BAND + afterSpan + SEGMENT_GAP
      continue
    }

    const axisX = runningCross + beforeSpan + AXIS_BAND / 2
    segments.push({
      index,
      axisStartX: axisX,
      axisStartY: OUTER_PADDING,
      axisEndX: axisX,
      axisEndY: OUTER_PADDING + segmentLength,
      mainStart: OUTER_PADDING,
      mainEnd: OUTER_PADDING + segmentLength,
    })
    runningCross += beforeSpan + AXIS_BAND + afterSpan + SEGMENT_GAP
  }

  return segments
}

function buildTicks(
  document: TimelineDocument,
  segments: SegmentLayout[],
  minDate: number,
  maxDate: number,
  timelineLength: number,
  segmentLength: number,
): TickLayout[] {
  const timestamps = getMajorTickTimestamps(minDate, maxDate, document.settings.majorTickUnit)
  const edgeTicks = [minDate, ...timestamps, maxDate]
  const seen = new Set<number>()

  return edgeTicks
    .filter((timestamp) => {
      const rounded = Math.round(timestamp)
      if (seen.has(rounded)) {
        return false
      }
      seen.add(rounded)
      return true
    })
    .map((timestamp) => {
      const offsetAbs = getAbsoluteOffset(new Date(timestamp).toISOString(), minDate, maxDate, timelineLength)
      const segmentIndex = Math.min(segments.length - 1, Math.floor(offsetAbs / segmentLength))
      const pointOffset =
        segmentIndex === segments.length - 1
          ? Math.min(offsetAbs % segmentLength, segmentLength)
          : offsetAbs % segmentLength
      const segment = segments[segmentIndex]
      const x =
        document.settings.direction === 'horizontal'
          ? segment.axisStartX + pointOffset
          : segment.axisStartX
      const y =
        document.settings.direction === 'horizontal'
          ? segment.axisStartY
          : segment.axisStartY + pointOffset

      return {
        id: `${segmentIndex}-${timestamp}`,
        segmentIndex,
        timestamp,
        x,
        y,
        label: formatAxisDate(timestamp, document.settings.majorTickUnit),
      }
    })
}

function finalizeHorizontalEvent(item: PendingEventLayout, segment: SegmentLayout): EventLayout {
  const pointX = segment.axisStartX + item.pointOffset
  const pointY = segment.axisStartY
  const x = segment.axisStartX + item.anchorOffset + item.event.offset.x
  const laneBase =
    item.side === 'above'
      ? segment.axisStartY - CONNECTOR_GAP - item.cardHeight - item.lane * LANE_SIZE
      : segment.axisStartY + CONNECTOR_GAP + item.lane * LANE_SIZE
  const y = laneBase + item.event.offset.y

  return {
    event: item.event,
    segmentIndex: item.segmentIndex,
    x,
    y,
    cardWidth: item.cardWidth,
    cardHeight: item.cardHeight,
    anchorX: x,
    anchorY: y,
    pointX,
    pointY,
    side: item.side,
  }
}

function finalizeVerticalEvent(item: PendingEventLayout, segment: SegmentLayout): EventLayout {
  const pointX = segment.axisStartX
  const pointY = segment.axisStartY + item.pointOffset
  const y = segment.axisStartY + item.anchorOffset + item.event.offset.y
  const laneBase =
    item.side === 'left'
      ? segment.axisStartX - CONNECTOR_GAP - item.cardWidth - item.lane * LANE_SIZE
      : segment.axisStartX + CONNECTOR_GAP + item.lane * LANE_SIZE
  const x = laneBase + item.event.offset.x

  return {
    event: item.event,
    segmentIndex: item.segmentIndex,
    x,
    y,
    cardWidth: item.cardWidth,
    cardHeight: item.cardHeight,
    anchorX: x,
    anchorY: y,
    pointX,
    pointY,
    side: item.side,
  }
}

function getDateBounds(document: TimelineDocument, events: TimelineEvent[]) {
  const start = new Date(document.settings.startDate).getTime()
  const end = new Date(document.settings.endDate).getTime()

  if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
    return {
      minDate: start,
      maxDate: end,
    }
  }

  if (events.length === 0) {
    const now = Date.now()
    return {
      minDate: now - MIN_TIME_SPAN_MS,
      maxDate: now + MIN_TIME_SPAN_MS,
    }
  }

  const timestamps = events.map((event) => new Date(event.date).getTime())
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  const span = Math.max(max - min, MIN_TIME_SPAN_MS)
  const pad = span * 0.08

  return {
    minDate: min - pad,
    maxDate: max + pad,
  }
}

function getAbsoluteOffset(date: string, minDate: number, maxDate: number, timelineLength: number) {
  const timestamp = new Date(date).getTime()
  const ratio = clamp((timestamp - minDate) / Math.max(1, maxDate - minDate), 0, 1)
  return ratio * timelineLength
}

function getMajorTickTimestamps(start: number, end: number, unit: TimelineTickUnit) {
  const ticks: number[] = []
  let cursor = alignTimestamp(start, unit)

  while (cursor <= end) {
    if (cursor > start && cursor < end) {
      ticks.push(cursor)
    }
    cursor = incrementTimestamp(cursor, unit)
  }

  return ticks
}

function alignTimestamp(timestamp: number, unit: TimelineTickUnit) {
  const date = new Date(timestamp)

  if (unit === 'hour') {
    date.setMinutes(0, 0, 0)
    return date.getTime()
  }

  if (unit === 'day') {
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }

  if (unit === 'week') {
    date.setHours(0, 0, 0, 0)
    const day = date.getDay()
    const diff = (day + 6) % 7
    date.setDate(date.getDate() - diff)
    return date.getTime()
  }

  date.setHours(0, 0, 0, 0)
  date.setDate(1)
  return date.getTime()
}

function incrementTimestamp(timestamp: number, unit: TimelineTickUnit) {
  const date = new Date(timestamp)

  if (unit === 'hour') {
    date.setHours(date.getHours() + 1)
    return date.getTime()
  }

  if (unit === 'day') {
    date.setDate(date.getDate() + 1)
    return date.getTime()
  }

  if (unit === 'week') {
    date.setDate(date.getDate() + 7)
    return date.getTime()
  }

  date.setMonth(date.getMonth() + 1)
  return date.getTime()
}

function resolveSide(
  side: EventSide | undefined,
  direction: TimelineDocument['settings']['direction'],
  index: number,
): Exclude<EventSide, 'auto'> {
  if (side && side !== 'auto') {
    return side
  }

  if (direction === 'horizontal') {
    return index % 2 === 0 ? 'above' : 'below'
  }

  return index % 2 === 0 ? 'left' : 'right'
}

function placeInLane(lanes: number[][][], start: number, end: number) {
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex]
    const overlaps = lane.some(([laneStart, laneEnd]) => start < laneEnd && end > laneStart)

    if (!overlaps) {
      lane.push([start, end])
      return laneIndex
    }
  }

  lanes.push([[start, end]])
  return lanes.length - 1
}

function estimateCardHeight(event: TimelineEvent, cardWidth: number) {
  const titleLines = Math.max(1, Math.ceil(event.title.length / 26))
  const summary = summarizeMarkdown(event.description)
  const summaryLines = Math.min(
    6,
    Math.max(2, Math.ceil(summary.length / Math.max(20, cardWidth / 8))),
  )
  return CARD_PADDING * 2 + titleLines * 18 + summaryLines * 16 + 60
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
