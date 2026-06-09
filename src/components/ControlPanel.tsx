import type { ChangeEvent, RefObject } from 'react'
import type {
  TimelineDirection,
  TimelineDocument,
  TimelineEvent,
  TimelineTickUnit,
} from '../types'
import { formatEventDate } from '../utils/timeline'

type ThemeKey = keyof TimelineDocument['settings']['theme']

interface ControlPanelProps {
  documentState: TimelineDocument
  selectedEvent?: TimelineEvent
  fileInputRef: RefObject<HTMLInputElement | null>
  onAddEvent: () => void
  onDuplicateEvent: () => void
  onDeleteEvent: () => void
  onFitBoundsToEvents: () => void
  onPatchSetting: <K extends keyof TimelineDocument['settings']>(
    key: K,
    value: TimelineDocument['settings'][K],
  ) => void
  onPatchTheme: <K extends ThemeKey>(
    key: K,
    value: TimelineDocument['settings']['theme'][K],
  ) => void
  onOpenDrawerFor: (eventId: string) => void
  onExportDocument: (format: 'yaml' | 'json') => void
  onExportImage: (format: 'png' | 'jpg' | 'svg', includeBackground: boolean) => void
  onResetAllOffsets: () => void
  onRestoreSample: () => void
  onImportClick: () => void
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  toDateTimeLocalValue: (value: string) => string
}

function ControlPanel({
  documentState,
  selectedEvent,
  fileInputRef,
  onAddEvent,
  onDuplicateEvent,
  onDeleteEvent,
  onFitBoundsToEvents,
  onPatchSetting,
  onPatchTheme,
  onOpenDrawerFor,
  onExportDocument,
  onExportImage,
  onResetAllOffsets,
  onRestoreSample,
  onImportClick,
  onImportFile,
  toDateTimeLocalValue,
}: ControlPanelProps) {
  return (
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
          <button type="button" onClick={onAddEvent}>
            Add event
          </button>
          <button type="button" onClick={onDuplicateEvent} disabled={!selectedEvent}>
            Duplicate
          </button>
          <button
            type="button"
            className="danger"
            onClick={onDeleteEvent}
            disabled={!selectedEvent || documentState.events.length === 1}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="split-header">
          <h2>Timeline</h2>
          <button type="button" className="ghost" onClick={onFitBoundsToEvents}>
            Fit to events
          </button>
        </div>
        <div className="compact-grid">
          <label>
            <span>Title</span>
            <input
              value={documentState.settings.title}
              onChange={(event) => onPatchSetting('title', event.target.value)}
            />
          </label>
          <label>
            <span>Direction</span>
            <select
              value={documentState.settings.direction}
              onChange={(event) =>
                onPatchSetting('direction', event.target.value as TimelineDirection)
              }
            >
              <option value="horizontal">Left to right</option>
              <option value="vertical">Top to bottom</option>
            </select>
          </label>
          <label className="full-span">
            <span>Start date</span>
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(documentState.settings.startDate)}
              onChange={(event) =>
                onPatchSetting('startDate', new Date(event.target.value).toISOString())
              }
            />
          </label>
          <label className="full-span">
            <span>End date</span>
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(documentState.settings.endDate)}
              onChange={(event) =>
                onPatchSetting('endDate', new Date(event.target.value).toISOString())
              }
            />
          </label>
          <label>
            <span>Main tick unit</span>
            <select
              value={documentState.settings.majorTickUnit}
              onChange={(event) =>
                onPatchSetting('majorTickUnit', event.target.value as TimelineTickUnit)
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
              onChange={(event) => onPatchSetting('cardWidth', Number(event.target.value))}
            />
          </label>
          <label>
            <span>Timeline length</span>
            <input
              type="number"
              min="1"
              step="100"
              value={documentState.settings.timelineLength}
              onChange={(event) => onPatchSetting('timelineLength', Number(event.target.value))}
            />
          </label>
          <label>
            <span>Number of lines</span>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={documentState.settings.lineCount}
              onChange={(event) => onPatchSetting('lineCount', Number(event.target.value))}
            />
          </label>
        </div>
        <div className="toggle-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={documentState.settings.showBackground}
              onChange={(event) => onPatchSetting('showBackground', event.target.checked)}
            />
            <span>Canvas background</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={documentState.settings.showGrid}
              onChange={(event) => onPatchSetting('showGrid', event.target.checked)}
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
                onChange={(event) => onPatchTheme(key, event.target.value)}
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
                onClick={() => onOpenDrawerFor(event.id)}
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
          <button type="button" onClick={() => onExportDocument('yaml')}>
            Export YAML
          </button>
          <button type="button" onClick={() => onExportDocument('json')}>
            Export JSON
          </button>
          <button type="button" onClick={onImportClick}>
            Import file
          </button>
        </div>
        <div className="toolbar wrap">
          <button type="button" onClick={() => onExportImage('png', true)}>
            PNG
          </button>
          <button type="button" onClick={() => onExportImage('png', false)}>
            PNG transparent
          </button>
          <button type="button" onClick={() => onExportImage('jpg', true)}>
            JPG
          </button>
          <button type="button" onClick={() => onExportImage('svg', true)}>
            SVG
          </button>
        </div>
        <div className="toolbar wrap">
          <button type="button" className="ghost" onClick={onResetAllOffsets}>
            Reset all positions
          </button>
          <button type="button" className="ghost" onClick={onRestoreSample}>
            Load sample
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="hidden-input"
          type="file"
          accept=".yaml,.yml,.json,.timeline.yaml,.timeline.json"
          onChange={onImportFile}
        />
      </div>
    </aside>
  )
}

export default ControlPanel
