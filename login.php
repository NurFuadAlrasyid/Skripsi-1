<?php
header('Content-Type: application/json');
include "koneksi.php";

$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

$username = trim(strtolower($username));
$password = trim($password);

if ($username === '' || $password === '') {
    echo json_encode([
        'success' => false,
        'message' => 'Username dan password wajib diisi.'
    ]);
    exit;
}

$sql = "SELECT * FROM users WHERE username = '$username' AND password = '$password' LIMIT 1";
$result = mysqli_query($conn, $sql);

if ($result && mysqli_num_rows($result) === 1) {
    $user = mysqli_fetch_assoc($result);

    echo json_encode([
        'success' => true,
        'message' => 'Login berhasil.',
        'user' => [
            'username' => $user['username'],
            'name' => $user['nama'],
            'role' => $user['role']
        ]
    ]);
    exit;
}

echo json_encode([
    'success' => false,
    'message' => 'Username atau password salah.'
]);
?>