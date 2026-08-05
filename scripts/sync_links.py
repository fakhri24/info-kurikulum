#!/usr/bin/env python3
"""Menyegarkan data/links.json dari Google Sheet yang dipublikasikan sebagai CSV.

Dijalankan oleh .github/workflows/sync-links.yml, dan bisa dijalankan manual:

    python3 scripts/sync_links.py

Alamat CSV dibaca dari data/config.json (kunci "sheetCsvUrl") supaya hanya ada
satu tempat untuk diubah — dipakai bersama oleh halaman dan workflow ini.

Skrip sengaja tidak menimpa links.json bila pengambilan gagal atau hasilnya
kosong: salinan lama lebih berguna daripada file kosong.
"""

import csv
import io
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

AKAR = Path(__file__).resolve().parent.parent
CONFIG = AKAR / "data" / "config.json"
KELUARAN = AKAR / "data" / "links.json"

KOLOM = [
    "kategori", "judul", "deskripsi", "url", "jenis",
    "pic", "privat", "pinned", "urutan", "aktif", "diperbarui", "grup",
]

CATATAN = (
    "Salinan cadangan. Sumber sebenarnya adalah Google Sheet — file ini "
    "diperbarui otomatis oleh .github/workflows/sync-links.yml. Jangan edit "
    "manual kecuali Sheet belum disiapkan."
)


def keluar(pesan: str, kode: int = 0) -> None:
    print(pesan)
    sys.exit(kode)


def baca_url() -> str:
    if not CONFIG.exists():
        keluar(f"{CONFIG} tidak ada — lewati sinkronisasi.")
    try:
        konfigurasi = json.loads(CONFIG.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        keluar(f"data/config.json tidak valid: {e}", 1)
    return (konfigurasi.get("sheetCsvUrl") or "").strip()


def ambil_csv(url: str) -> str:
    permintaan = urllib.request.Request(url, headers={"User-Agent": "info-kurikulum-sync"})
    with urllib.request.urlopen(permintaan, timeout=30) as respons:
        return respons.read().decode("utf-8-sig")


def ke_baris(teks: str) -> list[dict]:
    pembaca = csv.DictReader(io.StringIO(teks))
    if not pembaca.fieldnames:
        return []

    # Header dinormalkan agar spasi/huruf besar di Sheet tidak merusak pemetaan.
    pembaca.fieldnames = [(nama or "").strip().lower() for nama in pembaca.fieldnames]

    baris = []
    for mentah in pembaca:
        item = {kolom: (mentah.get(kolom) or "").strip() for kolom in KOLOM}
        if not item["judul"]:
            continue
        if item["urutan"].isdigit():
            item["urutan"] = int(item["urutan"])
        baris.append(item)
    return baris


def main() -> None:
    url = baca_url()
    if not url:
        keluar("sheetCsvUrl masih kosong — Sheet belum disiapkan, lewati sinkronisasi.")

    try:
        teks = ambil_csv(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
        keluar(f"Gagal mengambil CSV: {e}. Salinan lama dipertahankan.", 1)

    baris = ke_baris(teks)
    if not baris:
        keluar("CSV terbaca tetapi tidak ada baris berjudul. Salinan lama dipertahankan.", 1)

    wib = timezone(timedelta(hours=7))
    isi = {
        "diperbarui": datetime.now(wib).date().isoformat(),
        "catatan": CATATAN,
        "items": baris,
    }

    KELUARAN.write_text(
        json.dumps(isi, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(baris)} tautan ditulis ke {KELUARAN.relative_to(AKAR)}.")


if __name__ == "__main__":
    main()
