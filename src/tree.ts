import type { FlatRow, Message, MetricKey, TokenStats, TreeNode } from "./types"

export type SortMode =
  | { type: "actual" }
  | { type: "metric"; metric: MetricKey; descending: boolean }

const numberFormatter = new Intl.NumberFormat("en-US")

export const metricLabels: Record<MetricKey, string> = {
  total: "Total",
  nonCachedTotal: "Non-Cached Total",
  input: "Input",
  output: "Output",
  reasoning: "Reasoning",
  cacheRead: "Cache Read",
  cacheWrite: "Cache Write",
}

export function zeroStats(): TokenStats {
  return {
    total: 0,
    nonCachedTotal: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }
}

function clampStats(stats: TokenStats): TokenStats {
  return {
    total: Math.max(0, stats.total),
    nonCachedTotal: Math.max(0, stats.nonCachedTotal),
    input: Math.max(0, stats.input),
    output: Math.max(0, stats.output),
    reasoning: Math.max(0, stats.reasoning),
    cacheRead: Math.max(0, stats.cacheRead),
    cacheWrite: Math.max(0, stats.cacheWrite),
  }
}

function sumStats(parts: TokenStats[]): TokenStats {
  return parts.reduce(
    (acc, part) => ({
      total: acc.total + part.total,
      nonCachedTotal: acc.nonCachedTotal + part.nonCachedTotal,
      input: acc.input + part.input,
      output: acc.output + part.output,
      reasoning: acc.reasoning + part.reasoning,
      cacheRead: acc.cacheRead + part.cacheRead,
      cacheWrite: acc.cacheWrite + part.cacheWrite,
    }),
    zeroStats(),
  )
}

function subtractStats(total: TokenStats, minus: TokenStats): TokenStats {
  return clampStats({
    total: total.total - minus.total,
    nonCachedTotal: total.nonCachedTotal - minus.nonCachedTotal,
    input: total.input - minus.input,
    output: total.output - minus.output,
    reasoning: total.reasoning - minus.reasoning,
    cacheRead: total.cacheRead - minus.cacheRead,
    cacheWrite: total.cacheWrite - minus.cacheWrite,
  })
}

function assistantStats(message: Extract<Message["info"], { role: "assistant" }>): TokenStats {
  const base = message.tokens
  const total =
    base.total ??
    base.input + base.output + base.reasoning + base.cache.read + base.cache.write

  return {
    total,
    nonCachedTotal: Math.max(0, total - base.cache.read - base.cache.write),
    input: base.input,
    output: base.output,
    reasoning: base.reasoning,
    cacheRead: base.cache.read,
    cacheWrite: base.cache.write,
  }
}

function makeNode(input: Omit<TreeNode, "self">): TreeNode {
  return {
    ...input,
    self: zeroStats(),
  }
}

function textLabel(text: string, fallback: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (!trimmed) return fallback
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed
}

function toolMeta(state: Record<string, unknown>): string | undefined {
  const status = typeof state.status === "string" ? state.status : undefined
  const title = typeof state.title === "string" && state.title ? state.title : undefined
  return [status, title].filter(Boolean).join(" - ") || undefined
}

function isTextPart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "text" }> {
  return part.type === "text"
}

function isReasoningPart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "reasoning" }> {
  return part.type === "reasoning"
}

function isToolPart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "tool" }> {
  return part.type === "tool"
}

function isFilePart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "file" }> {
  return part.type === "file"
}

function isPatchPart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "patch" }> {
  return part.type === "patch"
}

function isSubtaskPart(part: Message["parts"][number]): part is Extract<Message["parts"][number], { type: "subtask" }> {
  return part.type === "subtask"
}

function lastTextPartIndex(parts: Message["parts"]): number {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (isTextPart(parts[index])) return index
  }
  return -1
}

