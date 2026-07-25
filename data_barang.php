<?php
include "koneksi.php";

header('Content-Type: application/json; charset=UTF-8');

$sql = "SELECT kode_item, barcode, kode_barang, nama_item, lokasi, kategori, harga_beli, harga_jual, stok
        FROM barang
        ORDER BY lokasi ASC, kategori ASC, nama_item ASC";

$result = mysqli_query($conn, $sql);

if (!$result) {
    http_response_code(500);
    echo json_encode([
        'message' => 'Gagal mengambil data barang.'
    ]);
    exit;
}

$grouped = [];

function createNode()
{
    return [
        '__items' => [],
        '__children' => []
    ];
}

function appendItemToNode(&$node, $segments, $item)
{
    if (!$segments) {
        $node['__items'][] = $item;
        return;
    }

    $segment = array_shift($segments);
    if (!isset($node['__children'][$segment])) {
        $node['__children'][$segment] = createNode();
    }

    appendItemToNode($node['__children'][$segment], $segments, $item);
}

function normalizeNode($node)
{
    $children = [];

    foreach ($node['__children'] as $name => $childNode) {
        $children[$name] = normalizeNode($childNode);
    }

    $items = $node['__items'];

    if (!$children) {
        return $items;
    }

    if ($items) {
        $children['Tanpa Kategori'] = $items;
    }

    return $children;
}

while ($row = mysqli_fetch_assoc($result)) {
    $lokasi = trim((string) ($row['lokasi'] ?? ''));
    $kategori = trim((string) ($row['kategori'] ?? ''));

    if ($lokasi === '') {
        $lokasi = 'Tanpa Lokasi';
    }

    if (!isset($grouped[$lokasi])) {
        $grouped[$lokasi] = createNode();
    }

    $item = [
        'kodeItem' => (string) ($row['kode_item'] ?? ''),
        'barcode' => (string) ($row['barcode'] ?? ''),
        'kodeBarang' => (string) ($row['kode_barang'] ?? ''),
        'namaItem' => (string) ($row['nama_item'] ?? ''),
        'hargaPokok' => (float) ($row['harga_beli'] ?? 0),
        'hargaJual' => (float) ($row['harga_jual'] ?? 0),
        'stok' => (int) ($row['stok'] ?? 0)
    ];

    $segments = [];
    if ($kategori !== '' && $kategori !== '0') {
        $segments = array_values(array_filter(array_map('trim', explode('/', $kategori)), static function ($value) {
            return $value !== '' && $value !== '0';
        }));
    }

    appendItemToNode($grouped[$lokasi], $segments, $item);
}

$normalized = [];
foreach ($grouped as $lokasi => $node) {
    $normalized[$lokasi] = normalizeNode($node);
}

echo json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
