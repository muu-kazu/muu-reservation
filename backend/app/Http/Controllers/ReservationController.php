<?php

namespace App\Http\Controllers;

use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class ReservationController extends Controller
{
    /** 一覧 */
    public function index()
    {
        $items = Reservation::orderBy('date')->get();

        return response()->json(
            $items,
            200,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    /** 1件取得 */
    public function show($id)
    {
        $res = Reservation::findOrFail($id);

        return response()->json(
            $res,
            200,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    /** 予約作成（フロントの POST に対応） */
    public function store(Request $request)
    {
        // 基本バリデーション
        $data = $request->validate([
            'date'    => ['required', 'date'],
            'program' => ['required', 'string', 'in:tour,experience'],
            'slot'    => ['required', 'string'], // 詳細は後段で条件分岐
            // room は保存してもOK（ロジックでは未使用）
            'room'    => ['nullable', 'string', 'max:16'],

            'name'            => ['nullable', 'string', 'max:191'],
            'last_name'       => ['nullable', 'string', 'max:191'],
            'first_name'      => ['nullable', 'string', 'max:191'],
            'email'           => ['nullable', 'email', 'max:191'],
            'phone'           => ['nullable', 'string', 'max:32'],
            'notebook_type'   => ['nullable', 'string', 'max:32'],
            'has_certificate' => ['nullable', 'boolean'],
            'note'            => ['nullable', 'string', 'max:2000'],
            'status'          => ['nullable', 'string', 'in:booked,cancelled'],
        ]);

        // program に応じた slot の許容値をチェック
        $slotRules = $data['program'] === 'tour'
            ? ['am', 'pm']              // tour は full 禁止
            : ['am', 'pm', 'full'];     // experience は full 可

        $request->validate([
            'slot' => [Rule::in($slotRules)],
        ]);

        // 既定値
        $data['status'] = $data['status'] ?? 'booked';
        $data['has_certificate'] = (bool)($data['has_certificate'] ?? false);

        // JST→UTC の時間窓を算出
        [$startAt, $endAt] = $this->calcWindow($data['date'], $data['program'], $data['slot']);
        $startAt = $startAt->toImmutable();
        $endAt   = $endAt->toImmutable();

        $data['start_at'] = $startAt;
        $data['end_at']   = $endAt;

        // === 同一JST日のUTC境界 ===
        $tz = 'Asia/Tokyo';
        $jstDayStartUtc = Carbon::parse($data['date'].' 00:00:00', $tz)->utc()->toImmutable();
        $jstDayEndUtc   = $jstDayStartUtc->addDay();

        // ▼ 重複チェック（同一JST日 × status=booked × 時間重なり）▼
        // 条件: existing.start < new.end && existing.end > new.start
        $overlap = Reservation::query()
            ->where('status', 'booked')
            ->where('start_at', '<', $jstDayEndUtc)
            ->where('end_at',   '>', $jstDayStartUtc)
            ->where('start_at', '<', $endAt)
            ->where('end_at',   '>', $startAt)
            ->exists();

        if ($overlap) {
            return response()->json(
                ['message' => 'その時間帯は埋まっています'],
                409,
                [],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            );
        }
        // ▲ 重複チェック ▲

        $created = Reservation::create($data);

        return response()->json(
            $created,
            201,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    /**
     * JST→UTC の時間窓を計算
     * - tour: am/pm のみ
     * - experience: am/pm/full
     */
    private function calcWindow(string $date, string $program, string $slot): array
    {
        $tz = 'Asia/Tokyo';

        if ($program === 'tour') {
            if ($slot === 'am') {
                $start = Carbon::parse($date.' 10:30:00', $tz);
                $end   = Carbon::parse($date.' 12:00:00', $tz);
            } elseif ($slot === 'pm') {
                $start = Carbon::parse($date.' 13:30:00', $tz);
                $end   = Carbon::parse($date.' 15:00:00', $tz);
            } else {
                abort(422, 'invalid slot for tour'); // 422で返す
            }
        } elseif ($program === 'experience') {
            if ($slot === 'am') {
                $start = Carbon::parse($date.' 10:00:00', $tz);
                $end   = Carbon::parse($date.' 12:00:00', $tz);
            } elseif ($slot === 'pm') {
                $start = Carbon::parse($date.' 13:00:00', $tz);
                $end   = Carbon::parse($date.' 15:00:00', $tz);
            } elseif ($slot === 'full') {
                $start = Carbon::parse($date.' 10:00:00', $tz);
                $end   = Carbon::parse($date.' 15:00:00', $tz);
            } else {
                abort(422, 'invalid slot for experience');
            }
        } else {
            abort(422, 'invalid program');
        }

        return [$start->utc(), $end->utc()];
    }
}