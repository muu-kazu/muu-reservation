<?php

namespace App\Models; // ← app/Models 配下なら: namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Reservation extends Model
{
    use HasFactory;

    // 一括代入を許可するカラム
    protected $fillable = [
        'date','program','slot','room','name','contact','note','status','start_at','end_at',
    ];

    // 便利キャスト（任意）
    protected $casts = [
        'date'     => 'date',
        'start_at' => 'immutable_datetime',
        'end_at'   => 'immutable_datetime',
    ];
}
