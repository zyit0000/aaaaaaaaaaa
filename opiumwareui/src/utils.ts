// src/utils.ts
import { Note } from "./types";

/** Generate a simple UUID v4 without external library (crypto.randomUUID available on WebKit 15.4+) */
export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older WebKit (Catalina ships WebKit 605)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Extract first line as note title, rest as preview */
export function parseNote(body: string): { title: string; preview: string } {
  const lines = body.split("\n").filter(Boolean);
  const title = lines[0] ?? "New Note";
  const preview = lines[1] ?? "No additional text";
  return { title, preview };
}

/** Format date like macOS Notes: "Today 6:33 PM" or "1/7/26" */
export function formatNoteDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  });
}

/** Group notes by Today / Month-Year buckets */
export function groupNotesByDate(notes: Note[]): { label: string; notes: Note[] }[] {
  const today = new Date();

  const groups: Map<string, Note[]> = new Map();

  for (const note of notes) {
    const d = new Date(note.updatedAt);
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();

    const label = sameDay
      ? "Today"
      : d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(note);
  }

  return Array.from(groups.entries()).map(([label, notes]) => ({
    label,
    notes,
  }));
}