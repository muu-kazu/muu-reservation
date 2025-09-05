<?php

namespace App\Http\Controllers;

use App\Models\Reservation;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReservationController extends Controller
{
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

    // 予約作成（フロントの POST に対応）
    public function store(Request $request)
    {
        $data = $request->validate([
            'date'           => ['required','date'],
            'program'        => ['required','string','max:64'],
            'slot'           => ['required','string','in:am,pm'],
            'room'           => ['nullable','string','max:16'],
            'name'           => ['nullable','string','max:191'],
            'last_name'      => ['nullable','string','max:191'],
            'first_name'     => ['nullable','string','max:191'],
            'email'          => ['nullable','email','max:191'],
            'phone'          => ['nullable','string','max:32'],
            'notebook_type'  => ['nullable','string','max:32'],
            'has_certificate'=> ['nullable','boolean'],
            'note'           => ['nullable','string','max:2000'],
            'status'         => ['nullable','string','in:booked,cancelled'],
        ]);

        // 既定値
        $data['status'] = $data['status'] ?? 'booked';
        $data['has_certificate'] = (bool)($data['has_certificate'] ?? false);

        // date+slot から start/end を自動算出（JST→UTC）
        [$startAt, $endAt] = $this->calcWindow($data['date'], $data['slot']);
        $data['start_at'] = $startAt;
        $data['end_at']   = $endAt;

        $created = Reservation::create($data);

        return response()->json(
            $created,
            201,
            [],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
    }

    private function calcWindow(string $date, string $slot): array
    {
        $tz = 'Asia/Tokyo';
        if ($slot === 'am') {
            $start = Carbon::parse($date.' 10:00:00', $tz);
            $end   = Carbon::parse($date.' 12:00:00', $tz);
        } else {
            $start = Carbon::parse($date.' 13:00:00', $tz);
            $end   = Carbon::parse($date.' 15:00:00', $tz);
        }
        return [$start->clone()->utc(), $end->clone()->utc()];
    }
}
