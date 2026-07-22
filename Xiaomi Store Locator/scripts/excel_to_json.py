import pandas as pd
import json
from pathlib import Path

# Mendapatkan path absolut ke direktori utama (root) projek
BASE_DIR = Path(__file__).resolve().parent.parent

input_file = BASE_DIR / "output" / "stores_complete.xlsx"
output_file = BASE_DIR / "output" / "stores.json"

print(f"Membaca file dari: {input_file}")

# 1. Baca Excel
df = pd.read_excel(input_file)

# 2. Bersihkan koordinat (ubah koma jadi titik & pastikan berupa angka)
for col in ['Latitude', 'Longitude']:
    if col in df.columns:
        df[col] = df[col].astype(str).str.replace(',', '.').str.strip()
        df[col] = pd.to_numeric(df[col], errors='coerce')

# 3. Convert ke dictionary & handle NaN agar JSON tetap valid
data = df.fillna("").to_dict(orient="records")

# 4. Simpan ke file JSON
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=4)

print("✅ JSON berhasil dibuat & terformat sempurna tanpa error!")