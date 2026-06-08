# Timeline Creator

Browser-only timeline editor for cybersecurity and forensic chain-of-custody work.

It renders a responsive SVG timeline with:

- exact date anchoring for every event
- explicit timeline start and end date-time bounds
- configurable major date ticks by hour, day, week, or month
- automatic event placement without overlap
- cause/effect arrows between related events
- wrapped segments for long timelines
- per-event style overrides
- markdown descriptions
- event editing in a drawer
- drag-and-drop fine tuning with reset
- import/export as YAML or JSON
- image export as PNG, transparent PNG, JPG, and SVG

## Stack

- React 19
- TypeScript
- Vite
- `js-yaml` for import/export
- `marked` + `dompurify` for safe markdown rendering

## Run

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## How to use

1. Edit timeline-wide settings in the left panel.
2. Set the explicit start and end date-time of the timeline and choose the major tick unit.
3. Add events with title, date, markdown description, and optional style overrides.
4. Open an event from the list or by double-clicking a card to edit it in the drawer.
5. Use the `Caused by` checklist on an event to create dependency arrows.
6. Drag cards in the preview if automatic placement needs a manual adjustment.
7. Use `Reset position` or `Reset all positions` to restore automatic layout.
8. Export the source timeline as YAML or JSON, and export the rendered visual as SVG/PNG/JPG.

## Timeline document format

YAML is the default exchange format because it stays readable during investigations and review.

Example:

```yaml
version: 1
settings:
  title: Chain of Custody Timeline
  direction: horizontal
  startDate: 2026-05-01T08:00:00Z
  endDate: 2026-05-02T12:00:00Z
  timelineLength: 1800
  segmentLength: 900
  majorTickUnit: hour
  cardWidth: 260
  showBackground: true
  showGrid: true
  theme:
    background: "#f4efe6"
    surface: "#fffdf9"
    surfaceMuted: "#e9ddcb"
    ink: "#1a1917"
    inkMuted: "#5f574d"
    axis: "#24201b"
    grid: "#c9b79e"
    accent: "#aa5a2b"
events:
  - id: evt-1
    title: Host seized
    date: 2026-05-01T08:15:00Z
    description: |
      Workstation seized during incident response.

      - Photo taken
      - Label attached
    causes: []
    style:
      accentColor: "#8f3d21"
      side: above
      width: 280
    offset:
      x: 0
      y: 0
```

### Notes

- `direction`: `horizontal` or `vertical`
- `startDate` / `endDate`: explicit visible range of the timeline, including time
- `timelineLength`: total virtual axis length in pixels before wrapping
- `segmentLength`: maximum axis length per wrapped segment
- `majorTickUnit`: `hour`, `day`, `week`, or `month`
- `causes`: list of earlier event IDs that explain this event
- `offset`: manual drag adjustment applied on top of automatic placement
- `style.side`: `auto`, `above`, `below`, `left`, or `right`

## Code structure

- [src/App.tsx](/home/sptim/Projects/TimelineCreator/src/App.tsx): editor, preview, drag handling, import/export wiring
- [src/types.ts](/home/sptim/Projects/TimelineCreator/src/types.ts): document and layout types
- [src/sampleData.ts](/home/sptim/Projects/TimelineCreator/src/sampleData.ts): starter forensic timeline
- [src/utils/timeline.ts](/home/sptim/Projects/TimelineCreator/src/utils/timeline.ts): automatic layout and dependency routing
- [src/utils/markdown.ts](/home/sptim/Projects/TimelineCreator/src/utils/markdown.ts): markdown render/summarize helpers
- [src/utils/export.ts](/home/sptim/Projects/TimelineCreator/src/utils/export.ts): browser-only SVG/PNG/JPG export

## Layout behavior

- Events are sorted by date and placed against the explicit timeline bounds.
- Each event is mapped onto a virtual axis (`timelineLength`).
- If the axis exceeds `segmentLength`, the timeline wraps into multiple rows or columns.
- Major tick marks and labels are generated from the configured tick unit.
- Cards are assigned to non-overlapping lanes on either side of the axis.
- Thin connector lines point from each card to the exact event timestamp on the axis.
- Dependency arrows are drawn separately from the placement lines and remain valid across wrapped segments.

## Limitations

- Raster export depends on the browser being able to re-load the generated SVG into an image element.
- Markdown inside cards is clipped to keep cards compact in exported visuals.
- Import validation is intentionally lightweight and normalizes missing fields instead of rejecting most partial files.
