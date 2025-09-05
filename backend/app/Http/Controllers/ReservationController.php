<?php

namespace App\Http\Controllers;

use App\Models\Reservation;
use Illuminate\Http\Request;

class ReservationController extends Controller
{
    public function index() {
        return Reservation::all(); // 全件取得
        // ★ JSON_UNESCAPED_UNICODE を指定
        return response()->json($reservations, 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public function show($id) {
        return Reservation::findOrFail($id); // id指定で取得
        return response()->json($reservation, 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
