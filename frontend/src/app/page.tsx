"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  Reservation,
  Program,
  Slot,
  Status,
  ReservationFilterUI,
  ReservationCreatePayload,
} from "@/types/reservation";
import { isProgram, isSlot, getErrorMessage } from "@/types/reservation";
import CreateReservationModal from "@/components/CreateReservationModal";

// ============================================
// Next.js (App Router) page.tsx — api.phpに合わせた同期版 + カレンダー表示 + モーダル新規作成
// 変更点（2025-09-07）
// - カレンダーセル内「＋」とヘッダー「＋新規予約」からモーダルで作成
// - 予約作成は createReservation(payload) に集約、成功後その日付で一覧に反映
// - 既存のページ内フォームはコメントアウト（必要なら戻せる）
// ============================================

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

// ========= 日付ユーティリティ =========
const toDateStr = (d: string | Date) => {
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// === 休業日（週末）ユーティリティ ===
function dayOfWeekFromStr(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getDay(); // 0=日,6=土
}
function isWeekendStr(s: string): boolean {
  const dow = dayOfWeekFromStr(s);
  return dow === 0 || dow === 6;
}
function nextBusinessDay(from: Date = new Date()): string {
  const dt = new Date(from);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return toDateStr(dt);
}
function nextBusinessDayFromStr(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return nextBusinessDay(new Date(y, m - 1, d));
}

function buildMonthCells(cursor: Date, mondayStart = true) {
  const y = cursor.getFullYear?.() ?? cursor.getFullYear();
  const m = cursor.getMonth(); // 0-11
  const first = new Date(y, m, 1);
  const firstDow = first.getDay(); // 0=Sun
  const startOffset = (firstDow - (mondayStart ? 1 : 0) + 7) % 7; // 月起点
  const gridStart = new Date(y, m, 1 - startOffset);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return {
      dateStr: toDateStr(d),
      inMonth: d.getMonth() === m,
      y: d.getFullYear(),
      m: d.getMonth(),
      day: d.getDate(),
    };
  });
  return cells;
}

