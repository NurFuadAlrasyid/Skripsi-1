<?php
include "koneksi.php";

header('Content-Type: application/json; charset=UTF-8');

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);
$transactionId = (int) ($payload['transactionId'] ?? 0);
$detailId = (int) ($payload['detailId'] ?? 0);

if ($transactionId <= 0 || $detailId <= 0) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Data item transaksi tidak valid.'
    ]);
    exit;
}

$deleteStatement = mysqli_prepare($conn, "DELETE FROM transaksi_detail WHERE id = ? AND transaksi_id = ?");
$remainingStatement = mysqli_prepare($conn, "SELECT COUNT(*) AS total_items, COALESCE(SUM(subtotal), 0) AS total_amount, COALESCE(SUM(qty), 0) AS total_qty, COALESCE(SUM(harga_pokok * qty), 0) AS total_cost FROM transaksi_detail WHERE transaksi_id = ?");
$headerStatement = mysqli_prepare($conn, "SELECT payment_amount FROM transaksi WHERE id = ? LIMIT 1");
$updateStatement = mysqli_prepare($conn, "UPDATE transaksi SET total = ?, total_items = ?, change_amount = ?, total_cost = ? WHERE id = ?");
$deleteHeaderStatement = mysqli_prepare($conn, "DELETE FROM transaksi WHERE id = ?");

if (!$deleteStatement || !$remainingStatement || !$headerStatement || !$updateStatement || !$deleteHeaderStatement) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal menyiapkan query hapus item.'
    ]);
    exit;
}

mysqli_begin_transaction($conn);

try {
    mysqli_stmt_bind_param($deleteStatement, 'ii', $detailId, $transactionId);
    mysqli_stmt_execute($deleteStatement);

    if (mysqli_stmt_affected_rows($deleteStatement) < 1) {
        throw new RuntimeException('Item transaksi tidak ditemukan.');
    }

    mysqli_stmt_bind_param($remainingStatement, 'i', $transactionId);
    mysqli_stmt_execute($remainingStatement);
    $remainingResult = mysqli_stmt_get_result($remainingStatement);
    $remaining = $remainingResult ? mysqli_fetch_assoc($remainingResult) : null;

    $itemCount = (int) ($remaining['total_items'] ?? 0);

    if ($itemCount <= 0) {
        mysqli_stmt_bind_param($deleteHeaderStatement, 'i', $transactionId);
        mysqli_stmt_execute($deleteHeaderStatement);
        mysqli_commit($conn);

        echo json_encode([
            'success' => true,
            'message' => 'Item terakhir dihapus dan transaksi dibersihkan.'
        ]);
        exit;
    }

    mysqli_stmt_bind_param($headerStatement, 'i', $transactionId);
    mysqli_stmt_execute($headerStatement);
    $headerResult = mysqli_stmt_get_result($headerStatement);
    $header = $headerResult ? mysqli_fetch_assoc($headerResult) : null;
    $paymentAmount = (float) ($header['payment_amount'] ?? 0);
    $totalAmount = (float) ($remaining['total_amount'] ?? 0);
    $totalQty = (int) ($remaining['total_qty'] ?? 0);
    $totalCost = (float) ($remaining['total_cost'] ?? 0);
    $changeAmount = max(0, $paymentAmount - $totalAmount);

    mysqli_stmt_bind_param($updateStatement, 'diddi', $totalAmount, $totalQty, $changeAmount, $totalCost, $transactionId);
    mysqli_stmt_execute($updateStatement);

    mysqli_commit($conn);

    echo json_encode([
        'success' => true,
        'message' => 'Item transaksi berhasil dihapus.'
    ]);
} catch (Throwable $error) {
    mysqli_rollback($conn);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal menghapus item transaksi: ' . $error->getMessage()
    ]);
}
