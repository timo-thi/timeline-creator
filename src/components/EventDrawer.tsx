import { type TimelineDocument, type TimelineEvent } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface EventDrawerProps {
  documentState: TimelineDocument
  selectedEvent: TimelineEvent
  isOpen: boolean
  onClose: () => void
  onPatchSelectedEvent: (patch: Partial<TimelineEvent>) => void
  onResetSelectedOffset: () => void
  toDateTimeLocalValue: (value: string) => string
}

function EventDrawer({
  documentState,
  selectedEvent,
  isOpen,
  onClose,
  onPatchSelectedEvent,
  onResetSelectedOffset,
  toDateTimeLocalValue,
}: EventDrawerProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="event-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Event editor</p>
            <h2>{selectedEvent.title || 'Untitled event'}</h2>
          </div>
          <div className="toolbar">
            <button type="button" className="ghost" onClick={onResetSelectedOffset}>
              Reset position
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="drawer-content">
          <label>
            <span>Title</span>
            <input
              value={selectedEvent.title}
              onChange={(event) => onPatchSelectedEvent({ title: event.target.value })}
            />
          </label>
          <label>
            <span>Start date</span>
            <input
              type="datetime-local"
              value={toDateTimeLocalValue(selectedEvent.date)}
              onChange={(event) =>
                onPatchSelectedEvent({ date: new Date(event.target.value).toISOString() })
              }
            />
          </label>
          <label>
            <span>End date (optional)</span>
            <input
              type="datetime-local"
              min={toDateTimeLocalValue(selectedEvent.date)}
              value={selectedEvent.endDate ? toDateTimeLocalValue(selectedEvent.endDate) : ''}
              onChange={(event) =>
                onPatchSelectedEvent({
                  endDate: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : undefined,
                })
              }
            />
          </label>
          <label>
            <span>Description (Markdown)</span>
            <textarea
              rows={10}
              value={selectedEvent.description}
              onChange={(event) => onPatchSelectedEvent({ description: event.target.value })}
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
                  onPatchSelectedEvent({
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
                  onPatchSelectedEvent({
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
                  onPatchSelectedEvent({
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
                  onPatchSelectedEvent({
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
                  onPatchSelectedEvent({
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
                  onPatchSelectedEvent({
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
                        onPatchSelectedEvent({ causes: nextCauses })
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
  )
}

export default EventDrawer
