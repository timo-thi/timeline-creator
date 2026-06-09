import type { ChangeEvent, RefObject } from 'react'
import type {
  TimelineDirection,
  TimelineDocument,
  TimelineEvent,
  TimelineTickUnit,
  TimelineZoomSection,
} from '../types'
import { formatEventDateRange } from '../utils/timeline'
import ColorField from './ColorField'

type ThemeKey = keyof TimelineDocument['settings']['theme']
const TICK_UNITS: TimelineTickUnit[] = ['hour', 'day', 'week', 'month']

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
  onExportDocument: (format: 'yaml' | 'json' | 'xml') => void
  onAddZoomSection: () => void
  onPatchZoomSection: (sectionId: string, patch: Partial<TimelineZoomSection>) => void
  onDeleteZoomSection: (sectionId: string) => void
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
  onAddZoomSection,
  onPatchZoomSection,
  onDeleteZoomSection,
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

      <details className="panel-section collapsible-panel" open>
        <summary>Timeline</summary>
        <div className="split-header panel-section-action">
          <span />
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
              onChange={(event) => {
                const majorTickUnit = event.target.value as TimelineTickUnit
                onPatchSetting('majorTickUnit', majorTickUnit)
                if (
                  documentState.settings.secondaryTickUnit &&
                  TICK_UNITS.indexOf(documentState.settings.secondaryTickUnit) >=
                    TICK_UNITS.indexOf(majorTickUnit)
                ) {
                  onPatchSetting('secondaryTickUnit', undefined)
                }
              }}
            >
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label>
            <span>Secondary tick unit</span>
            <select
              value={documentState.settings.secondaryTickUnit ?? ''}
              onChange={(event) =>
                onPatchSetting(
                  'secondaryTickUnit',
                  (event.target.value || undefined) as TimelineTickUnit | undefined,
                )
              }
            >
              <option value="">None</option>
              {TICK_UNITS.filter(
                (unit) =>
                  TICK_UNITS.indexOf(unit) < TICK_UNITS.indexOf(documentState.settings.majorTickUnit),
              ).map((unit) => (
                <option key={unit} value={unit}>
                  {unit[0].toUpperCase() + unit.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={documentState.settings.showSecondaryTickLabels}
              disabled={!documentState.settings.secondaryTickUnit}
              onChange={(event) =>
                onPatchSetting('showSecondaryTickLabels', event.target.checked)
              }
            />
            <span>Secondary tick labels</span>
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
      </details>

      <details className="panel-section collapsible-panel" open>
        <summary>Theme</summary>
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
            <ColorField
              key={key}
              label={label}
              value={documentState.settings.theme[key]}
              onChange={(value) => onPatchTheme(key, value)}
            />
          ))}
        </div>
      </details>

      <details className="panel-section collapsible-panel" open>
        <summary>Events <span>{documentState.events.length}</span></summary>
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
                <span>{formatEventDateRange(event)}</span>
              </button>
            ))}
        </div>
      </details>

      <details className="panel-section collapsible-panel" open>
        <summary>Zoom sections <span>{documentState.zoomSections.length}</span></summary>
        <div className="split-header panel-section-action">
          <span />
          <button type="button" className="ghost" onClick={onAddZoomSection}>
            Add zoom
          </button>
        </div>
        {documentState.zoomSections.length === 0 ? (
          <p className="panel-copy">No zoom sections.</p>
        ) : (
          <div className="zoom-section-list">
            {documentState.zoomSections.map((section) => (
              <div key={section.id} className="zoom-section-editor">
                <label className="full-span">
                  <span>Title</span>
                  <input
                    value={section.title}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="full-span">
                  <span>Start</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(section.startDate)}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, {
                        startDate: new Date(event.target.value).toISOString(),
                      })
                    }
                  />
                </label>
                <label className="full-span">
                  <span>End</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(section.endDate)}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, {
                        endDate: new Date(event.target.value).toISOString(),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Timeline length</span>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={section.timelineLength}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, {
                        timelineLength: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Number of lines</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value={section.lineCount}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, {
                        lineCount: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="checkbox full-span">
                  <input
                    type="checkbox"
                    checked={section.showSecondaryTickLabels}
                    disabled={!documentState.settings.secondaryTickUnit}
                    onChange={(event) =>
                      onPatchZoomSection(section.id, {
                        showSecondaryTickLabels: event.target.checked,
                      })
                    }
                  />
                  <span>Show secondary tick labels</span>
                </label>
                <button
                  type="button"
                  className="danger full-span"
                  onClick={() => onDeleteZoomSection(section.id)}
                >
                  Delete zoom
                </button>
              </div>
            ))}
          </div>
        )}
      </details>

      <details className="panel-section collapsible-panel" open>
        <summary>Import / export</summary>
        <div className="toolbar wrap">
          <button type="button" onClick={() => onExportDocument('yaml')}>
            Export YAML
          </button>
          <button type="button" onClick={() => onExportDocument('json')}>
            Export JSON
          </button>
          <button type="button" onClick={() => onExportDocument('xml')}>
            Export XML
          </button>
          <button type="button" onClick={onImportClick}>
            Import file
          </button>
        </div>
        <div className="toolbar wrap">
          <button type="button" className="ghost" onClick={onResetAllOffsets}>
            Reset all positions
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={documentState.settings.groupRelatedEvents}
              onChange={(event) => onPatchSetting('groupRelatedEvents', event.target.checked)}
            />
            <span>Group related events</span>
          </label>
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
      </details>
    </aside>
  )
}

export default ControlPanel
