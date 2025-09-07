"use client";

import React, { useEffect, useMemo, useState } from "react";

// ============================================
// Next.js (App Router) page.tsx — api.phpに合わせた同期版 + カレンダー表示
// 変更点（2025-09-07）
// - API_BASE のデフォルトをローカル (http://localhost:8000/api) に変更
// - 絞り込み/作成フォーム program/slot バインドを修正
// - カレンダー連動で filter を更新
// - フォームから「お名前」を削除
// - tour の場合は slot=full を選べない（UI/状態ともに矯正）
// - 一覧テーブルを入力項目（姓/名/メール/電話/手帳/受給者証）に合わせて拡張
// ============================================

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

// Types
export type Slot = "am" | "pm" | "full";
export type Program = "tour" | "experience";
export type Status = "booked" | "cancelled" | "done";

export interface Reservation {
  id?: number;
  date: string; // YYYY-MM-DD (Eloquent の cast 次第で ISO 文字列の場合も)
  program: Program;
  slot: Slot;
  name: string;
  status?: Status;
  start_at?: string; // ISO
  end_at?: string;   // ISO
  contact?: string | null;
  note?: string | null;
  room?: string | null;
  created_at?: string;
  updated_at?: string;
  last_name?: string | null;
  first_name?: string | null;
  email?: string | null;
  phone?: string | null;
  notebook_type?: string | null;
  has_certificate?: boolean | null;
}

// ========= type guards / utils =========
function isProgram(v: string): v is Program {
  return v === "tour" || v === "experience";
}
function isSlot(v: string): v is Slot {
  return v === "am" || v === "pm" || v === "full";
}
function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

