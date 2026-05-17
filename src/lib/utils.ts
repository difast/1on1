import { differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";

export function daysSince(date: string | null | undefined): number {
  if (!date) return 999;
  return differenceInDays(new Date(), new Date(date));
}

export function urgencyLevel(days: number): "ok" | "soon" | "urgent" {
  if (days >= 14) return "urgent";
  if (days >= 7) return "soon";
  return "ok";
}

export const urgencyStyles = {
  ok:     { bg: "#EAF3DE", text: "#3B6D11", label: "Ок" },
  soon:   { bg: "#FAEEDA", text: "#854F0B", label: "Скоро" },
  urgent: { bg: "#FCEBEB", text: "#A32D2D", label: "Срочно" },
};

export const AVATAR_COLORS = [
  "#7F77DD", "#1D9E75", "#378ADD", "#D85A30",
  "#BA7517", "#D4537E", "#639922", "#E24B4A",
];

export function pickColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function initials(name: string) {
  return name.trim().split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export const moodLabels: Record<string, string> = {
  good: "😊 Хорошо",
  neutral: "😐 Нейтрально",
  bad: "😟 Тревожно",
};

export function formatDate(date: string) {
  return format(new Date(date), "d MMM yyyy", { locale: ru });
}

export function formatDateTime(date: string) {
  return format(new Date(date), "d MMM, HH:mm", { locale: ru });
}

export function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
