# TestFlows Machine Status

The status page of TestFlows Machine, served at
[status.testflows.com](https://status.testflows.com) by GitHub Pages.

Copyright (C) 2026 Katteli Inc. All rights reserved. Public to read; not
licensed for reuse.

## Files

| File | Written by |
|---|---|
| `status.json` | The outpost, outside the cloud: on every change of a level, and every 30 minutes |
| `notices.json` | An operator, by hand |
| `index.html`, `status.css`, `status.js` | The page |

Do not edit `status.json` by hand: the outpost's next write replaces it.

## A notice

A notice is planned maintenance, or a word on an incident. Add an entry to
`notices.json` and push. The page shows it from a day before `from` until
`to`; a notice without `to` shows until it is removed.

```json
[
  {
    "title": "Maintenance of the API",
    "body": "Sessions keep running. Creating a session is refused for up to 10 minutes.",
    "level": "degraded",
    "from": "2026-11-20T09:00Z",
    "to": "2026-11-20T10:00Z"
  }
]
```

`level` is `degraded` or `down`. `from` and `to` are UTC in ISO 8601,
`YYYY-MM-DDTHH:MMZ`, which every browser reads alike.
