// Mermaid keeps its renderer configuration globally; initialize and render must stay together.
export function createMermaidRenderQueue() {
  let tail: Promise<void> = Promise.resolve()

  return function render<T>(task: () => Promise<T>, isObsolete?: () => boolean): Promise<T> {
    const current = tail.then(() => {
      if (isObsolete?.()) throw new Error('已跳过过期的 Mermaid 渲染。')
      return task()
    })
    // A failed render must not block the next diagram in the queue.
    tail = current.then(() => {}, () => {})
    return current
  }
}