function buildAssistantChildren(message: Extract<Message["info"], { role: "assistant" }>, depth: number, messageParts: Message["parts"]): TreeNode[] {
  const stats = assistantStats(message)
  const children: TreeNode[] = []
  const finalTextIndex = lastTextPartIndex(messageParts)
  let reasoningBudget = stats.reasoning
  let outputBudget = stats.output

  for (const [index, part] of messageParts.entries()) {
    if (isReasoningPart(part)) {
      const reasoningValue = reasoningBudget
      reasoningBudget = 0
      children.push(
        makeNode({
          id: part.id,
          name: "Reasoning",
          type: "reasoning",
          order: index,
          stats: {
            total: reasoningValue,
            nonCachedTotal: reasoningValue,
            input: 0,
            output: 0,
            reasoning: reasoningValue,
            cacheRead: 0,
            cacheWrite: 0,
          },
          children: [],
          depth,
          startTime: part.time.start,
          endTime: part.time.end,
          meta: textLabel(part.text, "Reasoning"),
        }),
      )
      continue
    }

    if (isTextPart(part)) {
      const isFinal = index === finalTextIndex
      const outputValue = isFinal ? outputBudget : 0
      if (isFinal) outputBudget = 0
      children.push(
        makeNode({
          id: part.id,
          name: isFinal ? "Final Response" : "Commentary",
          type: isFinal ? "final-response" : "commentary",
          order: index,
          stats: {
            total: outputValue,
            nonCachedTotal: outputValue,
            input: 0,
            output: outputValue,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          children: [],
          depth,
          startTime: part.time?.start,
          endTime: part.time?.end,
          meta: textLabel(part.text, isFinal ? "Final Response" : "Commentary"),
        }),
      )
      continue
    }

    if (isToolPart(part)) {
      const state = (part.state ?? {}) as Record<string, unknown>
      const time = (state.time ?? {}) as { start?: number; end?: number }
      children.push(
        makeNode({
          id: part.id,
          name: `Tool: ${part.tool}`,
          type: "tool",
          order: index,
          stats: zeroStats(),
          children: [],
          depth,
          startTime: time.start,
          endTime: time.end,
          meta: toolMeta(state),
        }),
      )
    }

    if (isFilePart(part)) {
      children.push(
        makeNode({
          id: part.id,
          name: `Attachment: ${part.filename ?? part.mime}`,
          type: "file",
          order: index,
          stats: zeroStats(),
          children: [],
          depth,
        }),
      )
    }

    if (isPatchPart(part)) {
      children.push(
        makeNode({
          id: part.id,
          name: `Patch (${part.files.length})`,
          type: "patch",
          order: index,
          stats: zeroStats(),
          children: [],
          depth,
          meta: part.files[0],
        }),
      )
    }

    if (isSubtaskPart(part)) {
      children.push(
        makeNode({
          id: part.id,
          name: `Subtask: ${part.description || part.agent}`,
          type: "subtask",
          order: index,
          stats: zeroStats(),
          children: [],
          depth,
          meta: part.agent,
        }),
      )
    }
  }

  return children
}

function finalize(node: TreeNode): TreeNode {
  const children = node.children.map(finalize)
  const childTotals = sumStats(children.map((child) => child.stats))

  return {
    ...node,
    children,
    self: subtractStats(node.stats, childTotals),
  }
}

function promptName(index: number, text: string | undefined): string {
  return text ? `Prompt #${index + 1}: ${textLabel(text, "Prompt")}` : `Prompt #${index + 1}`
}

export function buildSessionTree(rawMessages: Message[]): TreeNode {
  const users = rawMessages.filter((message) => message.info.role === "user")
  const assistants = rawMessages.filter(
    (message): message is Message & { info: Extract<Message["info"], { role: "assistant" }> } => message.info.role === "assistant",
  )
  const byParent = new Map<string, Message[]>()

  for (const assistant of assistants) {
    const group = byParent.get(assistant.info.parentID)
    if (group) group.push(assistant)
    else byParent.set(assistant.info.parentID, [assistant])
  }

  const promptNodes = users.map((user, index) => {
    const promptText = user.parts.find(isTextPart)
    const assistantNodes = (byParent.get(user.info.id) ?? [])
      .sort((a, b) => a.info.time.created - b.info.time.created)
      .map((assistant, attemptIndex) => {
        const info = assistant.info
        if (info.role !== "assistant") return null
        const stats = assistantStats(info)
        return makeNode({
          id: info.id,
          name: `Assistant #${attemptIndex + 1} (${info.agent})`,
          type: "assistant",
          order: attemptIndex,
          stats,
          children: buildAssistantChildren(info, 2, assistant.parts),
          depth: 1,
          startTime: info.time.created,
          endTime: info.time.completed,
          meta: `${info.providerID}/${info.modelID}${info.finish ? ` - ${info.finish}` : ""}`,
        })
      })
      .filter((node): node is TreeNode => Boolean(node))

    const promptStats = sumStats(assistantNodes.map((node) => node.stats))

    return makeNode({
      id: user.info.id,
      name: promptName(index, promptText?.text),
      type: "prompt",
      order: index,
      stats: promptStats,
      children: assistantNodes,
      depth: 0,
      startTime: user.info.time.created,
    })
  })

  const sessionStats = sumStats(promptNodes.map((node) => node.stats))
  return finalize(
    makeNode({
      id: "session",
      name: "Session",
      type: "session",
      order: -1,
      stats: sessionStats,
      children: promptNodes,
      depth: -1,
    }),
  )
}

export function sortTree(node: TreeNode, sortMode: SortMode): TreeNode {
  const children = [...node.children]
    .sort((a, b) => {
      if (sortMode.type === "actual") {
        if (a.order !== b.order) return a.order - b.order
        return (a.startTime ?? 0) - (b.startTime ?? 0)
      }

      const direction = sortMode.descending ? -1 : 1
      const delta = a.stats[sortMode.metric] - b.stats[sortMode.metric]
      if (delta !== 0) return delta * direction
      if (a.order !== b.order) return a.order - b.order
      return a.name.localeCompare(b.name)
    })
    .map((child) => sortTree(child, sortMode))

  return { ...node, children }
}

export function flattenVisible(node: TreeNode, expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = []
  for (const child of node.children) {
    rows.push({ node: child, parent: node })
    if (child.children.length > 0 && expanded.has(child.id)) {
      rows.push(...flattenVisible(child, expanded))
    }
  }
  return rows
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value))
}

export function formatPercent(value: number, total: number): string {
  if (total <= 0) return "0%"
  return `${((value / total) * 100).toFixed(value >= total ? 0 : 1)}%`
}
