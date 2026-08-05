/* =========================================================
   Info Kurikulum — pemuat, pencarian, dan perender daftar tautan.
   Tanpa dependensi. Semua teks dari data dirender lewat textContent.
   ========================================================= */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     KONFIGURASI

     Alamat CSV Google Sheet ada di data/config.json — satu tempat saja,
     dipakai bersama oleh halaman ini dan workflow sinkronisasi harian.
     Selama masih kosong, halaman memakai salinan di data/links.json.
     ------------------------------------------------------------------ */
  var CONFIG_URL = 'data/config.json';
  var SNAPSHOT_URL = 'data/links.json';
  var SHEET_CSV_URL = '';

  var KATEGORI = [
    { id: 'harian', label: 'Kebutuhan Harian' },
    { id: 'data-siswa', label: 'Data Siswa' },
    { id: 'sarana', label: 'Sarana & Referensi' },
    { id: 'administrasi', label: 'Administrasi' },
    { id: 'masukan', label: 'Suara Guru' }
  ];

  var JENIS = {
    sheet: { label: 'Spreadsheet', ikon: 'i-sheet' },
    form: { label: 'Formulir', ikon: 'i-form' },
    drive: { label: 'Drive', ikon: 'i-drive' },
    web: { label: 'Website', ikon: 'i-web' },
    doc: { label: 'Dokumen', ikon: 'i-doc' }
  };

  var el = {
    bar: document.querySelector('.bar-cari'),
    isi: document.getElementById('isi'),
    cari: document.getElementById('cari'),
    status: document.getElementById('hasil-status'),
    tanggal: document.getElementById('tanggal'),
    pemberitahuan: document.getElementById('pemberitahuan'),
    kakiMeta: document.getElementById('kaki-meta'),
    tautanSaran: document.getElementById('tautan-saran'),
    tplKosong: document.getElementById('tpl-kosong')
  };

  var state = {
    items: [],
    query: '',
    sumber: null,      // 'sheet' | 'cadangan'
    diperbarui: '',    // tanggal snapshot
    gagalSheet: false
  };

  /* ---------------------- Bantu-bantu ---------------------- */

  function isYa(nilai) {
    return /^(ya|y|true|1|x|v)$/i.test(String(nilai == null ? '' : nilai).trim());
  }

  function rapikan(nilai) {
    return String(nilai == null ? '' : nilai).trim();
  }

  function punyaTautan(url) {
    return /^https?:\/\//i.test(rapikan(url));
  }

  function formatTanggal(iso) {
    var cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rapikan(iso));
    if (!cocok) return rapikan(iso);
    var d = new Date(Number(cocok[1]), Number(cocok[2]) - 1, Number(cocok[3]));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function buat(tag, kelas, teks) {
    var n = document.createElement(tag);
    if (kelas) n.className = kelas;
    if (teks != null) n.textContent = teks;
    return n;
  }

  function ikon(id, kelas) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', kelas);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + id);
    svg.appendChild(use);
    return svg;
  }

  /* ---------------------- Parser CSV ----------------------
     Menangani field ber-tanda-kutip, koma di dalam field,
     baris baru di dalam field, dan escape "" .
     -------------------------------------------------------- */

  function parseCSV(teks) {
    var baris = [];
    var kolom = [];
    var buf = '';
    var dalamKutip = false;
    var i = 0;

    teks = teks.replace(/^﻿/, '');

    while (i < teks.length) {
      var c = teks[i];

      if (dalamKutip) {
        if (c === '"') {
          if (teks[i + 1] === '"') { buf += '"'; i += 2; continue; }
          dalamKutip = false; i++; continue;
        }
        buf += c; i++; continue;
      }

      if (c === '"') { dalamKutip = true; i++; continue; }
      if (c === ',') { kolom.push(buf); buf = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { kolom.push(buf); baris.push(kolom); kolom = []; buf = ''; i++; continue; }

      buf += c; i++;
    }

    kolom.push(buf);
    baris.push(kolom);

    return baris.filter(function (b) {
      return b.some(function (sel) { return rapikan(sel) !== ''; });
    });
  }

  function csvKeObjek(teks) {
    var baris = parseCSV(teks);
    if (baris.length < 2) return [];
    var header = baris[0].map(function (h) { return rapikan(h).toLowerCase(); });
    return baris.slice(1).map(function (b) {
      var o = {};
      header.forEach(function (nama, idx) { o[nama] = b[idx] == null ? '' : b[idx]; });
      return o;
    });
  }

  /* ---------------------- Normalisasi ---------------------- */

  function normalisasi(mentah) {
    return mentah
      .map(function (r) {
        return {
          kategori: rapikan(r.kategori).toLowerCase(),
          judul: rapikan(r.judul),
          deskripsi: rapikan(r.deskripsi),
          url: rapikan(r.url),
          jenis: rapikan(r.jenis).toLowerCase() || 'web',
          pic: rapikan(r.pic),
          privat: isYa(r.privat),
          pinned: isYa(r.pinned),
          urutan: Number(rapikan(r.urutan)) || 999,
          aktif: rapikan(r.aktif) === '' ? true : isYa(r.aktif),
          diperbarui: rapikan(r.diperbarui)
        };
      })
      .filter(function (r) { return r.aktif && r.judul; })
      .sort(function (a, b) {
        return a.urutan - b.urutan || a.judul.localeCompare(b.judul, 'id');
      });
  }

  /* ---------------------- Pencarian ---------------------- */

  function tokenisasi(q) {
    return rapikan(q).toLowerCase().split(/\s+/).filter(Boolean);
  }

  function labelKategori(id) {
    for (var i = 0; i < KATEGORI.length; i++) {
      if (KATEGORI[i].id === id) return KATEGORI[i].label;
    }
    return id;
  }

  function jerami(item) {
    var jenis = JENIS[item.jenis] ? JENIS[item.jenis].label : item.jenis;
    return [item.judul, item.deskripsi, item.pic, jenis, labelKategori(item.kategori)]
      .join(' ')
      .toLowerCase();
  }

  function cocok(item, tokens) {
    if (!tokens.length) return true;
    var h = jerami(item);
    return tokens.every(function (t) { return h.indexOf(t) !== -1; });
  }

  /* Membangun potongan teks dengan bagian yang cocok disorot stabilo. */
  function sorot(teks, tokens) {
    var frag = document.createDocumentFragment();
    if (!tokens.length || !teks) {
      frag.appendChild(document.createTextNode(teks || ''));
      return frag;
    }

    var rendah = teks.toLowerCase();
    var i = 0;

    while (i < teks.length) {
      var posisi = -1;
      var panjang = 0;

      for (var t = 0; t < tokens.length; t++) {
        var p = rendah.indexOf(tokens[t], i);
        if (p === -1) continue;
        if (posisi === -1 || p < posisi || (p === posisi && tokens[t].length > panjang)) {
          posisi = p;
          panjang = tokens[t].length;
        }
      }

      if (posisi === -1) {
        frag.appendChild(document.createTextNode(teks.slice(i)));
        break;
      }
      if (posisi > i) frag.appendChild(document.createTextNode(teks.slice(i, posisi)));

      var m = buat('mark', 'stabilo', teks.slice(posisi, posisi + panjang));
      frag.appendChild(m);
      i = posisi + panjang;
    }

    return frag;
  }

  /* ---------------------- Render ---------------------- */

  function buatKartu(item, tokens, indeks) {
    var bisaDibuka = punyaTautan(item.url);
    var jenis = JENIS[item.jenis] || JENIS.web;

    var kartu = buat(bisaDibuka ? 'a' : 'div', 'kartu' + (bisaDibuka ? '' : ' kartu--kosong'));
    kartu.style.setProperty('--i', String(indeks));

    if (bisaDibuka) {
      kartu.href = item.url;
      kartu.target = '_blank';
      kartu.rel = 'noopener noreferrer';
    }

    var atas = buat('div', 'kartu__atas');
    atas.appendChild(ikon(jenis.ikon, 'kartu__ikon'));
    atas.appendChild(buat('span', 'kartu__jenis', jenis.label));

    if (item.privat) {
      var stempel = buat('span', 'kartu__privat', 'Privat');
      stempel.title = 'Hanya bisa dibuka oleh akun yang diberi akses';
      atas.appendChild(stempel);
    }
    if (bisaDibuka) atas.appendChild(ikon('i-panah', 'kartu__panah'));
    kartu.appendChild(atas);

    var judul = buat('h3', 'kartu__judul');
    judul.appendChild(sorot(item.judul, tokens));
    kartu.appendChild(judul);

    if (item.deskripsi) {
      var desk = buat('p', 'kartu__deskripsi');
      desk.appendChild(sorot(item.deskripsi, tokens));
      kartu.appendChild(desk);
    }

    var bawah = buat('div', 'kartu__bawah');
    if (!bisaDibuka) {
      bawah.appendChild(buat('span', 'kartu__peringatan', 'Tautan belum diisi'));
    } else {
      if (item.pic) bawah.appendChild(buat('span', null, item.pic));
      if (item.diperbarui) bawah.appendChild(buat('span', null, formatTanggal(item.diperbarui)));
    }
    if (bawah.childNodes.length) kartu.appendChild(bawah);

    return kartu;
  }

  function buatBagian(label, items, tokens, opsi) {
    opsi = opsi || {};
    var bagian = buat('section', 'bagian');

    var kop = buat('div', 'bagian__kop');
    var judul = buat('h2', 'bagian__judul');
    if (opsi.stabilo) {
      judul.appendChild(buat('mark', 'stabilo', label));
    } else {
      judul.textContent = label;
    }
    kop.appendChild(judul);
    kop.appendChild(buat('span', 'bagian__garis'));
    kop.appendChild(buat('span', 'bagian__hitung', items.length + ' tautan'));
    bagian.appendChild(kop);

    var grid = buat('div', 'kartu-grid');
    items.forEach(function (item, i) { grid.appendChild(buatKartu(item, tokens, i)); });
    bagian.appendChild(grid);

    return bagian;
  }

  function render() {
    var tokens = tokenisasi(state.query);
    var terpilih = state.items.filter(function (item) { return cocok(item, tokens); });

    el.isi.textContent = '';

    if (!state.items.length) {
      var galat = buat('div', 'kosong');
      galat.appendChild(buat('p', 'kosong__judul', 'Daftar tautan belum bisa dimuat.'));
      galat.appendChild(buat('p', 'kosong__sub', 'Muat ulang halaman. Jika tetap kosong, hubungi tim kurikulum.'));
      el.isi.appendChild(galat);
      el.status.textContent = 'Daftar tautan gagal dimuat.';
      return;
    }

    if (!terpilih.length) {
      var kosong = el.tplKosong.content.cloneNode(true);
      kosong.querySelector('.kosong__sub').textContent =
        'Tidak ada tautan yang cocok dengan “' + state.query.trim() + '”.';
      kosong.querySelector('#reset-cari').addEventListener('click', function () {
        el.cari.value = '';
        state.query = '';
        sudahDigulung = false;
        render();
        el.cari.focus();
      });
      el.isi.appendChild(kosong);
      el.status.textContent = 'Tidak ada hasil untuk ' + state.query.trim() + '.';
      return;
    }

    if (tokens.length) {
      /* Sedang mencari: satu daftar rata, tanpa bagian pinned agar tidak ganda. */
      el.isi.appendChild(buatBagian('Hasil pencarian', terpilih, tokens));
      el.status.textContent = terpilih.length + ' tautan cocok dengan ' + state.query.trim() + '.';
      return;
    }

    var pinned = terpilih.filter(function (i) { return i.pinned; });
    if (pinned.length) {
      el.isi.appendChild(buatBagian('Sering dibuka', pinned, tokens, { stabilo: true }));
    }

    KATEGORI.forEach(function (kat) {
      var isiKat = terpilih.filter(function (i) { return i.kategori === kat.id; });
      if (isiKat.length) el.isi.appendChild(buatBagian(kat.label, isiKat, tokens));
    });

    /* Kategori tak dikenal dari Sheet tetap ditampilkan, jangan sampai hilang diam-diam. */
    var dikenal = KATEGORI.map(function (k) { return k.id; });
    var lain = terpilih.filter(function (i) { return dikenal.indexOf(i.kategori) === -1; });
    if (lain.length) el.isi.appendChild(buatBagian('Lainnya', lain, tokens));

    el.status.textContent = terpilih.length + ' tautan ditampilkan.';
  }

  /* ---------------------- Kaki & pemberitahuan ---------------------- */

  function perbaruiKaki() {
    var bagian = [];
    if (state.sumber === 'sheet') {
      bagian.push('Sumber: Google Sheet');
      bagian.push('disegarkan ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    } else if (state.sumber === 'cadangan') {
      bagian.push('Sumber: salinan cadangan');
      if (state.diperbarui) bagian.push('per ' + formatTanggal(state.diperbarui));
    }
    el.kakiMeta.textContent = bagian.join(' · ');

    var saran = state.items.filter(function (i) {
      return i.kategori === 'masukan' && punyaTautan(i.url);
    })[0];

    if (saran) {
      el.tautanSaran.href = saran.url;
      el.tautanSaran.target = '_blank';
      el.tautanSaran.rel = 'noopener noreferrer';
    } else {
      el.tautanSaran.removeAttribute('href');
    }
  }

  function labelCadangan() {
    return state.diperbarui ? ' per ' + formatTanggal(state.diperbarui) : '';
  }

  function tampilkanPemberitahuan(pesan) {
    el.pemberitahuan.textContent = '';
    var p = buat('p', 'pemberitahuan__isi', pesan);
    el.pemberitahuan.appendChild(p);
    el.pemberitahuan.hidden = false;
  }

  /* ---------------------- Pemuatan data ---------------------- */

  function muatKonfigurasi() {
    return fetch(CONFIG_URL, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (c) { SHEET_CSV_URL = (c && c.sheetCsvUrl) || ''; });
  }

  function muatCadangan() {
    return fetch(SNAPSHOT_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var mentah = Array.isArray(data) ? data : data.items || [];
        state.items = normalisasi(mentah);
        state.diperbarui = (data && data.diperbarui) || '';
        state.sumber = 'cadangan';
        render();
        perbaruiKaki();
      });
  }

  function muatSheet() {
    if (!SHEET_CSV_URL) return Promise.resolve();

    return fetch(SHEET_CSV_URL, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (teks) {
        var items = normalisasi(csvKeObjek(teks));

        /* Sheet terbaca tapi belum ada baris data — ini bukan kegagalan sambungan,
           jadi pesannya harus berbeda supaya tidak menyesatkan saat penyiapan awal. */
        if (!items.length) {
          tampilkanPemberitahuan(
            'Google Sheet sudah tersambung, tapi belum ada baris data di bawah header. ' +
            'Menampilkan salinan cadangan' + labelCadangan() + '.'
          );
          return;
        }

        state.items = items;
        state.sumber = 'sheet';
        state.gagalSheet = false;
        el.pemberitahuan.hidden = true;
        render();
        perbaruiKaki();
      })
      .catch(function () {
        state.gagalSheet = true;
        if (state.items.length) {
          tampilkanPemberitahuan(
            'Sambungan ke Google Sheet gagal. Menampilkan salinan cadangan' +
            labelCadangan() + '.'
          );
        }
      });
  }

  /* ---------------------- Peristiwa ---------------------- */

  /* Begitu orang mulai mengetik, kop halaman digulung ke atas sekali saja
     supaya hasil pencarian langsung terlihat tanpa perlu menggulir sendiri. */
  var sudahDigulung = false;

  function gulungKeHasil() {
    if (!rapikan(state.query)) { sudahDigulung = false; return; }
    if (sudahDigulung) return;
    sudahDigulung = true;

    var atas = el.bar.offsetTop;
    if (window.scrollY >= atas - 1) return;

    var halus = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: atas, behavior: halus ? 'smooth' : 'auto' });
  }

  el.cari.addEventListener('input', function () {
    state.query = el.cari.value;
    render();
    gulungKeHasil();
  });

  document.addEventListener('keydown', function (e) {
    var aktif = document.activeElement;
    var sedangMengetik = aktif && (aktif.tagName === 'INPUT' || aktif.tagName === 'TEXTAREA' || aktif.isContentEditable);

    if (e.key === '/' && !sedangMengetik && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      el.cari.focus();
      el.cari.select();
      return;
    }

    if (e.key === 'Escape' && aktif === el.cari) {
      if (el.cari.value) {
        el.cari.value = '';
        state.query = '';
        sudahDigulung = false;
        render();
      } else {
        el.cari.blur();
      }
    }
  });

  /* ---------------------- Mulai ---------------------- */

  el.tanggal.textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  /* Konfigurasi diambil berbarengan; salinan cadangan yang dirender lebih dulu. */
  var siapKonfigurasi = muatKonfigurasi();

  muatCadangan()
    .catch(function () {
      state.items = [];
      render();
    })
    .then(function () { return siapKonfigurasi; })
    .then(muatSheet);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* diabaikan */ });
    });
  }
})();