function formatMonthJP(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default function Page() {
  // ===== State
  const [items, setItems] = useState<Reservation[] | null>(null);          // 絞り込み一覧用
  const [allItems, setAllItems] = useState<Reservation[] | null>(null);    // カレンダー用（全体）
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 絞り込み（一覧用）
  const [filter, setFilter] = useState<ReservationFilterUI>(() => ({
    date: "",
    program: "",
    slot: "",
  }));

  // カレンダー: 表示中の月（1日固定）
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const monthCells = useMemo(() => buildMonthCells(calCursor, true), [calCursor]);
  const monthKey = useMemo(() => toDateStr(calCursor).slice(0, 7), [calCursor]); // YYYY-MM
  // カレンダーの表示対象（体験/見学）
  const [calProgram, setCalProgram] = useState<Program>("experience");

  // 予約作成モーダル
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>(undefined);
  const [createSlot, setCreateSlot] = useState<Slot | undefined>(undefined);
  const [createProgram, setCreateProgram] = useState<Program | undefined>(undefined);

  function openCreate(dateStr?: string, slot?: Slot) {
    // デフォルトは「次の平日」。土日が渡ってきた場合も平日に補正。
    const init = dateStr ?? nextBusinessDay();
    const safe = isWeekendStr(init) ? nextBusinessDayFromStr(init) : init;
    setCreateDate(safe);
    setCreateSlot(slot);
    setCreateProgram(calProgram); // ← 選択中を初期値に
    setIsCreateOpen(true);
  }

  // ===== Helpers
  const jstDateTime = (iso?: string) => {
    if (!iso) return "-";
    try {
      const dtf = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "medium",
        timeStyle: "short",
      });
      return dtf.format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (filter.date) params.set("date", filter.date);
    if (filter.program) params.set("program", filter.program);
    if (filter.slot) params.set("slot", filter.slot);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  // ===== API calls
  const fetchReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reservations${buildQuery()}` as string, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /reservations failed: ${res.status}`);
      const data: Reservation[] = await res.json();
      setItems(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // カレンダー用（全件 or サーバ側で最近分を返す想定）
  const fetchAllReservations = async () => {
    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /reservations failed: ${res.status}`);
      const data: Reservation[] = await res.json();
      setAllItems(data);
    } catch (e: unknown) {
      console.warn("fetchAllReservations:", getErrorMessage(e));
    }
  };

  // 初回ロード
  useEffect(() => {
    fetchReservations();
    fetchAllReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // カレンダー: 月が変わるたびに一応再フェッチ（新規が入ったかもしれないため）
  useEffect(() => {
    fetchAllReservations();
  }, [monthKey]);

  // filter が変わったら一覧を再取得（カレンダー/絞り込みの即時反映）
  useEffect(() => {
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.date, filter.program, filter.slot]);

  // ====== 新規作成（モーダルから呼ぶ）
  const createReservation = async (payload: ReservationCreatePayload) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!payload.date) throw new Error("日付を入力してください");

      const composedName =
        (payload.name && payload.name.trim()) ||
        `${payload.last_name ?? ""}${payload.first_name ? ` ${payload.first_name}` : ""}`.trim() ||
        "ゲスト";

      const body = { ...payload, name: composedName };

      const res = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.message || "その時間帯は埋まっています");
      }
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.message || `予約の作成に失敗しました（${res.status}）`);
      }

      const created: Reservation = await res.json();
      setSuccess("予約を作成しました");
      setItems((prev) => (prev ? [created, ...prev] : [created]));
      setAllItems((prev) => (prev ? [created, ...prev] : [created]));
      setFilter((f) => ({ ...f, date: toDateStr(created.date ?? payload.date) }));
      setIsCreateOpen(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // 既存の onSubmit（ページ内フォーム用）は未使用。残しておきたい場合は createReservation を呼ぶように変えてもOK。
  // const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => { ... }

  const updateStatus = async (id: number, status: Status) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/reservations/${id}`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 409) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.message || "その時間帯は埋まっています");
      }
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.message || `更新に失敗しました（${res.status}）`);
      }
      const updated: Reservation = await res.json();
      setItems((prev) => prev?.map((r) => (r.id === id ? updated : r)) ?? null);
      setAllItems((prev) => prev?.map((r) => (r.id === id ? updated : r)) ?? null);
      setSuccess("状態を更新しました");
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const deleteReservation = async (id: number) => {
    if (!confirm("この予約を削除しますか？")) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/reservations/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        throw new Error(js.message || `削除に失敗しました（${res.status}）`);
      }
      setItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
      setAllItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
      setSuccess("削除しました");
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  // ===== カレンダー用: 当月の予約を日付ごとに集計
  const dayMap = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    (allItems ?? []).forEach((r) => {
      // 体験/見学 切替の反映
      if (r.program !== calProgram) return;

      const ds = toDateStr(r.date);
      if (ds.startsWith(monthKey)) {
        (map[ds] ||= []).push(r);
      }
    });
    return map;
  }, [allItems, monthKey, calProgram]);

  // ===== UI
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold">Reservations Admin</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchReservations}
              className="px-4 py-2 rounded-2xl shadow bg-white hover:bg-gray-100 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "更新中…" : "更新"}
            </button>
            <button
              onClick={() => openCreate()}
              className="px-4 py-2 rounded-2xl shadow bg-black text-white hover:opacity-90"
            >
              ＋ 新規予約
            </button>
          </div>
        </header>

        {(error || success) && (
          <div className="space-y-2">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}
            {success && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</div>
            )}
          </div>
        )}

        {/* ===== カレンダー表示 ===== */}
        <section className="rounded-2xl bg-white shadow p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">カレンダー</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                onClick={() => setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                aria-label="前の月"
              >
                ←
              </button>
              <span className="min-w-[10ch] text-center text-sm text-gray-700">{formatMonthJP(calCursor)}</span>
              <button
                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                onClick={() => setCalCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                aria-label="次の月"
              >
                →
              </button>
              <button
                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                onClick={() => {
                  const t = new Date();
                  t.setDate(1);
                  setCalCursor(t);
                }}
              >
                今月
              </button>
              <div className="ml-2 inline-flex rounded-xl border overflow-hidden">
                <button
                  type="button"
                  className={"px-3 py-1 text-sm " + (calProgram === "experience" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50")}
                  onClick={() => setCalProgram("experience")}
                  aria-pressed={calProgram === "experience"}
                >
                  体験
                </button>
                <button
                  type="button"
                  className={"px-3 py-1 text-sm border-l " + (calProgram === "tour" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50")}
                  onClick={() => setCalProgram("tour")}
                  aria-pressed={calProgram === "tour"}
                >
                  見学
                </button>
              </div>
            </div>
          </div>

          {/* 曜日ヘッダー（月起点） — PC/タブレットのみ */}
          <div className="hidden md:grid grid-cols-7 text-xs text-gray-500">
            {["月", "火", "水", "木", "金", "土", "日"].map((w) => (
              <div key={w} className="p-2 text-center font-medium">{w}</div>
            ))}
          </div>

          {/* グリッド */}
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((cell) => {
              const dayItems = dayMap[cell.dateStr] ?? [];
              type SlotCounts = Record<Slot, number>;
              const counts = dayItems.reduce<SlotCounts>(
                (acc, r) => {
                  acc[r.slot] = (acc[r.slot] ?? 0) + 1;
                  return acc;
                },
                { am: 0, pm: 0, full: 0 }
              );
              const total = dayItems.length;
              const isToday = cell.dateStr === toDateStr(new Date());
              const isWeekendCell = isWeekendStr(cell.dateStr);
              return (
                <div
                  key={cell.dateStr}
                  className={
                    "relative h-24 rounded-xl border p-2 text-left transition cursor-pointer " +
                    (cell.inMonth ? "bg-white" : "bg-gray-50") +
                    (isToday ? " ring-2 ring-blue-500" : "")
                  }
                  onClick={() => {
                    setFilter((f) => ({ ...f, date: cell.dateStr, program: calProgram }));
                  }}
                  title={`${cell.dateStr}の予約を一覧で表示`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between">
                    <span className={"text-sm " + (cell.inMonth ? "text-gray-900" : "text-gray-400")}>{cell.day}</span>
                    {total > 0 && (
                      <span className="text-[11px] rounded-full px-2 py-0.5 border bg-gray-50">{total}</span>
                    )}
                  </div>

                  {/* スロット別バッジ */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {counts.full > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md border">FULL×{counts.full}</span>
                    )}
                    {counts.am > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md border">AM×{counts.am}</span>
                    )}
                    {counts.pm > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md border">PM×{counts.pm}</span>
                    )}
                  </div>

                  {/* 先頭の1件だけ名前を薄く出す（多すぎると崩れるので）*/}
                  {dayItems[0] && (
                    <div className="mt-1 text-[11px] text-gray-500 truncate" aria-hidden>
                      {(dayItems[0].last_name ?? "") + (dayItems[0].first_name ? ` ${dayItems[0].first_name}` : "")}
                      {dayItems.length > 1 ? ` 他${dayItems.length - 1}件` : ""}
                    </div>
                  )}

                  {/* ➕ 新規作成（右下固定） ※ button ネスト回避のため span で */}
                  {/* 右下：平日=「＋」 / 週末=「休」 */}
                  {!isWeekendCell ? (
                    <span
                      className="absolute right-1 bottom-1 inline-flex items-center justify-center h-6 w-6 rounded-full border text-xs bg-white hover:bg-gray-50"
                      aria-label={`${cell.dateStr} に予約を追加`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreate(cell.dateStr);
                      }}
                      title="この日に予約を追加"
                      role="button"
                      tabIndex={0}
                    >
                      ＋
                    </span>
                  ) : (
                    <span
                      className="absolute right-1 bottom-1 inline-flex items-center justify-center h-6 w-6 rounded-full border text-xs text-gray-400 bg-gray-50 cursor-not-allowed"
                      title="土日は休業日のため新規は作成できません"
                      aria-disabled="true"
                    >
                      休
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-gray-500">クリックでその日の予約を下の一覧に反映します。右下「＋」でその日に新規作成。</p>
        </section>

        {/* ===== 検索/絞り込み（一覧） ===== */}
        {/* ここに一覧テーブルなどを置く想定（省略） */}

        {/* ===== 旧：ページ内「作成フォーム」（モーダル化したので停止） ===== */}
        {/*
        <section className="grid md:grid-cols-2 gap-6">
          <form onSubmit={onSubmit} className="rounded-2xl bg-white shadow p-5 space-y-4">
            ...（旧フォーム）...
          </form>
        </section>
        */}

        <footer className="text-xs text-gray-500 pt-4">API: <code>{API_BASE}</code></footer>
      </div>

      {/* 予約作成モーダル（components 化） */}
      <CreateReservationModal
        open={isCreateOpen}
        initialDate={createDate}
        initialSlot={createSlot}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={createReservation}
      />
    </div>
  );
}
