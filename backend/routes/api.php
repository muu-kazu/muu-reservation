<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Models\Reservation;
use Illuminate\Database\QueryException;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:api')->get('/user', function (Request $request) {
    return $request->user();
});

// 枠定義（ファイル上に1回だけ）
$SLOT_MAP = [
    'tour' => [ 'am' => ['10:30','12:00'], 'pm' => ['13:00','15:00'] ],
    'experience' => [
        'full' => ['10:00','15:00'],
        'am'   => ['10:00','12:00'],
        'pm'   => ['13:00','15:00'],
    ],
];

// 作成
Route::post('/reservations', function (Request $r) use ($SLOT_MAP) {
    // ① まず検証して $data を“定義”する
    $data = $r->validate([
        'date'    => ['required','date'],
        'program' => ['required','in:tour,experience'],
        'slot'    => ['required','in:am,pm,full'],
        'name'    => ['required','string','max:100'],
        'contact' => ['nullable','string','max:200'],
        'note'    => ['nullable','string'],
        'room'    => ['nullable','string','max:20'],
    ]);

    // ② 次に $data を使う（順番が大事）
    [$s, $e] = $SLOT_MAP[$data['program']][$data['slot']] ?? [null, null];
    if (!$s) {
        return response()->json(['message' => 'invalid slot'], 422);
    }

    $d = CarbonImmutable::parse($data['date']);
    $start = CarbonImmutable::parse($d->format('Y-m-d')." $s", 'Asia/Tokyo')->utc();
    $end   = CarbonImmutable::parse($d->format('Y-m-d')." $e", 'Asia/Tokyo')->utc();

    try {
         $res = \App\Models\Reservation::create($data + [
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


/**
 * 絞り込み GET
 * 例:
 *   /api/reservations?date=2025-09-11
 *   /api/reservations?program=experience&slot=full
 */

Route::get('/reservations', function (Request $r){
    $q = Reservation::query();

    if($r->filled('date')) {
        // date=YYYY-MM-DD を UTC にして日付一致で絞り込み (DBがtimestampならstart_atのDATEで絞るなどに応じて調整)
        // ここではモデルに date カラム(Date/DateTime)がある前提
        $q->whereDate('date',$r->query('date'));
    }
        if ($r->filled('program')) {
        $q->where('program', $r->query('program'));
    }
    if ($r->filled('slot')) {
        $q->where('slot', $r->query('slot'));
    }
    if ($r->filled('room')) {
        $q->where('room', $r->query('room'));
    }

    return $q->orderBy('date')->orderBy('start_at')->get();
});

/**
 * 更新: PATCH /api/reservations/{id}
 * 更新可能フィールド: name, contact, note, room, status, slot, program, date
 * slot/program/date を変えたら start_at / end_at を再計算
 */

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

// slot/program/date のいずれかが更新される場合は start_at / end_at を再計算
$needsTimeRecalc = isset($data['slot']) || isset($data['program']) || isset($data['date']);

  if ($needsTimeRecalc) {
        $program = $data['program'] ?? $res->program;
        $slot    = $data['slot']    ?? $res->slot;
        $dateStr = $data['date']    ?? $res->date->format('Y-m-d');

        [$s, $e] = $SLOT_MAP[$program][$slot] ?? [null,null];
        if (!$s) {
            return response()->json(['message' => 'invalid slot'], 422);
        }

        $d = CarbonImmutable::parse($dateStr);
        $start = CarbonImmutable::parse($d->format('Y-m-d')." $s", 'Asia/Tokyo')->utc();
        $end   = CarbonImmutable::parse($d->format('Y-m-d')." $e", 'Asia/Tokyo')->utc();

        $data['start_at'] = $start;
        $data['end_at']   = $end;
    }

        $res->fill($data);

        try {
            $res->save();
            return response()->json($res);
        } catch(QueryException $e) {
            // 一意制約違反　-> 409 (PostgreSQLなら '23505' の場合も)
            if($e->getCode() === '23P01' || (int)$e->getCode() ===23505) {
                return response()->json(['message' => 'その時間帯は埋まってます'], 409);                
            }
            throw $e;
        } 
    });

    /**
 * 削除: DELETE /api/reservations/{id}
 */
Route::delete('/reservations/{id}', function ($id) {
    $res = Reservation::findOrFail($id);
    $res->delete();

    return response()->json(['deleted' => true]);
});

/**
 * 単体取得: GET /api/reservations/{id}
 */
Route::get('/reservations/{id}', function ($id) {
    return \App\Models\Reservation::findOrFail($id);
});
