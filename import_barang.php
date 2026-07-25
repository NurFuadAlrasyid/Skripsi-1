<?php
include "koneksi.php";

header('Content-Type: text/plain; charset=UTF-8');

$jsonPath = __DIR__ . '/data.json';

if (!file_exists($jsonPath)) {
    exit("File data.json tidak ditemukan.\n");
}

$rawJson = file_get_contents($jsonPath);

if ($rawJson === false) {
    exit("Gagal membaca file data.json.\n");
}

$sourceData = json_decode($rawJson, true);

if (!is_array($sourceData)) {
    exit("Isi data.json tidak valid.\n");
}

$selectStatement = mysqli_prepare(
    $conn,
        "SELECT id
         FROM barang
     WHERE barcode = ?
             AND kode_item = ?
             AND kode_barang = ?
             AND nama_item = ?
             AND lokasi = ?
             AND kategori = ?
         LIMIT 1"
);

$insertStatement = mysqli_prepare(
    $conn,
    "INSERT INTO barang (kode_item, barcode, kode_barang, nama_item, lokasi, kategori, harga_beli, harga_jual, stok)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);

$updateStatement = mysqli_prepare(
    $conn,
    "UPDATE barang
     SET kode_item = ?, kode_barang = ?, nama_item = ?, lokasi = ?, kategori = ?, harga_beli = ?, harga_jual = ?, stok = ?
     WHERE id = ?"
);

if (!$selectStatement || !$insertStatement || !$updateStatement) {
    exit("Gagal menyiapkan query database.\n");
}

$insertedCount = 0;
$updatedCount = 0;
$skippedCount = 0;

function importItems($node, $path, $conn, $selectStatement, $insertStatement, $updateStatement, &$insertedCount, &$updatedCount, &$skippedCount)
{
    if (is_array($node) && array_keys($node) === range(0, count($node) - 1)) {
        foreach ($node as $item) {
            if (!is_array($item)) {
                $skippedCount++;
                continue;
            }

            $kodeItem = trim((string) ($item['kodeItem'] ?? ''));
            $barcode = trim((string) ($item['barcode'] ?? ''));
            $kodeBarang = trim((string) ($item['kodeBarang'] ?? ''));
            $namaItem = trim((string) ($item['namaItem'] ?? ''));
            $lokasi = isset($path[0]) ? trim((string) $path[0]) : '';
            $kategori = count($path) > 1 ? trim(implode(' / ', array_slice($path, 1))) : '';
            $hargaBeli = (float) ($item['hargaPokok'] ?? 0);
            $hargaJual = (float) ($item['hargaJual'] ?? 0);
            $stok = (int) ($item['stok'] ?? 0);

            if ($namaItem === '') {
                $skippedCount++;
                continue;
            }

            mysqli_stmt_bind_param(
                $selectStatement,
                'ssssss',
                $barcode,
                $kodeItem,
                $kodeBarang,
                $namaItem,
                $lokasi,
                $kategori
            );
            mysqli_stmt_execute($selectStatement);
            $result = mysqli_stmt_get_result($selectStatement);

            $existing = $result ? mysqli_fetch_assoc($result) : null;

            if ($existing) {
                $existingId = (int) $existing['id'];
                mysqli_stmt_bind_param(
                    $updateStatement,
                    'sssssddii',
                    $kodeItem,
                    $kodeBarang,
                    $namaItem,
                    $lokasi,
                    $kategori,
                    $hargaBeli,
                    $hargaJual,
                    $stok,
                    $existingId
                );
                mysqli_stmt_execute($updateStatement);
                $updatedCount++;
                continue;
            }

            mysqli_stmt_bind_param(
                $insertStatement,
                'ssssssddi',
                $kodeItem,
                $barcode,
                $kodeBarang,
                $namaItem,
                $lokasi,
                $kategori,
                $hargaBeli,
                $hargaJual,
                $stok
            );
            mysqli_stmt_execute($insertStatement);
            $insertedCount++;
        }

        return;
    }

    if (is_array($node)) {
        foreach ($node as $key => $value) {
            importItems(
                $value,
                array_merge($path, [(string) $key]),
                $conn,
                $selectStatement,
                $insertStatement,
                $updateStatement,
                $insertedCount,
                $updatedCount,
                $skippedCount
            );
        }
    }
}

mysqli_begin_transaction($conn);

try {
    importItems(
        $sourceData,
        [],
        $conn,
        $selectStatement,
        $insertStatement,
        $updateStatement,
        $insertedCount,
        $updatedCount,
        $skippedCount
    );

    mysqli_commit($conn);
} catch (Throwable $error) {
    mysqli_rollback($conn);
    exit("Import gagal: " . $error->getMessage() . "\n");
}

echo "Import selesai.\n";
echo "Data baru: {$insertedCount}\n";
echo "Data diperbarui: {$updatedCount}\n";
echo "Data dilewati: {$skippedCount}\n";
