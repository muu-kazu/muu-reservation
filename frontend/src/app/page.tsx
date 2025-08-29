"use client";

import React, { useEffect, useMemo, useState } from "react";

// ============================================
// Next.js (App Router) page.tsx — api.phpに合わせた同期版
// 仕様:
// - 一覧:   GET   /api/reservations?date=YYYY-MM-DD&program=tour|experience&slot=am|pm|full
// - 作成:   POST  /api/reservations (date, program, slot, name[, contact, note, room])
// - 更新:   PATCH /api/reservations/{id} (status=`booked|cancelled|done` など)
// - 削除:   DELETE /api/reservations/{id}
// - CORS:   DevCorsミドルウェア+OPTIONS対応（api.php側）
// ============================================

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://muu-reservation.onrender.com/api";

// Types
export type Slot = "am" | "pm" | "full";
export type Program = "tour" | "experience";
export type Status = "booked" | "cancelled" | "done";

export interface Reservation {
  id?: number;
  date: string; // YYYY-MM-DD (Eloquentのcast次第でISO文字列の場合も)
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
}

export default function Page() {
  // ===== State
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 作成フォーム初期化: 明日の日付
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [form, setForm] = useState<Reservation>({
    date: tomorrow,
    program: "experience",
    slot: "am",
    name: "",
  });

  // 絞り込み
  const [filter, setFilter] = useState<{ date?: string; program?: Program | ""; slot?: Slot | ""; }>(() => ({
    date: "",
    program: "",
    slot: "",
  }));

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
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!form.name.trim()) throw new Error("お名前を入力してください");
      if (!form.date) throw new Error("日付を入力してください");

      const res = await fetch(`${API_BASE}/reservations`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          program: form.program,
          slot: form.slot,
          name: form.name,
          // contact: form.contact ?? undefined,
          // note: form.note ?? undefined,
          // room: form.room ?? undefined,
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
      setForm((f) => ({ ...f, name: "" }));
    } catch (e: any) {
      setError(e.message || String(e));
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
      setSuccess("状態を更新しました");
    } catch (e: any) {
      setError(e.message || String(e));
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
      setSuccess("削除しました");
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  // ===== UI
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
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

        {/* 検索/絞り込み */}
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
                value={filter.program}
                onChange={(e) => setFilter((f) => ({ ...f, program: e.target.value as any }))}
              >
                <option value="">すべて</option>
                <option value="tour">tour</option>
                <option value="experience">experience</option>
              </select>
            </label>
            <label className="block text-sm">時間帯
              <select
                className="mt-1 w-full rounded-xl border p-2"
                value={filter.slot}
                onChange={(e) => setFilter((f) => ({ ...f, slot: e.target.value as any }))}
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
                  onChange={(e) => setForm({ ...form, program: e.target.value as Program })}
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
                  onChange={(e) => setForm({ ...form, slot: e.target.value as Slot })}
                  required
                >
                  <option value="am">午前 (am)</option>
                  <option value="pm">午後 (pm)</option>
                  <option value="full">全日 (full)</option>
                </select>
              </label>
              <label className="block text-sm md:col-span-2">お名前
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border p-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="山田 太郎"
                  required
                />
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
              <p className="text-xs text-gray-500">時間帯の一意制約により、重複時は409を返します。</p>
            </div>
          </form>

          {/* 一覧 */}
          <div className="rounded-2xl bg-white shadow p-5">
            <h2 className="text-lg font-medium mb-3">予約一覧</h2>
            {!items ? (
              <p className="text-sm text-gray-500">読み込み中…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-500">予約はまだありません。</p>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">日付</th>
                      <th className="py-2 pr-3">プログラム</th>
                      <th className="py-2 pr-3">時間帯</th>
                      <th className="py-2 pr-3">氏名</th>
                      <th className="py-2 pr-3">開始</th>
                      <th className="py-2 pr-3">終了</th>
                      <th className="py-2 pr-3">状態</th>
                      <th className="py-2 pr-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={`${r.id ?? r.date + "-" + r.slot}`} className="border-t align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">{r.id ?? "-"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{typeof r.date === "string" ? r.date.slice(0,10) : String(r.date)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.program}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.slot}</td>
                        <td className="py-2 pr-3">{r.name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{jstDateTime(r.start_at)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{jstDateTime(r.end_at)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.status ?? "-"}</td>
                        <td className="py-2 pr-3">
                          {r.id && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => updateStatus(r.id!, "booked")}
                                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                                title="予約に戻す"
                              >booked</button>
                              <button
                                onClick={() => updateStatus(r.id!, "cancelled")}
                                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                              >cancelled</button>
                              <button
                                onClick={() => updateStatus(r.id!, "done")}
                                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
                              >done</button>
                              <button
                                onClick={() => deleteReservation(r.id!)}
                                className="px-3 py-1 rounded-xl border text-red-600 hover:bg-red-50"
                              >削除</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <footer className="text-xs text-gray-500 pt-4">API: <code>{API_BASE}</code></footer>
      </div>
    </div>
  );
}
