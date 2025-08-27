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
        $res = \App\Reservation::create($data + [
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

// 一覧
Route::get('/reservations', function(){
    return Reservation::all();
});

// 単体
Route::get('/reservations/{id}', function($id){
    return Reservation::findOrFail($id);
});