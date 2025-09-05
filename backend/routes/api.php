<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Models\Reservation;
use Illuminate\Database\QueryException;
use Carbon\CarbonImmutable;
use App\Http\Middleware\DevCors; // 速攻パッチ用ミドルウェア
use App\Http\Controllers\ReservationController;


/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// 枠定義
$SLOT_MAP = [
    'tour' => [ 'am' => ['10:30','12:00'], 'pm' => ['13:00','15:00'] ],
    'experience' => [
        'full' => ['10:00','15:00'],
        'am'   => ['10:00','12:00'],
        'pm'   => ['13:00','15:00'],
    ],
];

// 速攻パッチ：全APIレスポンスにCORSヘッダを付与
Route::middleware([DevCors::class])->group(function () use ($SLOT_MAP) {

    // 認証付きユーザー情報（必要なら）
    Route::middleware('auth:api')->get('/user', function (Request $request) {
        return $request->user();
    });

    // 作成
    Route::post('/reservations', function (Request $r) use ($SLOT_MAP) {
        $data = $r->validate([
            'date'    => ['required','date'],
            'program' => ['required','in:tour,experience'],
            'slot'    => ['required','in:am,pm,full'],
            'name'    => ['required','string','max:100'],
            'contact' => ['nullable','string','max:200'],
            'note'    => ['nullable','string'],
            'room'    => ['nullable','string','max:20'],
        ]);

        [$s, $e] = $SLOT_MAP[$data['program']][$data['slot']] ?? [null, null];
        if (!$s) return response()->json(['message' => 'invalid slot'], 422);

        $d = CarbonImmutable::parse($data['date']);
        $start = CarbonImmutable::parse($d->format('Y-m-d')." $s", 'Asia/Tokyo')->utc();
        $end   = CarbonImmutable::parse($d->format('Y-m-d')." $e", 'Asia/Tokyo')->utc();

        try {
            $res = Reservation::create($data + [
                'room'     => $data['room'] ?? 'A',
                'status'   => 'booked',
                'start_at' => $start,
                'end_at'   => $end,
            ]);
            return response()->json($res, 201);
        } catch (QueryException $e) {
            if ($e->getCode() === '23P01') {
                return response()->json(['message' => 'その時間帯は埋まっています'], 409);
            }
            throw $e;
        }
    });

    // 絞り込みGET
    Route::get('/reservations', function (Request $r){
        $q = Reservation::query();

        if ($r->filled('date'))    $q->whereDate('date', $r->query('date'));
        if ($r->filled('program')) $q->where('program', $r->query('program'));
        if ($r->filled('slot'))    $q->where('slot', $r->query('slot'));
        if ($r->filled('room'))    $q->where('room', $r->query('room'));

        return $q->orderBy('date')->orderBy('start_at')->get();
    });

    // 更新
    Route::patch('/reservations/{id}', function (Request $r, $id) use ($SLOT_MAP) {
        $data = $r->validate([
            'name'    => ['sometimes','string','max:100'],
            'contact' => ['sometimes','nullable','string','max:200'],
            'note'    => ['sometimes','nullable','string'],
            'room'    => ['sometimes','string','max:20'],
            'status'  => ['sometimes','in:booked,cancelled,done'],
            'program' => ['sometimes','in:tour,experience'],
            'slot'    => ['sometimes','in:am,pm,full'],
            'date'    => ['sometimes','date'],
        ]);

        $res = Reservation::findOrFail($id);

        $needsTimeRecalc = isset($data['slot']) || isset($data['program']) || isset($data['date']);
        if ($needsTimeRecalc) {
            $program = $data['program'] ?? $res->program;
            $slot    = $data['slot']    ?? $res->slot;
            $dateStr = $data['date']    ?? $res->date->format('Y-m-d');

            [$s, $e] = $SLOT_MAP[$program][$slot] ?? [null, null];
            if (!$s) return response()->json(['message' => 'invalid slot'], 422);

            $d = CarbonImmutable::parse($dateStr);
            $data['start_at'] = CarbonImmutable::parse($d->format('Y-m-d')." $s", 'Asia/Tokyo')->utc();
            $data['end_at']   = CarbonImmutable::parse($d->format('Y-m-d')." $e", 'Asia/Tokyo')->utc();
        }

        $res->fill($data);

        try {
            $res->save();
            return response()->json($res);
        } catch (QueryException $e) {
            if ($e->getCode() === '23P01' || (int)$e->getCode() === 23505) {
                return response()->json(['message' => 'その時間帯は埋まってます'], 409);
            }
            throw $e;
        }
    });

    // 削除
    Route::delete('/reservations/{id}', function ($id) {
        $res = Reservation::findOrFail($id);
        $res->delete();
        return response()->json(['deleted' => true]);
    });

    // 単体取得
    Route::get('/reservations/{id}', function ($id) {
        return Reservation::findOrFail($id);
    });

}); // ← グループはここで閉じる（セミコロン必須）

Route::get('/healthz',function () {
    return response()->json([
        'ok'  => true,
        'ts'  => now()->toIso8601String(),
        'app' => config('app.name'),
    ]);
});

Route::apiResource('reservations', ReservationController::class);
Route::get('/healthz', fn() => response()->json(['ok'=>true,'ts'=>now()], 200));