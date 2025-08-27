<?php

namespace App\Http\Controllers;

use App\Models\Reservation;
use Illuminate\Http\Request;

class ReservationController extends Controller
{
    public function index() {
        return Reservation::all(); // 全件取得
    }

    public function show($id) {
        return Reservation::findOrFail($id); // id指定で取得
    }
}
