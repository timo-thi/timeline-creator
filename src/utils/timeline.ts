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
const LANE_GAP = 24
const AXIS_BAND = 140
const OUTER_PADDING = 72
const SEGMENT_GAP = 84
const CONNECTOR_GAP = 16
const LANE_INTERVAL_PADDING = 20
const MIN_TIME_SPAN_MS = 60 * 60 * 1000
const MAX_LINE_COUNT = 20
const DEPENDENCY_CLEARANCE = 18
const DEPENDENCY_OBSTACLE_PADDING = 8

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

interface LaneLayout {
  intervals: number[][]
  span: number
}

interface SegmentLanes {
  before: LaneLayout[]
  after: LaneLayout[]
}

interface Point {
  x: number
  y: number
}

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
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
  const lineLength = Math.max(1, document.settings.timelineLength)
  const segmentCount = Number.isFinite(document.settings.lineCount)
    ? clamp(Math.round(document.settings.lineCount), 1, MAX_LINE_COUNT)
    : 1
  const cumulativeLength = lineLength * segmentCount

  const lanesPerSegment: SegmentLanes[] = Array.from({ length: segmentCount }, () => ({
    before: [],
    after: [],
  }))

  const pending: PendingEventLayout[] = []

  for (const event of sortedEvents) {
    const offsetAbs = getAbsoluteOffset(event.date, minDate, maxDate, cumulativeLength)
    const { segmentIndex, pointOffset } = getSegmentPosition(
      offsetAbs,
      lineLength,
      segmentCount,
    )
    const cardWidth = Math.max(180, event.style.width ?? document.settings.cardWidth)
    const cardHeight = estimateCardHeight(event, cardWidth)
    const side = resolveSide(event.style.side, direction, pending.length)
    const sideKey = side === 'above' || side === 'left' ? 'before' : 'after'
    const cardMainSize = direction === 'horizontal' ? cardWidth : cardHeight
    const cardCrossSize = direction === 'horizontal' ? cardHeight : cardWidth
    const anchorOffset =
      cardMainSize > lineLength
        ? (lineLength - cardMainSize) / 2
        : clamp(pointOffset - cardMainSize / 2, 0, lineLength - cardMainSize)
    const intervalStart = anchorOffset - LANE_INTERVAL_PADDING
    const intervalEnd = anchorOffset + cardMainSize + LANE_INTERVAL_PADDING
    const lane = placeInLane(
      lanesPerSegment[segmentIndex][sideKey],
      intervalStart,
      intervalEnd,
      cardCrossSize,
    )

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

  const segments = buildSegments(direction, lineLength, segmentCount, lanesPerSegment)
  const rawEvents = pending.map((item) =>
    direction === 'horizontal'
      ? finalizeHorizontalEvent(item, segments[item.segmentIndex], lanesPerSegment[item.segmentIndex])
      : finalizeVerticalEvent(item, segments[item.segmentIndex], lanesPerSegment[item.segmentIndex]),
  )
  const rawTicks = buildTicks(document, segments, minDate, maxDate, cumulativeLength, lineLength)
  const normalized = normalizeLayoutBounds(document, segments, rawEvents, rawTicks)

  return {
    width: normalized.width,
    height: normalized.height,
    minDate,
    maxDate,
    segments: normalized.segments,
    ticks: normalized.ticks,
    events: normalized.events,
  }
}

/**
 * Builds an orthogonal arrow that attaches to nearby card edges and avoids cards.
 */
