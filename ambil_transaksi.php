<?php
include "koneksi.php";

header('Content-Type: application/json; charset=UTF-8');

$transactionResult = mysqli_query(
    $conn,
    "SELECT id, kode_transaksi, tanggal, username, nama_user, customer_name, notes, total, payment_amount, change_amount, total_items, total_cost, status
     FROM transaksi
     ORDER BY tanggal DESC, id DESC"
);

if (!$transactionResult) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal mengambil daftar transaksi.'
    ]);
    exit;
}

$detailResult = mysqli_query(
    $conn,
    "SELECT id, transaksi_id, barcode, nama_item, harga_pokok, harga, qty, subtotal
     FROM transaksi_detail
     ORDER BY transaksi_id DESC, id ASC"
);

if (!$detailResult) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Gagal mengambil detail transaksi.'
    ]);
    exit;
}

$detailsByTransaction = [];

while ($detail = mysqli_fetch_assoc($detailResult)) {
    $transactionId = (int) $detail['transaksi_id'];
    if (!isset($detailsByTransaction[$transactionId])) {
        $detailsByTransaction[$transactionId] = [];
    }

    $barcode = trim((string) ($detail['barcode'] ?? ''));

    $detailsByTransaction[$transactionId][] = [
        'detailId' => (int) $detail['id'],
        'itemKey' => $barcode !== '' ? 'barcode:' . $barcode : 'detail:' . (int) $detail['id'],
        'kodeItem' => '',
        'barcode' => $barcode,
        'namaItem' => (string) ($detail['nama_item'] ?? ''),
        'lokasi' => '',
        'hargaPokok' => (float) ($detail['harga_pokok'] ?? 0),
        'hargaJual' => (float) ($detail['harga'] ?? 0),
        'qty' => (int) ($detail['qty'] ?? 0),
        'subtotal' => (float) ($detail['subtotal'] ?? 0)
    ];
}

$transactions = [];

while ($row = mysqli_fetch_assoc($transactionResult)) {
    $transactionId = (int) $row['id'];
    $transactions[] = [
        'id' => $transactionId,
        'invoiceNumber' => (string) ($row['kode_transaksi'] ?? ''),
        'createdAt' => (string) ($row['tanggal'] ?? ''),
        'cashierName' => (string) ($row['nama_user'] ?? ''),
        'cashierUsername' => (string) ($row['username'] ?? ''),
        'customerName' => (string) ($row['customer_name'] ?? ''),
        'notes' => (string) ($row['notes'] ?? ''),
        'paymentAmount' => (float) ($row['payment_amount'] ?? 0),
        'total' => (float) ($row['total'] ?? 0),
        'changeAmount' => (float) ($row['change_amount'] ?? 0),
        'totalItems' => (int) ($row['total_items'] ?? 0),
        'totalCost' => (float) ($row['total_cost'] ?? 0),
        'status' => (string) ($row['status'] ?? 'Lunas'),
        'items' => $detailsByTransaction[$transactionId] ?? []
    ];
}

echo json_encode([
    'success' => true,
    'transactions' => $transactions
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
