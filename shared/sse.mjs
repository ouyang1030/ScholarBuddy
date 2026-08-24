function frameBoundary(buffer) {
  const match = /\r?\n\r?\n/.exec(buffer);
  return match ? { index: match.index, length: match[0].length } : null;
}

function parseFrame(frame) {
  const event = frame.match(/^event:\s*(.+)$/m)?.[1]?.trim() || "message";
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  return data ? { event, payload: JSON.parse(data) } : null;
}

// Fetch is used instead of EventSource because Bridge pairing requires an
// Authorization header. A successful stream has exactly one terminal done
// frame; EOF by itself is a protocol failure.
/**
 * @param {ReadableStream<Uint8Array>} body
 * @param {(event: string, payload: any) => void} [onEvent]
 * @returns {Promise<any>}
 */
export async function readEventStream(body, onEvent = () => {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = null;
  let completed = false;

  const consume = (frame) => {
    const parsed = parseFrame(frame);
    if (!parsed) return;
    if (completed) throw new Error("AI stream sent data after completion.");
    if (parsed.event === "failed") throw new Error(parsed.payload?.error || "Workflow failed.");
    if (parsed.event === "done") {
      terminal = parsed.payload;
      completed = true;
      return;
    }
    onEvent(parsed.event, parsed.payload);
  };

  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = frameBoundary(buffer);
    while (boundary) {
      consume(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary.length);
      boundary = frameBoundary(buffer);
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!completed) throw new Error("AI stream ended before completion.");
  return terminal;
}
