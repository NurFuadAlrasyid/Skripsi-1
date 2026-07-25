<?php
include "koneksi.php";

header('Content-Type: application/json; charset=UTF-8');

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);
$transactionId = (int) ($payload['transactionId'] ?? 0);

if ($transactionId <= 0) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'ID transaksi tidak valid.'
    ]);
    exit;
}

$statement = mysqli_prepare($conn, "DELETE FROM transaksi WHERE id = ?");

if (!$statement) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal menyiapkan hapus transaksi.'
    ]);
    exit;
}

mysqli_stmt_bind_param($statement, 'i', $transactionId);
mysqli_stmt_execute($statement);

if (mysqli_stmt_affected_rows($statement) < 1) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'Transaksi tidak ditemukan.'
    ]);
    exit;
}

echo json_encode([
    'success' => true,
    'message' => 'Transaksi berhasil dihapus.'
]);
