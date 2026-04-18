import { buildSessionTree } from "./tree"
import type { Message, TreeNode } from "./types"

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
  return JSON.parse(text) as Message[]
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
