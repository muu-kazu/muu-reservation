<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['*'],

  'allowed_methods' => ['GET','POST','PATCH','DELETE','OPTIONS'],

  // 一時的にワイルドカードで全面許可
  'allowed_origins' => ['*'],

  'allowed_origins_patterns' => [],   // いったん空に
  'allowed_headers' => ['*'],
  'exposed_headers' => [],
  'max_age' => 0,

  // Cookie 認証なしなら false のままでOK（* が使える条件）
  'supports_credentials' => false,
];