// ========= 日付ユーティリティ =========
const toDateStr = (d: string | Date) => {
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

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

  // 作成フォーム初期化: 明日の日付
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }, []);

  const [form, setForm] = useState<Reservation>({
    date: tomorrow,
    program: "experience",
    slot: "am",
    name: "", // 送信時に null に変換（お名前入力欄は削除）
    last_name: "",
    first_name: "",
    email: "",
    phone: "",
    notebook_type: "",
    has_certificate: false,
  });

  // 絞り込み（一覧用）
  const [filter, setFilter] = useState<{ date?: string; program?: Program | ""; slot?: Slot | ""; }>(() => ({
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

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!form.date) throw new Error("日付を入力してください");

      const res = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          program: form.program,
          slot: form.slot,
          // 名前は送らない/またはnullにする（バックエンドが任意を許容）
          name:
            (form.last_name?.trim() || form.first_name?.trim())
              ? `${(form.last_name ?? '').trim()}${form.first_name?.trim() ? ' ' + form.first_name.trim() : ''}`
              : 'ゲスト',
          last_name: form.last_name || null,
          first_name: form.first_name || null,
          email: form.email || null,
          phone: form.phone || null,
          notebook_type: form.notebook_type || null,
          has_certificate: !!form.has_certificate,
          note: form.note ?? null,
          room: form.room ?? null,
        }),
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
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

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

  // tour のとき slot=full を避ける矯正
  useEffect(() => {
    if (form.program === "tour" && form.slot === "full") {
      setForm((f) => ({ ...f, slot: "am" }));
    }
  }, [form.program, form.slot]);

  // ===== カレンダー用: 当月の予約を日付ごとに集計
  const dayMap = useMemo(() => {
    const map: Record<string, Reservation[]> = {};
    (allItems ?? []).forEach((r) => {
      const ds = toDateStr(r.date);
      if (ds.startsWith(monthKey)) {
        (map[ds] ||= []).push(r);
      }
    });
    return map;
  }, [allItems, monthKey]);

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
            <div className="flex items-center gap-2">
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
                onClick={() => setCalCursor(() => { const t = new Date(); t.setDate(1); return t; })}
              >
                今月
              </button>
            </div>
          </div>

          {/* 曜日ヘッダー（月起点）*/}
          <div className="grid grid-cols-7 text-xs text-gray-500">
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
              return (
                <button
                  key={cell.dateStr}
                  className={
                    "relative h-24 rounded-xl border p-2 text-left transition " +
                    (cell.inMonth ? "bg-white" : "bg-gray-50") +
                    (isToday ? " ring-2 ring-blue-500" : "")
                  }
                  onClick={() => {
                    setFilter((f) => ({ ...f, date: cell.dateStr }));
                  }}
                  title={`${cell.dateStr}の予約を一覧で表示`}
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
                </button>
              );
            })}
          </div>

          <p className="text-xs text-gray-500">
            クリックでその日の予約を下の一覧に反映します。
          </p>
        </section>

        {/* ===== 検索/絞り込み（一覧） ===== */}
        <section className="rounded-2xl bg-white shadow p-5 space-y-4">
          <h2 className="text-lg font-medium">絞り込み</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <label className="block text-sm">日付
              <input
                type="date"
                className="mt-1 w-full rounded-xl border p-2"
                value={filter.date ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className="block text-sm">プログラム
              <select
                className="mt-1 w-full rounded-xl border p-2"
                value={filter.program ?? ""}
                onChange={(e) => setFilter((f) => ({
                  ...f,
                  program: e.target.value === "" ? "" : (isProgram(e.target.value) ? e.target.value : f.program),
                }))}
              >
                <option value="">すべて</option>
                <option value="tour">tour</option>
                <option value="experience">experience</option>
              </select>
            </label>
            <label className="block text-sm">時間帯
              <select
                className="mt-1 w-full rounded-xl border p-2"
                value={filter.slot ?? ""}
                onChange={(e) => setFilter((f) => ({
                  ...f,
                  slot: e.target.value === "" ? "" : (isSlot(e.target.value) ? e.target.value : f.slot),
                }))}
              >
                <option value="">すべて</option>
                <option value="am">am</option>
                <option value="pm">pm</option>
                <option value="full">full</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                onClick={fetchReservations}
                className="w-full px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90"
              >
                検索
              </button>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6">
          {/* 作成フォーム */}
          <form onSubmit={onSubmit} className="rounded-2xl bg-white shadow p-5 space-y-4">
            <h2 className="text-lg font-medium">新規予約</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">日付
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border p-2"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </label>
              <label className="block text-sm">プログラム
                <select
                  className="mt-1 w-full rounded-xl border p-2"
                  value={form.program}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    program: isProgram(e.target.value) ? e.target.value : f.program,
                    // tour で full を選べないよう、切り替え時の矯正
                    slot: e.target.value === 'tour' && f.slot === 'full' ? 'am' : f.slot,
                  }))}
                  required
                >
                  <option value="experience">experience</option>
                  <option value="tour">tour</option>
                </select>
              </label>
              <label className="block text-sm">時間帯
                <select
                  className="mt-1 w-full rounded-xl border p-2"
                  value={form.slot}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    slot: isSlot(e.target.value) ? e.target.value : f.slot,
                  }))}
                  required
                >
                  {/* tour は am/pm のみ、experience は am/pm/full */}
                  {form.program === "tour" ? (
                    <>
                      <option value="am">午前 (am)</option>
                      <option value="pm">午後 (pm)</option>
                    </>
                  ) : (
                    <>
                      <option value="am">午前 (am)</option>
                      <option value="pm">午後 (pm)</option>
                      <option value="full">全日 (full)</option>
                    </>
                  )}
                </select>
              </label>
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">姓（last_name）
                <input className="mt-1 w-full rounded-xl border p-2"
                  value={form.last_name ?? ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </label>
              <label className="block text-sm">名（first_name）
                <input className="mt-1 w-full rounded-xl border p-2"
                  value={form.first_name ?? ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </label>
            </div>
            <label className="block text-sm">メールアドレス
              <input type="email" className="mt-1 w-full rounded-xl border p-2"
                value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="block text-sm">電話番号
              <input className="mt-1 w-full rounded-xl border p-2"
                value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">手帳の種別（notebook_type）
                <input className="mt-1 w-full rounded-xl border p-2"
                  value={form.notebook_type ?? ""} onChange={(e) => setForm({ ...form, notebook_type: e.target.value })} />
              </label>
              <label className="block text-sm">受給者証の有無（has_certificate）
                <div className="mt-1 flex items-center gap-2">
                  <input type="checkbox" checked={!!form.has_certificate}
                    onChange={(e) => setForm({ ...form, has_certificate: e.target.checked })} />
                  <span className="text-sm text-gray-600">あり</span>
                </div>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "送信中…" : "予約を作成"}
              </button>
              <p className="text-xs text-gray-500">tour は全日不可（am/pmのみ）に自動制御。</p>
            </div>
          </form>


        </section>

        <footer className="text-xs text-gray-500 pt-4">API: <code>{API_BASE}</code></footer>
      </div >
    </div >
  );
}
