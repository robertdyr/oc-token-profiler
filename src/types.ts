export type TokenStats = {
  total: number
  nonCachedTotal: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export type MetricKey = keyof TokenStats

export type MessageInfo =
  | {
      role: "user"
      id: string
      sessionID: string
      time: { created: number }
      agent?: string
      model?: { providerID: string; modelID: string; variant?: string }
      summary?: unknown
    }
  | {
      role: "assistant"
      id: string
      sessionID: string
      parentID: string
      time: { created: number; completed?: number }
      agent: string
      mode?: string
      modelID: string
      providerID: string
      finish?: string
      cost: number
      tokens: {
        total?: number
        input: number
        output: number
        reasoning: number
        cache: { read: number; write: number }
      }
      error?: unknown
    }

export type Part =
  | { type: "text"; id: string; text: string; time?: { start: number; end?: number }; metadata?: Record<string, unknown> }
  | { type: "reasoning"; id: string; text: string; time: { start: number; end?: number }; metadata?: Record<string, unknown> }
  | { type: "tool"; id: string; tool: string; callID: string; state: Record<string, unknown>; metadata?: Record<string, unknown> }
  | { type: "step-start"; id: string; snapshot?: string }
  | { type: "step-finish"; id: string; reason: string; cost: number; snapshot?: string; tokens: { total?: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } } }
  | { type: "patch"; id: string; hash: string; files: string[] }
  | { type: "file"; id: string; mime: string; filename?: string; url: string; source?: Record<string, unknown> }
  | { type: "subtask"; id: string; prompt: string; description: string; agent: string; model?: { providerID: string; modelID: string }; command?: string }
  | { type: "agent"; id: string; name: string; source?: { value: string; start: number; end: number } }
  | { type: "retry"; id: string; attempt: number; error: unknown; time: { created: number } }
  | { type: "compaction"; id: string; auto: boolean; overflow?: boolean }
  | { type: "snapshot"; id: string; snapshot: string }
  | { type: string; id: string; [key: string]: unknown }

export type Message = {
  info: MessageInfo
  parts: Part[]
}

export type TreeNode = {
  id: string
  name: string
  type: string
  order: number
  stats: TokenStats
  self: TokenStats
  children: TreeNode[]
  depth: number
  startTime?: number
  endTime?: number
  meta?: string
}

export type FlatRow = {
  node: TreeNode
  parent: TreeNode
}
