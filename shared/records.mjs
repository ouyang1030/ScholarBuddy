import { RECORD_STATUS_OPTIONS, RECORD_STATUS_ORDER } from "./constants.mjs";

// The Bridge sorts what it reads from the vault and the browser sorts what it
// has just saved. When only one of them knew the order, a record moved on the
// next reload instead of when it changed.
export function compareRecords(collection, a, b) {
  const order = RECORD_STATUS_ORDER[collection];
  if (order) {
    // A record with no status at all is in the state a new one opens in, and
    // "*" marks the slot a status this vocabulary does not know falls into;
    // without one it falls to the back of the list.
    const fallback = (RECORD_STATUS_OPTIONS[collection] || [])[0] || "";
    const unknown = order.indexOf("*");
    const rank = (record) => {
      const index = order.indexOf(record.status || fallback);
      if (index >= 0) return index;
      return unknown < 0 ? order.length : unknown;
    };
    const byStatus = rank(a) - rank(b);
    if (byStatus) return byStatus;
  }
  return (
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""))
  );
}
