# OpenCode Token Profiler

Profiler-style call tree for inspecting token usage in OpenCode session exports.

![OpenCode Token Profiler screenshot](showcase.png)

## What It Does

- Upload JSON from the OpenCode `GET /session/:id/message` endpoint
- Reconstruct the session into a call tree
- Sort by total, non-cached, input, output, reasoning, and cache tokens
- Highlight hot paths and expensive nodes

## Run

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

## Use

1. Open the app.
2. Click `Upload session export`.
3. Pick a JSON file exported from `GET /session/:id/message`.

