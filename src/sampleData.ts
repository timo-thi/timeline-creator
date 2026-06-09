import type { TimelineDocument } from './types'

export const defaultTimeline: TimelineDocument = {
  version: 1,
  settings: {
    title: 'Chain of Custody Timeline',
    direction: 'horizontal',
    startDate: '2026-05-01T08:00:00Z',
    endDate: '2026-05-02T12:00:00Z',
    timelineLength: 900,
    lineCount: 2,
    majorTickUnit: 'hour',
    secondaryTickUnit: undefined,
    cardWidth: 260,
    groupRelatedEvents: true,
    showBackground: true,
    showGrid: true,
    theme: {
      background: '#f4efe6',
      surface: '#fffdf9',
      surfaceMuted: '#e9ddcb',
      ink: '#1a1917',
      inkMuted: '#5f574d',
      axis: '#24201b',
      grid: '#c9b79e',
      accent: '#aa5a2b',
    },
  },
  zoomSections: [],
  events: [
    {
      id: crypto.randomUUID(),
      title: 'Host seized',
      date: '2026-05-01T08:15:00Z',
      description:
        'Workstation seized during incident response.\n\n- Photographed in place\n- Power state recorded\n- Device label attached',
      causes: [],
      style: {
        accentColor: '#8f3d21',
        side: 'above',
      },
      offset: { x: 0, y: 0 },
    },
    {
      id: crypto.randomUUID(),
      title: 'Disk imaged',
      date: '2026-05-01T10:45:00Z',
      description:
        'Forensic image created with **write blocker** and SHA-256 hash captured.\n\n`dc3dd` used for acquisition.',
      causes: [],
      style: {
        accentColor: '#1f6c5b',
        side: 'below',
      },
      offset: { x: 0, y: 0 },
    },
    {
      id: crypto.randomUUID(),
      title: 'Evidence transferred',
      date: '2026-05-01T14:10:00Z',
      description:
        'Drive transferred to secure evidence cabinet.\n\nReceipt signed by second examiner.',
      causes: [],
      style: {
        accentColor: '#34679a',
      },
      offset: { x: 0, y: 0 },
    },
    {
      id: crypto.randomUUID(),
      title: 'Malware sample extracted',
      date: '2026-05-02T09:20:00Z',
      description:
        'Executable extracted from mounted image.\n\nCause/effect link should point back to the imaging step.',
      causes: [],
      style: {
        accentColor: '#7c4aae',
      },
      offset: { x: 0, y: 0 },
    },
  ],
}

defaultTimeline.events[2].causes = [defaultTimeline.events[1].id]
defaultTimeline.events[3].causes = [defaultTimeline.events[1].id]
