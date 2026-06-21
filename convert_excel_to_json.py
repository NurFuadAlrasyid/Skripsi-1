import os
import json
from pathlib import Path
import openpyxl
from openpyxl.utils import get_column_letter

# Path ke folder data
DATA_FOLDER = Path(__file__).parent / "data"
OUTPUT_FILE = Path(__file__).parent / "data.json"

# Nama kolom yang kita cari di Excel
COLUMN_NAMES = [
    'kodeItem', 'barcode', 'namaItem', 'hargaPokok', 
    'kodeBarang', 'hargaJual', 'stok'
]

def find_column_index(ws, column_names):
    """Mencari index kolom berdasarkan nama header"""
    column_map = {}
    
    # Cek row pertama (header)
    for col_idx, cell in enumerate(ws[1], 1):
        cell_value = str(cell.value).strip().lower() if cell.value else ""
        
        # Cek kecocokan dengan nama kolom yang dicari
        for col_name in column_names:
            if col_name.lower() in cell_value or cell_value in col_name.lower():
                column_map[col_name] = col_idx
                break
    
    return column_map

def read_excel_file(file_path):
    """Membaca file Excel dan mengembalikan list of items"""
    items = []
    
    try:
        wb = openpyxl.load_workbook(file_path, data_only=True)
        ws = wb.active
        
        # Cari index kolom
        column_map = find_column_index(ws, COLUMN_NAMES)
        
        if not column_map:
            print(f"Tidak ada header yang cocok di {file_path.name}")
            return items
        
        # Baca data mulai dari row 2 (skip header)
        for row_idx, row in enumerate(ws.iter_rows(min_row=2), start=2):
            # Cek apakah row kosong
            if all(cell.value is None for cell in row):
                continue
            
            item = {}
            try:
                for col_name, col_idx in column_map.items():
                    cell_value = row[col_idx - 1].value
                    
                    # Konversi tipe data
                    if col_name in ['hargaPokok', 'hargaJual', 'stok']:
                        item[col_name] = int(cell_value) if cell_value else 0
                    else:
                        item[col_name] = str(cell_value).strip() if cell_value else ""
                
                # Hanya tambah jika ada data minimal
                if item.get('namaItem'):
                    items.append(item)
            except Exception as e:
                print(f"  ⚠️  Error di row {row_idx}: {e}")
                continue
        
        wb.close()
    except Exception as e:
        print(f"Error membaca {file_path}: {e}")
    
    return items

def build_json_structure(data_folder):
    """Build struktur JSON berdasarkan folder hierarchy"""
    result = {}
    
    for item in sorted(os.listdir(data_folder)):
        item_path = data_folder / item
        
        if os.path.isdir(item_path):
            # Ini adalah folder lokasi (Lantai 1, Lorong A, dll)
            print(f"\nProses folder: {item}")
            result[item] = process_folder(item_path)
    
    return result

def process_folder(folder_path):
    """Proses folder dan return struktur data (bisa array atau dict)"""
    has_excel = False
    has_subfolder = False
    items = []
    subfolders = {}
    
    for item in os.listdir(folder_path):
        item_path = folder_path / item
        
        if os.path.isdir(item_path):
            # Ada subfolder
            has_subfolder = True
            print(f"  Subfolder: {item}")
            subfolders[item] = process_folder(item_path)
        elif item.endswith('.xlsx'):
            # Ada file Excel
            has_excel = True
            print(f"  File: {item}")
            file_items = read_excel_file(item_path)
            items.extend(file_items)
            print(f"    {len(file_items)} item terbaca")
    
    # Return struktur yang sesuai
    if has_subfolder and not has_excel:
        # Hanya ada subfolder, return dict
        return subfolders
    elif has_subfolder and has_excel:
        # Ada keduanya, prioritas subfolder
        # Tambah items ke subfolder default jika ada
        if items:
            subfolders['_items'] = items
        return subfolders
    else:
        # Hanya ada file Excel, return array
        return items

def main():
    print("=" * 60)
    print("KONVERSI EXCEL KE JSON")
    print("=" * 60)
    
    if not DATA_FOLDER.exists():
        print(f"Folder {DATA_FOLDER} tidak ditemukan!")
        return
    
    print(f"Folder data: {DATA_FOLDER}\n")
    
    # Build struktur
    data = build_json_structure(DATA_FOLDER)
    
    # Simpan ke JSON
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'=' * 60}")
        print(f"BERHASIL! File disimpan ke: {OUTPUT_FILE}")
        print(f"{'=' * 60}")
        
        # Summary
        total_items = count_total_items(data)
        print(f"Total item yang terbaca: {total_items}")
        
    except Exception as e:
        print(f"Error menyimpan JSON: {e}")

def count_total_items(data, count=0):
    """Hitung total items di seluruh struktur"""
    for value in data.values():
        if isinstance(value, list):
            count += len(value)
        elif isinstance(value, dict):
            count += count_total_items(value, 0)
    return count

if __name__ == "__main__":
    main()
