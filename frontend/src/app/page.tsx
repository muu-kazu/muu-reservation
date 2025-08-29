'use client'

import React, { useEffect, useMemo, useState } from 'react'

// =============================
// Next.js (App Router) page.tsx
// 同期版: "room" を廃止
// - 一覧: GET /api/reservations
// - 作成: POST /api/reservations
// - 重複: 日付の一意制約(409)
// =============================

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'https://muu-reservation.onrender.com/api'

// Types
type Slot = 'am' | 'pm' | 'full'
interface Reservation {
  id?: number
  date: string // YYYY-MM-DD
  program: string
  slot: Slot
  name: string
  status?: string
  start_at?: string
  end_at?: string
  contact?: string | null
  note?: string | null
  created_at?: string
  updated_at?: string
}

export default function Page() {
  const [items, setItems] = useState<Reservation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const tomorrow = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [])

  const [form, setForm] = useState<Reservation>({
    date: tomorrow,
    program: 'experience',
    slot: 'am',
    name: '',
  })

  // Helpers
  const jstDateTime = (iso?: string) => {
    if (!iso) return '-'
    try {
      const dtf = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      return dtf.format(new Date(iso))
    } catch {
      return iso
    }
  }

  const fetchReservations = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/reservations`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`GET /reservations failed: ${res.status}`)
      const data: Reservation[] = await res.json()
      setItems(data)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReservations() }, [])

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      if (!form.name.trim()) throw new Error('お名前を入力してください')
      if (!form.date) throw new Error('日付を入力してください')

      const res = await fetch(`${API_BASE}/reservations`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          program: form.program,
          slot: form.slot,
          name: form.name,
        }),
      })

      if (res.status === 409) {
        const js = await res.json().catch(() => ({}))
        throw new Error(js.message || '同じ日付の予約が既にあります。')
      }
      if (!res.ok) {
        const js = await res.json().catch(() => ({}))
        throw new Error(js.message || `予約の作成に失敗しました（${res.status}）`)
      }

      const created: Reservation = await res.json()
      setSuccess('予約を作成しました')
      setItems((prev: Reservation[] | null) => (prev ? [created, ...prev] : [created]))
      setForm((f: Reservation) => ({ ...f, name: '' }))
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-semibold">Reservations Admin</h1>
          <button onClick={fetchReservations} className="px-4 py-2 rounded-2xl shadow bg-white hover:bg-gray-100 disabled:opacity-50" disabled={loading}>
            {loading ? '更新中…' : '更新'}
          </button>
        </header>

        {error && (<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>)}
        {success && (<div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{success}</div>)}

        <section className="grid md:grid-cols-2 gap-6">
          {/* Form */}
          <form onSubmit={onSubmit} className="rounded-2xl bg-white shadow p-5 space-y-4">
            <h2 className="text-lg font-medium">新規予約</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">日付
                <input type="date" className="mt-1 w-full rounded-xl border p-2" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </label>
              <label className="block text-sm">プログラム
                <input type="text" className="mt-1 w-full rounded-xl border p-2" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="experience" required />
              </label>
              <label className="block text-sm">時間帯
                <select className="mt-1 w-full rounded-xl border p-2" value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as Slot })} required>
                  <option value="am">午前 (am)</option>
                  <option value="pm">午後 (pm)</option>
                  <option value="full">全日 (full)</option>
                </select>
              </label>
              <label className="block text-sm md:col-span-2">お名前
                <input type="text" className="mt-1 w-full rounded-xl border p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="山田 太郎" required />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90 disabled:opacity-50">
                {submitting ? '送信中…' : '予約を作成'}
              </button>
              <p className="text-xs text-gray-500">同じ<strong>日付</strong>は 409 でエラー表示します。</p>
            </div>
          </form>

          {/* List */}
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
                      <th className="py-2 pr-3">時間帯</th>
                      <th className="py-2 pr-3">氏名</th>
                      <th className="py-2 pr-3">開始</th>
                      <th className="py-2 pr-3">終了</th>
                      <th className="py-2 pr-3">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={`${r.id ?? r.date + '-' + r.slot}`} className="border-t">
                        <td className="py-2 pr-3">{r.id ?? '-'}</td>
                        <td className="py-2 pr-3">{r.date}</td>
                        <td className="py-2 pr-3">{r.slot}</td>
                        <td className="py-2 pr-3">{r.name}</td>
                        <td className="py-2 pr-3">{jstDateTime(r.start_at)}</td>
                        <td className="py-2 pr-3">{jstDateTime(r.end_at)}</td>
                        <td className="py-2 pr-3">{r.status ?? '-'}</td>
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
  )
}
