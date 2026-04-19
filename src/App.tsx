import { useMemo, useState } from "react"
import type { ChangeEvent } from "react"
import SessionTreeWorker from "./sessionTree.worker?worker"
import { flattenVisible, formatNumber, formatPercent, metricLabels, sortTree } from "./tree"
import type { FlatRow, MetricKey, TreeNode } from "./types"
import type { SortMode } from "./tree"

const metricOptions: MetricKey[] = ["total", "nonCachedTotal", "input", "output", "reasoning", "cacheRead", "cacheWrite"]

const sortMetricOptions: Array<{ value: "actual" | MetricKey; label: string }> = [
  { value: "actual", label: "Actual Order" },
  { value: "total", label: "Biggest Total" },
  { value: "nonCachedTotal", label: "Biggest Non-Cached" },
  { value: "input", label: "Biggest Input" },
  { value: "output", label: "Biggest Output" },
  { value: "reasoning", label: "Biggest Reasoning" },
  { value: "cacheRead", label: "Biggest Cache Read" },
  { value: "cacheWrite", label: "Biggest Cache Write" },
]

function columnValue(node: TreeNode, metric: MetricKey) {
  return node.stats[metric]
}

function heatLevel(value: number, total: number) {
  if (total <= 0) return "heat-cold"
  const ratio = value / total
  if (ratio >= 0.35) return "heat-critical"
  if (ratio >= 0.18) return "heat-hot"
  if (ratio >= 0.08) return "heat-warm"
  return "heat-cold"
}

type RowProps = {
  row: FlatRow
  focusMetric: MetricKey
  expanded: boolean
  onToggle: (id: string) => void
  sessionMetricTotal: number
}

function TreeRow({ row, focusMetric, expanded, onToggle, sessionMetricTotal }: RowProps) {
  const { node, parent } = row
  const parentMetricTotal = parent.stats[focusMetric]
  const rowMetricValue = columnValue(node, focusMetric)
  const indent = node.depth * 20
  const rowHeat = heatLevel(rowMetricValue, sessionMetricTotal)
  const selfHeat = heatLevel(node.self.total, sessionMetricTotal)

  return (
    <tr className="table-row">
      <td>
        <div className="name-cell" style={{ paddingLeft: `${indent}px` }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              className="expander"
              onClick={() => onToggle(node.id)}
              aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            >
              {expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="expander spacer">•</span>
          )}
          <div>
            <div className="name-text">{node.name}</div>
            {node.meta ? <div className="meta-text">{node.meta}</div> : null}
          </div>
        </div>
      </td>
      <td>
        <span className={`type-pill type-${node.type}`}>{node.type}</span>
      </td>
      <td className={focusMetric === "nonCachedTotal" ? `metric-cell ${rowHeat}` : "metric-cell"}>{formatNumber(node.stats.nonCachedTotal)}</td>
      <td className={focusMetric === "total" ? `metric-cell ${rowHeat}` : "metric-cell"}>{formatNumber(node.stats.total)}</td>
      <td className={`metric-cell ${selfHeat}`}>{formatNumber(node.self.total)}</td>
      <td>{formatNumber(node.stats.input)}</td>
      <td>{formatNumber(node.stats.output)}</td>
      <td>{formatNumber(node.stats.reasoning)}</td>
      <td>{formatNumber(node.stats.cacheRead)}</td>
      <td>{formatNumber(node.stats.cacheWrite)}</td>
      <td>
        <div className={`share-cell ${rowHeat}`}>
          <strong>{formatPercent(rowMetricValue, sessionMetricTotal)}</strong>
          <span>{formatPercent(rowMetricValue, parentMetricTotal)}</span>
        </div>
      </td>
    </tr>
  )
}

