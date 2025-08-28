<?php

namespace App\Exceptions;

use Throwable;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;

use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException; 
use Symfony\Component\HttpFoundation\Response;

class Handler extends ExceptionHandler
{
    /**
     * A list of the exception types that are not reported.
     *
     * @var array
     */
    protected $dontReport = [
        'password',
        'password_cofirmation'
    ];

    /**
     * A list of the inputs that are never flashed for validation exceptions.
     *
     * @var array
     */
    protected $dontFlash = [
        'password',
        'password_confirmation',
    ];

    /**
     * Report or log an exception.
     *
     * @param  \Exception  $exception
     * @return void
     */
    public function report(Throwable $exception)
    {
        parent::report($exception);
    }

    /**
     * Render an exception into an HTTP response.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Exception  $exception
     * @return \Illuminate\Http\Response
     */
    public function render($request, Throwable $exception)
    {
        return parent::render($request, $exception);
    }

     public function register(): void
    {
        // 9+ の専用例外（これが来たら無条件で 409）
        $this->renderable(function (UniqueConstraintViolationException $e, $request) {
            return response()->json([
                'message' => '同じ日・同じ部屋の予約が既にあります。',
            ], Response::HTTP_CONFLICT);
        });

        // 旧来（8系など）の QueryException を SQLSTATE で判定
        $this->renderable(function (QueryException $e, $request) {
            // SQLSTATE を取り出す（getCode が空のこともあるためフォールバック）
            $sqlState = $e->getCode() ?: ($e->errorInfo[0] ?? null);
            if ($sqlState === '23505') { // unique_violation
                return response()->json([
                    'message' => '同じ日・同じ部屋の予約が既にあります。',
                ], Response::HTTP_CONFLICT);
            }
        });
    }
}
