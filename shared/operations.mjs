import { recordClosed } from "./records.mjs";

// Reading order also defines the desktop grid: importance rises upwards and
// urgency to the right. Keep the stored values independent of interface language.
/** @type {readonly ["schedule", "do", "defer", "delegate"]} */
export const OPERATION_QUADRANTS = ["schedule", "do", "defer", "delegate"];

/** @param {unknown} value */
export function operationQuadrant(value) {
  return OPERATION_QUADRANTS.find((quadrant) => quadrant === value) || "";
}

// An operation closes exactly as every other record does.
export const operationFinished = recordClosed;

/**
 * @template {{id: string, status?: string, dueDate?: string, updatedAt?: string, createdAt?: string}} T
 * @param {T[]} operations
 * @returns {T[]}
 */
export function sortOperations(operations) {
  return [...operations].sort((a, b) => {
    const aDone = operationFinished(a);
    const bDone = operationFinished(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!aDone) {
      if (a.dueDate && b.dueDate) {
        const dateOrder = a.dueDate.localeCompare(b.dueDate);
        if (dateOrder) return dateOrder;
      } else if (a.dueDate || b.dueDate) return a.dueDate ? -1 : 1;
    }
    return (
      (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "") ||
      a.id.localeCompare(b.id)
    );
  });
}
