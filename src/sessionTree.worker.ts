import { buildSessionTree } from "./tree"
import type { Message, SessionExport, TreeNode } from "./types"

type WorkerRequest = {
  type: "load-text"
  text: string
}

type WorkerResponse =
  | {
      type: "loaded"
      tree: TreeNode
    }
  | {
      type: "error"
      error: string
    }

function parseMessages(text: string): Message[] {
  const parsed = JSON.parse(text) as Message[] | SessionExport

  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.messages)) return parsed.messages

  throw new Error("Unsupported export format. Expected `opencode export` JSON with a top-level `messages` array.")
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    const messages = parseMessages(event.data.text)
    const tree = buildSessionTree(messages)
    const response: WorkerResponse = { type: "loaded", tree }
    self.postMessage(response)
  } catch (error) {
    const response: WorkerResponse = {
      type: "error",
      error: error instanceof Error ? error.message : "Unknown worker error",
    }
    self.postMessage(response)
  }
}
