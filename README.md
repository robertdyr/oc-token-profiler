# OpenCode Token Profiler

OpenCode Token Profiler is a small browser-based tool for inspecting token usage in an OpenCode session export.

It takes the `GET /session/:id/message` output, reconstructs it into a profiler-style call tree, and helps answer one question quickly:

`Where are the tokens going?`

## What It Does

- Builds a call-tree view from the session message log
- Shows prompts, assistant attempts, reasoning, tools, final responses, and other structural nodes
- Lets you sort by token metrics such as total, non-cached total, input, output, reasoning, and cache
- Keeps zero-token structural rows visible so execution shape is still understandable
- Highlights expensive rows so hotspots stand out immediately
- Supports uploading a local `messages.json` file directly in the UI

## Why This Exists

OpenCode sessions are rich, but the raw message payload is difficult to read by eye.

This tool turns that payload into something closer to a traditional profiler or call tree, similar in spirit to IntelliJ and Java profiler views:

- hierarchical
- sortable
- hotspot-oriented
- focused on analysis rather than visualization gimmicks

This is intentionally not a graph, Sankey, or flamegraph-first UI.

## Current Features

- Expandable call tree
- Actual-order and metric-based sorting
- Metric toggle
- Non-cached total metric
- Percentage of session and percentage of parent
- Collapse all
- Upload custom `messages.json`

## Data Model

The app works against the OpenCode `message-v2` style session export shape:

```ts
type Message = {
  info: User | Assistant
  parts: Part[]
}
```

The parser treats the top-level message and part structure as real schema, but treats arbitrary tool payloads as opaque.

## Running Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL, usually `http://localhost:5173`.

For a production build:

```bash
npm run build
npm run preview
```

## Using It

1. Start the app.
2. Click `Upload messages.json`.
3. Choose an OpenCode session export.
4. Explore the session as a call tree.

## Project Layout

- `src/App.tsx` - main UI and interactions
- `src/tree.ts` - session normalization and call-tree building
- `src/sessionTree.worker.ts` - background parsing and tree construction
- `todo.md` - short backlog and future improvements

## Status

This is a focused internal tool / demo project, not a polished library.

The implementation is intentionally small and pragmatic, but the core goal is already there: making token costs inspectable in a way that feels like a profiler instead of a log dump.
