import type { CommitNode } from '~/stores/repo'

// Per-theme lane colours (--lane-0…7 in main.css; ≥3:1 against the background).
export const GRAPH_COLORS = Array.from({ length: 8 }, (_, i) => `rgb(var(--lane-${i}))`)

export interface GraphNode {
  hash: string
  row: number
  col: number
  color: string
}

export interface GraphEdge {
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  color: string
}

export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colByHash: Record<string, number>
  rowByHash: Record<string, number>
  maxCol: number
}

/**
 * Assign each commit to a column (lane) for a GitKraken-style graph.
 *
 * Commits arrive newest-first. We keep a set of "lanes"; each lane reserves the
 * hash of the commit expected to appear next as we walk downward. A commit takes
 * a lane that already reserved it (its child sits above in that lane) or a free
 * lane otherwise. Its first parent then continues straight down in the same lane;
 * additional parents (merges) claim new lanes.
 */
export function computeGraph(commits: CommitNode[]): GraphLayout {
  const lanes: (string | null)[] = []
  const colByHash: Record<string, number> = {}
  const rowByHash: Record<string, number> = {}
  const nodes: GraphNode[] = []
  let maxCol = 0

  const firstFree = () => {
    const i = lanes.findIndex((h) => h === null)
    if (i !== -1) return i
    lanes.push(null)
    return lanes.length - 1
  }

  commits.forEach((c, row) => {
    rowByHash[c.hash] = row

    let col = lanes.findIndex((h) => h === c.hash)
    if (col === -1) col = firstFree()

    colByHash[c.hash] = col
    nodes.push({ hash: c.hash, row, col, color: GRAPH_COLORS[col % GRAPH_COLORS.length] })

    // Free any other lanes that were also reserved for this commit (merges).
    for (let i = 0; i < lanes.length; i++) {
      if (i !== col && lanes[i] === c.hash) lanes[i] = null
    }

    const [first, ...others] = c.parents
    if (first) {
      lanes[col] = first
    } else {
      lanes[col] = null
    }
    for (const p of others) {
      let pc = lanes.findIndex((h) => h === p)
      if (pc === -1) pc = firstFree()
      lanes[pc] = p
    }

    maxCol = Math.max(maxCol, lanes.length - 1)
  })

  // Build edges from each commit to each of its parents.
  const edges: GraphEdge[] = []
  for (const c of commits) {
    const fromRow = rowByHash[c.hash]
    const fromCol = colByHash[c.hash]
    for (const p of c.parents) {
      const toRow = rowByHash[p]
      if (toRow === undefined) continue // parent outside the loaded window
      const toCol = colByHash[p]
      // Merge edges (second+ parents) take the parent's color; the mainline keeps
      // the child's color for a continuous trunk.
      const color =
        toCol === fromCol
          ? GRAPH_COLORS[fromCol % GRAPH_COLORS.length]
          : GRAPH_COLORS[toCol % GRAPH_COLORS.length]
      edges.push({ fromCol, fromRow, toCol, toRow, color })
    }
  }

  return { nodes, edges, colByHash, rowByHash, maxCol }
}
