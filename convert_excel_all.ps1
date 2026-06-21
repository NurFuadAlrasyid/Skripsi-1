# Script untuk convert semua Excel files ke JSON
# Install epplus dulu jika belum: Install-Module -Name ImportExcel -Force

param(
    [string]$ExcelPath = "data",
    [string]$OutputFile = "stok_data.json"
)

try {
    # Cek apakah ImportExcel module tersedia
    $module = Get-Module -Name ImportExcel -ListAvailable
    if (-not $module) {
        Write-Host "Installing ImportExcel module..."
        Install-Module -Name ImportExcel -Force -Scope CurrentUser
    }
    
    Import-Module ImportExcel
    
    $allData = @{}
    
    # Iterasi semua folder (lokasi)
    Get-ChildItem -Path $ExcelPath -Directory | ForEach-Object {
        $lokasi = $_.Name
        Write-Host "Processing lokasi: $lokasi"
        
        $lokasiData = @{}
        
        # Proses file Excel langsung di folder
        Get-ChildItem -Path $_.FullName -Filter "*.xlsx" | ForEach-Object {
            $itemName = $_.BaseName
            $filePath = $_.FullName
            
            Write-Host "  Loading: $itemName"
            
            try {
                $excelData = Import-Excel -Path $filePath -ErrorAction Stop
                if ($excelData -and $excelData.Count -gt 0) {
                    # Konversi ke array of objects
                    $lokasiData[$itemName] = @($excelData)
                }
            }
            catch {
                Write-Host "  Error loading $itemName`: $_" -ForegroundColor Yellow
            }
        }
        
        # Proses subfolder (kategori)
        Get-ChildItem -Path $_.FullName -Directory | ForEach-Object {
            $kategori = $_.Name
            Write-Host "  Processing kategori: $kategori"
            
            $kategoriData = @{}
            
            # Proses Excel files dalam subfolder
            Get-ChildItem -Path $_.FullName -Filter "*.xlsx" | ForEach-Object {
                $itemName = $_.BaseName
                $filePath = $_.FullName
                
                Write-Host "    Loading: $itemName"
                
                try {
                    $excelData = Import-Excel -Path $filePath -ErrorAction Stop
                    if ($excelData -and $excelData.Count -gt 0) {
                        $kategoriData[$itemName] = @($excelData)
                    }
                }
                catch {
                    Write-Host "    Error loading $itemName`: $_" -ForegroundColor Yellow
                }
            }
            
            if ($kategoriData.Count -gt 0) {
                $lokasiData[$kategori] = $kategoriData
            }
        }
        
        if ($lokasiData.Count -gt 0) {
            $allData[$lokasi] = $lokasiData
        }
    }
    
    # Convert to JSON dan simpan
    $jsonOutput = $allData | ConvertTo-Json -Depth 10 -Compress
    $jsonOutput | Out-File -Encoding UTF8 $OutputFile
    
    Write-Host "`nSuccessfully saved to: $OutputFile" -ForegroundColor Green
    Write-Host "Total lokasi: $($allData.Count)"
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
