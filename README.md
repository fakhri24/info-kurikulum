# Info Kurikulum

Satu halaman berisi seluruh tautan kurikulum — jadwal pelajaran, form piket pagi,
data siswa, rapor, dan lainnya — supaya tidak lagi tenggelam di grup chat.

Halaman ini **tidak menyimpan data apa pun**. Ia hanya mengarahkan ke dokumen yang
sudah ada di Google Workspace. Siapa yang boleh membuka sebuah dokumen tetap
ditentukan oleh izin dokumen itu sendiri.

---

## Untuk staf kurikulum: cara menambah atau mengubah tautan

Semua isi halaman berasal dari **satu Google Sheet**. Kamu tidak perlu menyentuh kode.

1. Buka Google Sheet `Info Kurikulum — Daftar Tautan`.
2. Tambah satu baris baru, atau ubah baris yang sudah ada.
3. Selesai. Muat ulang halaman web; perubahan muncul dalam beberapa menit.

### Arti tiap kolom

| Kolom | Isi | Wajib |
|---|---|:--:|
| `kategori` | `harian`, `data-siswa`, `sarana`, `administrasi`, atau `masukan` | ya |
| `judul` | Nama pendek tautan, misal `Jadwal Pelajaran` | ya |
| `deskripsi` | Satu kalimat: untuk apa dan untuk siapa | ya |
| `url` | Alamat lengkap, diawali `https://` | ya |
| `jenis` | `sheet`, `form`, `drive`, `web`, atau `doc` — menentukan ikon | ya |
| `pic` | Penanggung jawab, misal `Tim Kurikulum` | tidak |
| `privat` | Isi `ya` bila aksesnya terbatas; kartu akan diberi tanda **Privat** | tidak |
| `pinned` | Isi `ya` agar naik ke bagian **Sering dibuka** di paling atas | tidak |
| `urutan` | Angka; makin kecil makin atas di dalam kategorinya | tidak |
| `aktif` | Isi `tidak` untuk menyembunyikan tanpa menghapus barisnya | tidak |
| `diperbarui` | Tanggal `2026-08-01` — tampil di kartu | tidak |

Nama kategori yang muncul di halaman:

| Isi kolom `kategori` | Judul di halaman |
|---|---|
| `harian` | Kebutuhan Harian |
| `data-siswa` | Data Siswa |
| `sarana` | Sarana & Referensi |
| `administrasi` | Administrasi |
| `masukan` | Suara Guru |

Kategori di luar daftar itu tetap tampil, dikelompokkan sebagai **Lainnya**.

### Yang tidak boleh dimasukkan

Halaman ini dan repositorinya bersifat **publik** — siapa pun yang tahu alamatnya bisa
membaca judul, deskripsi, dan alamat tautannya. Yang aman tetap terkunci adalah isi
dokumennya, lewat izin Google.

Karena itu:

- **Jangan** menulis kata sandi, token, atau kunci API di Sheet maupun di repo.
- **Jangan** menulis data pribadi siswa (NISN, alamat, nomor telepon) di kolom mana pun.
- Untuk dokumen yang sensitif, tulis judul yang umum saja — misal `SK & Surat Tugas`,
  bukan judul SK yang menyebut nama orang.
- Untuk Google Form seperti piket pagi dan kotak saran, setel **wajib login akun sekolah**
  agar tidak bisa diisi orang luar.

---

## Untuk pengelola teknis

### Menyiapkan sumber data

1. Buat Google Sheet dengan satu tab bernama `links`, header sesuai tabel kolom di atas.
2. **File → Bagikan → Publikasikan ke web** → pilih tab `links` → format **CSV** → Publikasikan.
3. Salin alamat yang diberikan, tempelkan ke `data/config.json`:

   ```json
   { "sheetCsvUrl": "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv" }
   ```

Alamat itu dipakai bersama oleh halaman web dan workflow sinkronisasi — cukup diubah di satu tempat.

> **Perhatikan urutan tab.** Alamat yang dipakai saat ini berakhiran `?output=csv` tanpa `gid`,
> artinya Google selalu menyajikan **tab paling kiri**. Selama `links` tetap tab pertama, aman.
> Kalau nanti kamu menambah tab lain dan menggesernya ke kiri, halaman akan diam-diam membaca
> tab yang salah. Untuk menguncinya ke satu tab tertentu, publikasikan ulang dengan memilih
> tab `links` secara spesifik sehingga alamatnya mengandung `gid=...&single=true`.

### Bagaimana data mengalir

| Urutan | Sumber | Kapan dipakai |
|---|---|---|
| 1 | `data/links.json` | Selalu dirender lebih dulu, agar halaman tampil instan dan tetap jalan saat offline |
| 2 | CSV Google Sheet | Diambil di latar belakang, lalu menggantikan tampilan bila berhasil |
| — | `data/links.json` | Tetap dipakai bila CSV gagal diambil; muncul pemberitahuan di halaman |

`data/links.json` disegarkan otomatis setiap malam oleh
[`.github/workflows/sync-links.yml`](.github/workflows/sync-links.yml), dan hanya di-commit
bila isinya benar-benar berubah. Bisa juga dijalankan manual:

```bash
gh workflow run sync-links.yml     # di GitHub
python3 scripts/sync_links.py      # di komputer sendiri
```

Skrip sengaja **tidak** menimpa `links.json` bila pengambilan gagal atau hasilnya kosong —
salinan lama lebih berguna daripada file kosong.

### Menjalankan di komputer sendiri

```bash
python3 -m http.server 8000
# buka http://localhost:8000
```

Harus lewat server, bukan `file://` — halaman ini mengambil datanya dengan `fetch`.

### Deploy

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `root`**.
Tidak ada langkah build; isinya HTML, CSS, dan JS statis apa adanya.

### Isi repo

```
index.html                     satu halaman, seluruh tampilan
assets/styles.css              gaya; token warna ada di :root
assets/app.js                  pemuat data, parser CSV, pencarian, perender
assets/icons/                  ikon PWA
data/config.json               alamat CSV Google Sheet — satu-satunya tempat diubah
data/links.json                salinan cadangan, disegarkan otomatis
scripts/sync_links.py          CSV → links.json
.github/workflows/             sinkronisasi harian
sw.js, manifest.webmanifest    agar bisa dipasang di layar utama HP
```

### Catatan pemeliharaan

- Menambah kategori baru: tambahkan satu baris di `KATEGORI` pada `assets/app.js`,
  lalu pakai `id`-nya di kolom `kategori` Sheet.
- Menambah jenis ikon baru: tambahkan `<symbol>` di `index.html` dan satu baris di `JENIS`.
- Setelah mengubah `styles.css` atau `app.js`, naikkan `CACHE` di `sw.js`
  (`info-kurikulum-v1` → `v2`) agar perangkat yang sudah memasang halaman ini
  mengambil versi terbaru.