export function buildDependencyPath(
  from: EventLayout,
  to: EventLayout,
  events: EventLayout[] = [from, to],
): string {
  const obstacles = events.map((event) => getEventRect(event, DEPENDENCY_OBSTACLE_PADDING))
  const fromObstacleIndex = events.findIndex((event) => event.event.id === from.event.id)
  const toObstacleIndex = events.findIndex((event) => event.event.id === to.event.id)
  const routeCandidates = getPortPairs(from, to).flatMap(({ start, startOuter, end, endOuter }) =>
    getOrthogonalRoutes(startOuter, endOuter, obstacles).map((middle) => [
      start,
      startOuter,
      ...middle,
      endOuter,
      end,
    ]),
  )
  const route =
    routeCandidates
      .filter((candidate) =>
        routeAvoidsObstacles(candidate, obstacles, fromObstacleIndex, toObstacleIndex),
      )
      .sort((a, b) => getRouteLength(a) - getRouteLength(b))[0] ??
    routeCandidates.sort((a, b) => getRouteLength(a) - getRouteLength(b))[0]

  return route.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function getPortPairs(from: EventLayout, to: EventLayout) {
  const fromCenter = getEventCenter(from)
  const toCenter = getEventCenter(to)
  const fromPorts = getEventPorts(from, toCenter)
  const toPorts = getEventPorts(to, fromCenter)

  return fromPorts.flatMap((start) =>
    toPorts.map((end) => ({
      start: start.point,
      startOuter: start.outer,
      end: end.point,
      endOuter: end.outer,
    })),
  )
}

function getEventCenter(event: EventLayout): Point {
  return {
    x: event.anchorX + event.cardWidth / 2,
    y: event.anchorY + event.cardHeight / 2,
  }
}

function getEventPorts(event: EventLayout, target: Point) {
  const inset = 18
  const horizontalY = clamp(target.y, event.anchorY + inset, event.anchorY + event.cardHeight - inset)
  const verticalX = clamp(target.x, event.anchorX + inset, event.anchorX + event.cardWidth - inset)

  return [
    createPort(event.anchorX, horizontalY, -DEPENDENCY_CLEARANCE, 0),
    createPort(event.anchorX + event.cardWidth, horizontalY, DEPENDENCY_CLEARANCE, 0),
    createPort(verticalX, event.anchorY, 0, -DEPENDENCY_CLEARANCE),
    createPort(verticalX, event.anchorY + event.cardHeight, 0, DEPENDENCY_CLEARANCE),
  ]
}

function createPort(x: number, y: number, offsetX: number, offsetY: number) {
  return {
    point: { x, y },
    outer: { x: x + offsetX, y: y + offsetY },
  }
}

function getOrthogonalRoutes(start: Point, end: Point, obstacles: Rect[]): Point[][] {
  const routes: Point[][] = [
    [{ x: end.x, y: start.y }],
    [{ x: start.x, y: end.y }],
  ]
  const bounds = obstacles.reduce(
    (result, obstacle) => ({
      left: Math.min(result.left, obstacle.left),
      right: Math.max(result.right, obstacle.right),
      top: Math.min(result.top, obstacle.top),
      bottom: Math.max(result.bottom, obstacle.bottom),
    }),
    { left: start.x, right: start.x, top: start.y, bottom: start.y },
  )
  const detour = DEPENDENCY_CLEARANCE

  routes.push(
    [
      { x: bounds.left - detour, y: start.y },
      { x: bounds.left - detour, y: end.y },
    ],
    [
      { x: bounds.right + detour, y: start.y },
      { x: bounds.right + detour, y: end.y },
    ],
    [
      { x: start.x, y: bounds.top - detour },
      { x: end.x, y: bounds.top - detour },
    ],
    [
      { x: start.x, y: bounds.bottom + detour },
      { x: end.x, y: bounds.bottom + detour },
    ],
  )

  return routes
}

function routeAvoidsObstacles(
  points: Point[],
  obstacles: Rect[],
  fromObstacleIndex: number,
  toObstacleIndex: number,
) {
  return points.slice(1).every((point, index) => {
    const previous = points[index]
    return obstacles.every((obstacle, obstacleIndex) => {
      const isSourceStub = index === 0 && obstacleIndex === fromObstacleIndex
      const isTargetStub = index === points.length - 2 && obstacleIndex === toObstacleIndex
      return isSourceStub || isTargetStub || !segmentIntersectsRect(previous, point, obstacle)
    })
  })
}

function segmentIntersectsRect(start: Point, end: Point, rect: Rect) {
  if (start.x === end.x) {
    return (
      start.x > rect.left &&
      start.x < rect.right &&
      Math.max(start.y, end.y) > rect.top &&
      Math.min(start.y, end.y) < rect.bottom
    )
  }

  return (
    start.y > rect.top &&
    start.y < rect.bottom &&
    Math.max(start.x, end.x) > rect.left &&
    Math.min(start.x, end.x) < rect.right
  )
}

function getRouteLength(points: Point[]) {
  return points.slice(1).reduce(
    (length, point, index) =>
      length + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
    0,
  )
}

function getEventRect(event: EventLayout, padding: number): Rect {
  return {
    left: event.anchorX - padding,
    right: event.anchorX + event.cardWidth + padding,
    top: event.anchorY - padding,
    bottom: event.anchorY + event.cardHeight + padding,
  }
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
  lineLength: number,
  segmentCount: number,
  lanesPerSegment: SegmentLanes[],
): SegmentLayout[] {
  const segments: SegmentLayout[] = []
  let runningCross = OUTER_PADDING

  for (let index = 0; index < segmentCount; index += 1) {
    const beforeSpan = getLanesSpan(lanesPerSegment[index].before)
    const afterSpan = getLanesSpan(lanesPerSegment[index].after)

    if (direction === 'horizontal') {
      const axisY = runningCross + beforeSpan + AXIS_BAND / 2
      segments.push({
        index,
        axisStartX: OUTER_PADDING,
        axisStartY: axisY,
        axisEndX: OUTER_PADDING + lineLength,
        axisEndY: axisY,
        mainStart: OUTER_PADDING,
        mainEnd: OUTER_PADDING + lineLength,
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
      axisEndY: OUTER_PADDING + lineLength,
      mainStart: OUTER_PADDING,
      mainEnd: OUTER_PADDING + lineLength,
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
  cumulativeLength: number,
  lineLength: number,
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
      const offsetAbs = getAbsoluteOffset(
        new Date(timestamp).toISOString(),
        minDate,
        maxDate,
        cumulativeLength,
      )
      const { segmentIndex, pointOffset } = getSegmentPosition(
        offsetAbs,
        lineLength,
        segments.length,
      )
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

function finalizeHorizontalEvent(
  item: PendingEventLayout,
  segment: SegmentLayout,
  lanes: SegmentLanes,
): EventLayout {
  const pointX = segment.axisStartX + item.pointOffset
  const pointY = segment.axisStartY
  const x = segment.axisStartX + item.anchorOffset + item.event.offset.x
  const laneOffset = getLaneOffset(getLanesForSide(lanes, item.side), item.lane)
  const laneBase =
    item.side === 'above'
      ? segment.axisStartY - CONNECTOR_GAP - item.cardHeight - laneOffset
      : segment.axisStartY + CONNECTOR_GAP + laneOffset
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

function finalizeVerticalEvent(
  item: PendingEventLayout,
  segment: SegmentLayout,
  lanes: SegmentLanes,
): EventLayout {
  const pointX = segment.axisStartX
  const pointY = segment.axisStartY + item.pointOffset
  const y = segment.axisStartY + item.anchorOffset + item.event.offset.y
  const laneOffset = getLaneOffset(getLanesForSide(lanes, item.side), item.lane)
  const laneBase =
    item.side === 'left'
      ? segment.axisStartX - CONNECTOR_GAP - item.cardWidth - laneOffset
      : segment.axisStartX + CONNECTOR_GAP + laneOffset
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

function getSegmentPosition(offset: number, lineLength: number, segmentCount: number) {
  if (offset >= lineLength * segmentCount) {
    return {
      segmentIndex: segmentCount - 1,
      pointOffset: lineLength,
    }
  }

  const segmentIndex = Math.floor(offset / lineLength)
  return {
    segmentIndex,
    pointOffset: offset - segmentIndex * lineLength,
  }
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

function placeInLane(lanes: LaneLayout[], start: number, end: number, cardCrossSize: number) {
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex]
    const overlaps = lane.intervals.some(
      ([laneStart, laneEnd]) => start < laneEnd && end > laneStart,
    )

    if (!overlaps) {
      lane.intervals.push([start, end])
      lane.span = Math.max(lane.span, cardCrossSize + LANE_GAP)
      return laneIndex
    }
  }

  lanes.push({
    intervals: [[start, end]],
    span: cardCrossSize + LANE_GAP,
  })
  return lanes.length - 1
}

function estimateCardHeight(event: TimelineEvent, cardWidth: number) {
  const contentWidth = cardWidth - 28
  const titleLines = estimateTextLines(event.title || 'Untitled event', contentWidth, 8)
  const descriptionHeight = estimateMarkdownHeight(event.description, contentWidth)

  return Math.ceil(CARD_PADDING * 2 + 24 + titleLines * 21 + descriptionHeight)
}

function estimateMarkdownHeight(markdown: string, contentWidth: number) {
  if (!markdown.trim()) {
    return 0
  }

  const nonEmptyLines = markdown
    .split('\n')
    .filter((line) => line.trim().length > 0)
  const renderedLines = nonEmptyLines.reduce(
    (total, line) => total + estimateTextLines(summarizeMarkdown(line), contentWidth, 7),
    0,
  )
  const blockCount = markdown.trim().split(/\n\s*\n/).length

  return renderedLines * 18 + blockCount * 8
}

function estimateTextLines(text: string, contentWidth: number, characterWidth: number) {
  const charactersPerLine = Math.max(1, Math.floor(contentWidth / characterWidth))
  return Math.max(1, Math.ceil(text.length / charactersPerLine))
}

function getLanesSpan(lanes: LaneLayout[]) {
  return lanes.length > 0 ? lanes.reduce((total, lane) => total + lane.span, 0) : LANE_SIZE
}

function getLaneOffset(lanes: LaneLayout[], laneIndex: number) {
  return lanes.slice(0, laneIndex).reduce((total, lane) => total + lane.span, 0)
}

function getLanesForSide(lanes: SegmentLanes, side: Exclude<EventSide, 'auto'>) {
  return side === 'above' || side === 'left' ? lanes.before : lanes.after
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeLayoutBounds(
  document: TimelineDocument,
  segments: SegmentLayout[],
  events: EventLayout[],
  ticks: TickLayout[],
) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const tickLabelWidth = document.settings.direction === 'horizontal' ? 80 : 120
  const tickLabelHeight = 28

  for (const segment of segments) {
    minX = Math.min(minX, segment.axisStartX, segment.axisEndX)
    minY = Math.min(minY, segment.axisStartY, segment.axisEndY)
    maxX = Math.max(maxX, segment.axisStartX, segment.axisEndX)
    maxY = Math.max(maxY, segment.axisStartY, segment.axisEndY)
  }

  for (const event of events) {
    minX = Math.min(minX, event.anchorX)
    minY = Math.min(minY, event.anchorY)
    maxX = Math.max(maxX, event.anchorX + event.cardWidth)
    maxY = Math.max(maxY, event.anchorY + event.cardHeight)
  }

  for (const tick of ticks) {
    if (document.settings.direction === 'horizontal') {
      minX = Math.min(minX, tick.x - tickLabelWidth / 2)
      minY = Math.min(minY, tick.y - tickLabelHeight)
      maxX = Math.max(maxX, tick.x + tickLabelWidth / 2)
      maxY = Math.max(maxY, tick.y + 16)
      continue
    }

    minX = Math.min(minX, tick.x - tickLabelWidth)
    minY = Math.min(minY, tick.y - 14)
    maxX = Math.max(maxX, tick.x + 16)
    maxY = Math.max(maxY, tick.y + 14)
  }

  const offsetX = OUTER_PADDING - minX
  const offsetY = OUTER_PADDING - minY
  const width = Math.ceil(maxX - minX + OUTER_PADDING * 2)
  const height = Math.ceil(maxY - minY + OUTER_PADDING * 2)

  return {
    width,
    height,
    segments: segments.map((segment) => ({
      ...segment,
      axisStartX: segment.axisStartX + offsetX,
      axisStartY: segment.axisStartY + offsetY,
      axisEndX: segment.axisEndX + offsetX,
      axisEndY: segment.axisEndY + offsetY,
      mainStart: segment.mainStart + offsetX,
      mainEnd: segment.mainEnd + offsetX,
    })),
    events: events.map((event) => ({
      ...event,
      x: event.x + offsetX,
      y: event.y + offsetY,
      anchorX: event.anchorX + offsetX,
      anchorY: event.anchorY + offsetY,
      pointX: event.pointX + offsetX,
      pointY: event.pointY + offsetY,
    })),
    ticks: ticks.map((tick) => ({
      ...tick,
      x: tick.x + offsetX,
      y: tick.y + offsetY,
    })),
  }
}
