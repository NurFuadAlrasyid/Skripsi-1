<?php
include "koneksi.php";

header('Content-Type: application/json; charset=UTF-8');

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody, true);

if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Payload transaksi tidak valid.'
    ]);
    exit;
}

$invoiceNumber = trim((string) ($payload['invoiceNumber'] ?? ''));
$createdAt = trim((string) ($payload['createdAt'] ?? ''));
$cashierName = trim((string) ($payload['cashierName'] ?? 'Kasir'));
$customerName = trim((string) ($payload['customerName'] ?? ''));
$notes = trim((string) ($payload['notes'] ?? ''));
$total = (float) ($payload['total'] ?? 0);
$paymentAmount = (float) ($payload['paymentAmount'] ?? 0);
$changeAmount = (float) ($payload['changeAmount'] ?? 0);
$totalItems = (int) ($payload['totalItems'] ?? 0);
$totalCost = (float) ($payload['totalCost'] ?? 0);
$status = trim((string) ($payload['status'] ?? 'Lunas'));
$items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
$user = is_array($payload['user'] ?? null) ? $payload['user'] : [];
$username = trim((string) ($user['username'] ?? ''));
$userName = trim((string) ($user['name'] ?? $cashierName));

if ($invoiceNumber === '' || $createdAt === '' || !$items) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Data transaksi belum lengkap.'
    ]);
    exit;
}

$checkStatement = mysqli_prepare($conn, "SELECT id FROM transaksi WHERE kode_transaksi = ? LIMIT 1");
$insertTransactionStatement = mysqli_prepare(
    $conn,
    "INSERT INTO transaksi (kode_transaksi, tanggal, username, nama_user, customer_name, notes, total, payment_amount, change_amount, total_items, total_cost, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
$insertDetailStatement = mysqli_prepare(
    $conn,
    "INSERT INTO transaksi_detail (transaksi_id, barcode, nama_item, harga_pokok, harga, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

if (!$checkStatement || !$insertTransactionStatement || !$insertDetailStatement) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal menyiapkan query transaksi.'
    ]);
    exit;
}

mysqli_begin_transaction($conn);

try {
    mysqli_stmt_bind_param($checkStatement, 's', $invoiceNumber);
    mysqli_stmt_execute($checkStatement);
    $existingResult = mysqli_stmt_get_result($checkStatement);
    $existingTransaction = $existingResult ? mysqli_fetch_assoc($existingResult) : null;

    if ($existingTransaction) {
        mysqli_rollback($conn);
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Kode transaksi sudah pernah dipakai. Silakan ulangi simpan transaksi.',
            'duplicate' => true,
            'transactionId' => (int) $existingTransaction['id']
        ]);
        exit;
    }

    mysqli_stmt_bind_param(
        $insertTransactionStatement,
        'ssssssdddids',
        $invoiceNumber,
        $createdAt,
        $username,
        $userName,
        $customerName,
        $notes,
        $total,
        $paymentAmount,
        $changeAmount,
        $totalItems,
        $totalCost,
        $status
    );
    mysqli_stmt_execute($insertTransactionStatement);

    $transactionId = (int) mysqli_insert_id($conn);

    foreach ($items as $item) {
        $barcode = trim((string) ($item['barcode'] ?? ''));
        $namaItem = trim((string) ($item['namaItem'] ?? ''));
        $hargaPokok = (float) ($item['hargaPokok'] ?? 0);
        $harga = (float) ($item['hargaJual'] ?? 0);
        $qty = (int) ($item['qty'] ?? 0);
        $subtotal = (float) ($item['subtotal'] ?? 0);

        if ($namaItem === '' || $qty <= 0) {
            throw new RuntimeException('Ada item transaksi yang tidak valid.');
        }

        mysqli_stmt_bind_param(
            $insertDetailStatement,
            'issddid',
            $transactionId,
            $barcode,
            $namaItem,
            $hargaPokok,
            $harga,
            $qty,
            $subtotal
        );
        mysqli_stmt_execute($insertDetailStatement);
    }

    mysqli_commit($conn);

    echo json_encode([
        'success' => true,
        'message' => 'Transaksi berhasil disimpan ke database.',
        'transactionId' => $transactionId
    ]);
} catch (Throwable $error) {
    mysqli_rollback($conn);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal menyimpan transaksi: ' . $error->getMessage()
    ]);
}
