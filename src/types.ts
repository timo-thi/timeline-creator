export type TimelineDirection = 'horizontal' | 'vertical'
export type EventSide = 'auto' | 'above' | 'below' | 'left' | 'right'
export type TimelineTickUnit = 'hour' | 'day' | 'week' | 'month'

export interface TimelineTheme {
  background: string
  surface: string
  surfaceMuted: string
  ink: string
  inkMuted: string
  axis: string
  grid: string
  accent: string
}

export interface TimelineSettings {
  title: string
  direction: TimelineDirection
  startDate: string
  endDate: string
  timelineLength: number
  lineCount: number
  majorTickUnit: TimelineTickUnit
  cardWidth: number
  showBackground: boolean
  showGrid: boolean
  theme: TimelineTheme
}

export interface TimelineEventStyle {
  accentColor?: string
  surfaceColor?: string
  textColor?: string
  borderColor?: string
  width?: number
  side?: EventSide
}

export interface TimelineEventOffset {
  x: number
  y: number
}

export interface TimelineEvent {
  id: string
  title: string
  date: string
  description: string
  causes: string[]
  style: TimelineEventStyle
  offset: TimelineEventOffset
}

export interface TimelineDocument {
  version: number
  settings: TimelineSettings
  events: TimelineEvent[]
}

export interface EventLayout {
  event: TimelineEvent
  segmentIndex: number
  x: number
  y: number
  cardWidth: number
  cardHeight: number
  anchorX: number
  anchorY: number
  pointX: number
  pointY: number
  side: Exclude<EventSide, 'auto'>
}

export interface SegmentLayout {
  index: number
  axisStartX: number
  axisStartY: number
  axisEndX: number
  axisEndY: number
  mainStart: number
  mainEnd: number
}

export interface TickLayout {
  id: string
  segmentIndex: number
  timestamp: number
  x: number
  y: number
  label: string
}

export interface TimelineLayout {
  width: number
  height: number
  minDate: number
  maxDate: number
  segments: SegmentLayout[]
  ticks: TickLayout[]
  events: EventLayout[]
}