export default function App() {
  const [focusMetric, setFocusMetric] = useState<MetricKey>("total")
  const [sortMode, setSortMode] = useState<SortMode>({ type: "actual" })
  const [session, setSession] = useState<TreeNode | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sourceLabel, setSourceLabel] = useState("No file loaded")
  const [isLoading, setIsLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const sorted = useMemo(() => (session ? sortTree(session, sortMode) : null), [session, sortMode])
  const rows = useMemo(() => (sorted ? flattenVisible(sorted, expanded) : []), [sorted, expanded])
  const sessionMetricTotal = sorted?.stats[focusMetric] ?? 0

  function toggleNode(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateSort(metric: MetricKey) {
    setSortMode((current) => {
      if (current.type === "metric" && current.metric === metric) {
        return { type: "metric", metric, descending: !current.descending }
      }
      return { type: "metric", metric, descending: true }
    })
  }

  function sortSelectValue(current: SortMode): "actual" | MetricKey {
    return current.type === "actual" ? "actual" : current.metric
  }

  function handleSortModeChange(value: "actual" | MetricKey) {
    if (value === "actual") {
      setSortMode({ type: "actual" })
      return
    }

    setSortMode((current) => {
      if (current.type === "metric" && current.metric === value) return current
      return { type: "metric", metric: value, descending: true }
    })
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setLoadError(null)

    try {
      const text = await file.text()
      const worker = new SessionTreeWorker()

      worker.onmessage = (message: MessageEvent<{ type: "loaded"; tree: TreeNode } | { type: "error"; error: string }>) => {
        if (message.data.type === "loaded") {
          setSession(message.data.tree)
          setExpanded(new Set(message.data.tree.children.map((child) => child.id)))
          setSourceLabel(file.name)
          setLoadError(null)
        } else {
          setLoadError(message.data.error)
        }

        setIsLoading(false)
        worker.terminate()
      }

      worker.postMessage({ type: "load-text", text })
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to read uploaded file")
      setIsLoading(false)
    } finally {
      event.target.value = ""
    }
  }

  const sortLabel = sortMode.type === "actual"
    ? "Actual Order"
    : `${metricLabels[sortMode.metric]} ${sortMode.descending ? "Descending" : "Ascending"}`

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <p className="eyebrow">Token Profiler</p>
          <h1>Session Call Tree</h1>
          <p className="subtitle">Upload an OpenCode session export and inspect token usage as a profiler-style call tree.</p>
        </div>
        <div className="summary-strip">
          <div className="summary-card">
            <span className="summary-label">Focus Metric</span>
            <strong>{metricLabels[focusMetric]}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Session Total</span>
            <strong>{formatNumber(sessionMetricTotal)}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Sort</span>
            <strong>{sortLabel}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Source</span>
            <strong>{sourceLabel}</strong>
          </div>
        </div>
      </header>

      {isLoading ? <section className="status-panel">Loading and parsing session data...</section> : null}
      {loadError ? <section className="status-panel error-panel">{loadError}</section> : null}

      <section className="toolbar">
        <div className="toolbar-row">
          <div className="control-block">
            <div className="control-label">Metric</div>
            <div className="metric-toggle" role="tablist" aria-label="Metric focus">
              {metricOptions.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  className={metric === focusMetric ? "active" : ""}
                  onClick={() => setFocusMetric(metric)}
                  disabled={!session}
                >
                  {metricLabels[metric]}
                </button>
              ))}
            </div>
          </div>
          <div className="control-block sort-block" aria-label="Sort mode">
            <div className="control-label">Sort</div>
            <div className="sort-controls">
              <label className="sort-label">
                <select
                  value={sortSelectValue(sortMode)}
                  onChange={(event) => handleSortModeChange(event.target.value as "actual" | MetricKey)}
                  disabled={!session}
                >
                  {sortMetricOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="sort-direction"
                onClick={() => setSortMode((current) => current.type === "metric" ? { ...current, descending: !current.descending } : current)}
                disabled={!session || sortMode.type !== "metric"}
              >
                {sortMode.type === "metric" && !sortMode.descending ? "Ascending" : "Descending"}
              </button>
              <button
                type="button"
                className="sort-direction"
                onClick={() => setExpanded(new Set())}
                disabled={!session}
              >
                Collapse All
              </button>
            </div>
          </div>
          <div className="control-block sort-block">
            <div className="control-label">Data</div>
            <div className="sort-controls">
              <label className="upload-label">
                <input type="file" accept="application/json,.json" onChange={handleUpload} />
                <span>{isLoading ? "Loading..." : "Upload session export"}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {session ? (
        <section className="table-shell">
          <table className="profiler-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("nonCachedTotal")}>
                    Non-Cached Total{sortMode.type === "metric" && sortMode.metric === "nonCachedTotal" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("total")}>
                    Total Tokens{sortMode.type === "metric" && sortMode.metric === "total" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>Self Tokens</th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("input")}>
                    Input{sortMode.type === "metric" && sortMode.metric === "input" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("output")}>
                    Output{sortMode.type === "metric" && sortMode.metric === "output" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("reasoning")}>
                    Reasoning{sortMode.type === "metric" && sortMode.metric === "reasoning" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("cacheRead")}>
                    Cache Read{sortMode.type === "metric" && sortMode.metric === "cacheRead" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="sort-button" onClick={() => updateSort("cacheWrite")}>
                    Cache Write{sortMode.type === "metric" && sortMode.metric === "cacheWrite" ? (sortMode.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th>{metricLabels[focusMetric]} Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TreeRow
                  key={row.node.id}
                  row={row}
                  focusMetric={focusMetric}
                  expanded={expanded.has(row.node.id)}
                  onToggle={toggleNode}
                  sessionMetricTotal={sessionMetricTotal}
                />
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="empty-state">
          <h2>No Session Loaded</h2>
          <p>Upload JSON exported from `GET /session/:id/message` to inspect token usage as a profiler-style call tree.</p>
          <p>Everything runs locally in your browser — no data is uploaded.</p>
        </section>
      )}
    </div>
  )
}
