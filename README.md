# TestFlows Machine Status

The status page of TestFlows Machine, served at
[status.testflows.com](https://status.testflows.com) by GitHub Pages.

Copyright (C) 2026 Katteli Inc. All rights reserved. Public to read; not
licensed for reuse.

## Files

| File | Written by |
|---|---|
| `status.json` | The outpost, outside the cloud: on every change, and every 60 minutes besides |
| `index.md` | The outpost: the status in Markdown, for agents |
| `feed.atom` | The outpost: the incidents as an Atom feed |
| `incidents.json` | An operator, by hand |
| `llms.txt` | By hand: the index for agents |
| `index.html`, `status.css`, `status.js` | The page |

Do not edit the outpost's files by hand: its next write replaces them.

## An incident

An incident, or a planned maintenance, is an entry of `incidents.json`.
Add it, push, and add an update as it changes. The page shows an open
incident at the top and raises its components to its level; a resolved
one moves to the past incidents. The outpost puts it in `feed.atom` and
`index.md` within 5 minutes.

```json
[
  {
    "id": "2026-11-20-sign-in",
    "title": "Sign-in codes delayed",
    "level": "degraded",
    "components": ["sign-in"],
    "updates": [
      {"at": "2026-11-20T09:05Z", "status": "investigating", "body": "Some sign-in codes arrive late."},
      {"at": "2026-11-20T09:40Z", "status": "resolved", "body": "Codes arrive within seconds again."}
    ]
  },
  {
    "id": "2026-11-22-api-maintenance",
    "title": "Maintenance of the API",
    "kind": "maintenance",
    "components": ["api"],
    "from": "2026-11-22T09:00Z",
    "to": "2026-11-22T10:00Z",
    "updates": [
      {"at": "2026-11-20T12:00Z", "status": "scheduled", "body": "Sessions keep running. Creating a session is refused for up to 10 minutes."}
    ]
  }
]
```

- `id` is the incident's anchor on the page, `#2026-11-20-sign-in`.
- `level` is `degraded` or `down`; a maintenance has none.
- `components` are `website`, `api`, `sign-in`, and `sessions/<class>`.
- An update's `status` is `investigating`, `identified`, `monitoring` or
  `resolved`; for a maintenance, `scheduled`, `in progress` or
  `completed`. The last one decides whether it is open.
- A maintenance shows from 7 days before `from`, and changes its
  components' level only once it starts.
- Times are UTC in ISO 8601, `YYYY-MM-DDTHH:MMZ`. A time without a zone is
  read as UTC.
