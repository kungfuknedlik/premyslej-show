/* ==========================================================================
   Klasické sekce pod letem: odhalení při prvním zobrazení, náběh čísel,
   lišta let, galerie modulů s lightboxem, plynulý skok na kotvu a přehrání
   záznamu aplikace až po kliknutí. Bez tohoto skriptu je obsah rovnou vidět,
   čísla mají konečnou hodnotu, fotky se otevřou jako soubor a tlačítka
   záznamů jsou obyčejné odkazy.
   ========================================================================== */
(function () {
  'use strict';
  var koren = document.documentElement;
  var bezPohybu = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Sekce leží jedenáct obrazovek pod začátkem stránky. Všechno níže se proto spustí, až když se
     k nim návštěvník blíží (nebo hned, pokud stránku otevřel rovnou na nich). Úvodní obrazovku
     a film tak tento skript nezdržuje. */
  var spusteno = false;
  function spust() {
    if (spusteno) return;
    spusteno = true;

    /* ---------- Odhalení prvků (jediná animace sekcí) ---------- */
    var prvky = document.querySelectorAll('.odhal');
    if ('IntersectionObserver' in window && !bezPohybu) {
      koren.classList.add('odhalovani');
      var pozorovatel = new IntersectionObserver(function (zaznamy) {
        zaznamy.forEach(function (z) {
          if (z.isIntersecting) { z.target.classList.add('je-videt'); pozorovatel.unobserve(z.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px' });
      Array.prototype.forEach.call(prvky, function (el) { pozorovatel.observe(el); });
    }

    /* ---------- Počítadla v sekci „Projekt v číslech“ ----------
       Jen skutečná čísla z podkladů. Konečná hodnota je v HTML a zůstává v něm: po dobu náběhu
       se jen schová mimo obraz a vedle ní běží pomocný prvek skrytý před čtečkami. Náběh se spustí
       jednou, když je číslo vidět, trvá 1,1 s (strop je 1,2 s) a při omezeném pohybu se nespouští. */
    var DELKA_NABEHU = 1100;
    var NBSP = String.fromCharCode(160);      // pevná mezera mezi tisíci
    function zapis(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }   // 71400 -> 71 400
    function napocitej(cislo) {
      var cil = parseInt(cislo.textContent.replace(/\D/g, ''), 10);
      if (!cil) return;
      var bezi = document.createElement('span');
      bezi.setAttribute('aria-hidden', 'true');
      bezi.textContent = '0';
      cislo.classList.add('jen-ctecka');
      cislo.parentNode.insertBefore(bezi, cislo.nextSibling);
      var start = performance.now(), hotovo = false;
      function konec() {
        if (hotovo) return;
        hotovo = true;
        bezi.remove();
        cislo.classList.remove('jen-ctecka');
      }
      function snimek(ted) {
        if (hotovo) return;
        var p = Math.min(1, (ted - start) / DELKA_NABEHU);
        if (p >= 1) { konec(); return; }
        bezi.textContent = zapis(Math.round(cil * (1 - Math.pow(1 - p, 3))));      // ke konci zpomaluje
        requestAnimationFrame(snimek);
      }
      requestAnimationFrame(snimek);
      setTimeout(konec, DELKA_NABEHU + 80);      // pojistka: karta na pozadí nekreslí snímky
    }
    var cisla = document.querySelectorAll('[data-pocitadlo]');
    if (cisla.length && 'IntersectionObserver' in window && !bezPohybu) {
      var hlidac = new IntersectionObserver(function (zaznamy) {
        zaznamy.forEach(function (z) {
          if (z.isIntersecting) { hlidac.unobserve(z.target); napocitej(z.target); }
        });
      }, { threshold: 0.6 });
      Array.prototype.forEach.call(cisla, function (el) { hlidac.observe(el); });
    }

    /* ---------- Lišta let: navigace po modulech ----------
       Měří výšku hlavičky a vodorovného pásu (podle nich se modul po přeskoku zastaví pod nimi),
       zvýrazňuje modul, který je právě na řadě, a šipkami přesouvá fokus mezi položkami.
       Bez skriptu je lišta obyčejný seznam odkazů na kotvy. */
    var podLetem = document.querySelector('.pod-letem');
    var hlavicka = document.querySelector('.pod-letem .lista');
    var osaNav = document.querySelector('[data-osa-nav]');
    if (podLetem && hlavicka && osaNav) {
      var seznam = osaNav.querySelector('ol');
      var polozky = Array.prototype.map.call(osaNav.querySelectorAll('a[href^="#"]'), function (a) {
        return { odkaz: a, cil: document.getElementById(a.getAttribute('href').slice(1)) };
      }).filter(function (p) { return p.cil; });
      var siroka = window.matchMedia('(min-width: 1280px)');
      var vyskaHlavicky = 0, vyskaPasu = 0, aktivni = null, cekaOsa = false;

      var zmer = function () {
        vyskaHlavicky = hlavicka.offsetHeight;
        vyskaPasu = siroka.matches ? 0 : osaNav.offsetHeight;
        podLetem.style.setProperty('--hlavicka', vyskaHlavicky + 'px');
        podLetem.style.setProperty('--osa-pas', vyskaPasu + 'px');
      };
      var oznac = function () {
        cekaOsa = false;
        // čára čtení: kousek pod hlavičkou (a pásem); aktuální je poslední modul, který ji už překročil
        var cara = vyskaHlavicky + vyskaPasu + 40;
        var novy = null;
        polozky.forEach(function (p) { if (p.cil.getBoundingClientRect().top <= cara) novy = p; });
        if (!novy && polozky.length && polozky[0].cil.getBoundingClientRect().top < window.innerHeight * 0.6) novy = polozky[0];
        if (novy === aktivni) return;
        if (aktivni) aktivni.odkaz.removeAttribute('aria-current');
        aktivni = novy;
        if (!aktivni) return;
        aktivni.odkaz.setAttribute('aria-current', 'location');
        if (!siroka.matches) {            // vodorovný pás: aktuální položku dostat do zorného pole (jen vodorovně)
          var a = aktivni.odkaz;
          var vlevo = a.offsetLeft - (seznam.clientWidth - a.offsetWidth) / 2;
          if (seznam.scrollTo) seznam.scrollTo({ left: vlevo, behavior: bezPohybu ? 'auto' : 'smooth' }); else seznam.scrollLeft = vlevo;
        }
      };
      var priRolovani = function () { if (!cekaOsa) { cekaOsa = true; window.requestAnimationFrame(oznac); } };
      var priZmene = function () { zmer(); aktivni && aktivni.odkaz.removeAttribute('aria-current'); aktivni = null; oznac(); };

      zmer(); oznac();
      window.addEventListener('scroll', priRolovani, { passive: true });
      window.addEventListener('resize', priZmene);
      window.addEventListener('load', priZmene);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(priZmene);

      // šipky, Home a End přesouvají fokus mezi položkami lišty (Tab a Enter fungují jako u běžných odkazů)
      osaNav.addEventListener('keydown', function (ev) {
        var i = -1;
        polozky.forEach(function (p, k) { if (p.odkaz === document.activeElement) i = k; });
        if (i < 0 || ev.altKey || ev.ctrlKey || ev.metaKey) return;
        var k = ev.key, j = i;
        if (k === 'ArrowDown' || k === 'ArrowRight') j = Math.min(polozky.length - 1, i + 1);
        else if (k === 'ArrowUp' || k === 'ArrowLeft') j = Math.max(0, i - 1);
        else if (k === 'Home') j = 0;
        else if (k === 'End') j = polozky.length - 1;
        else return;
        ev.preventDefault();
        polozky[j].odkaz.focus();
      });
    }

    /* ---------- Plynulý skok na kotvu uvnitř stránky ---------- */
    document.addEventListener('click', function (ev) {
      var odkaz = ev.target.closest && ev.target.closest('.pod-letem a[href^="#"]');
      if (!odkaz) return;
      var cil = document.getElementById(odkaz.getAttribute('href').slice(1));
      if (!cil) return;
      ev.preventDefault();
      cil.scrollIntoView({ behavior: bezPohybu ? 'auto' : 'smooth', block: 'start' });
      try { history.replaceState(null, '', odkaz.getAttribute('href')); } catch (e) { /* vložený rámec to nemusí dovolit */ }
      // fokus pro klávesnici a čtečky, bez dalšího posunu
      if (!cil.hasAttribute('tabindex')) cil.setAttribute('tabindex', '-1');
      cil.focus({ preventScroll: true });
    });

    /* ---------- Galerie modulu: pás fotek s ručním posunem ----------
       Šipky, tažení myší a prst. Nic se samo netočí. Bez skriptu je pás obyčejný posuvný seznam odkazů. */
    var galerie = Array.prototype.slice.call(document.querySelectorAll('[data-galerie]'));
    galerie.forEach(function (g) {
      var pas = g.querySelector('.galerie__pas');
      if (!pas) return;
      var obal = document.createElement('div');
      obal.className = 'galerie__obal';
      pas.parentNode.insertBefore(obal, pas);
      obal.appendChild(pas);
      var sipka = function (trida, popis, smer) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'galerie__sipka ' + trida; b.setAttribute('aria-label', popis);
        b.addEventListener('click', function () {
          pas.scrollBy({ left: smer * pas.clientWidth * 0.8, behavior: bezPohybu ? 'auto' : 'smooth' });
        });
        obal.appendChild(b);
        return b;
      };
      var zpet = sipka('galerie__sipka--zpet', 'Předchozí fotky', -1);
      var dalsi = sipka('galerie__sipka--dalsi', 'Další fotky', 1);
      g.classList.add('galerie--se-sipkami');
      var cekaPas = false;
      var stavSipek = function () {
        cekaPas = false;
        var konec = pas.scrollWidth - pas.clientWidth;
        zpet.disabled = pas.scrollLeft <= 2;
        dalsi.disabled = pas.scrollLeft >= konec - 2;
      };
      pas.addEventListener('scroll', function () { if (!cekaPas) { cekaPas = true; window.requestAnimationFrame(stavSipek); } }, { passive: true });
      window.addEventListener('resize', stavSipek);
      stavSipek();

      // tažení myší (prst posouvá pás sám od sebe); po tažení se kliknutí na fotku neprovede
      var tah = null;
      Array.prototype.forEach.call(pas.querySelectorAll('a, img'), function (el) { el.draggable = false; });
      pas.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
        tah = { x: ev.clientX, odkud: pas.scrollLeft, posun: 0 };
      });
      window.addEventListener('pointermove', function (ev) {
        if (!tah) return;
        tah.posun = ev.clientX - tah.x;
        if (Math.abs(tah.posun) > 6) pas.classList.add('je-tazen');
        if (pas.classList.contains('je-tazen')) pas.scrollLeft = tah.odkud - tah.posun;
      });
      window.addEventListener('pointerup', function () {
        if (!tah) return;
        var tazeno = pas.classList.contains('je-tazen');
        pas.classList.remove('je-tazen');
        tah = null;
        if (tazeno) {
          var zrus = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
          pas.addEventListener('click', zrus, { capture: true, once: true });
          setTimeout(function () { pas.removeEventListener('click', zrus, true); }, 0);
        }
      });
    });

    /* ---------- Lightbox: velká fotka po kliknutí ----------
       Jeden <dialog> pro celou stránku. Přepínání šipkami, klávesami ← → Home End a přejetím prstem,
       zavření klávesou Esc, křížkem nebo kliknutím mimo fotku. Velké fotky se načítají až tady. */
    var lightbox = null, lbFoto, lbPoradi, lbZpet, lbDalsi, lbSeznam = [], lbIndex = 0;
    function lbPostav() {
      lightbox = document.createElement('dialog');
      lightbox.className = 'lightbox';
      lightbox.setAttribute('aria-label', 'Fotka ve velkém');
      var tlacitko = function (trida, popis) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = trida; b.setAttribute('aria-label', popis);
        return b;
      };
      var ram = document.createElement('figure');
      lbFoto = document.createElement('img');
      lbFoto.decoding = 'async'; lbFoto.draggable = false;
      lbPoradi = document.createElement('figcaption');
      lbPoradi.setAttribute('aria-live', 'polite');
      ram.appendChild(lbFoto); ram.appendChild(lbPoradi);
      lbZpet = tlacitko('lightbox__sipka lightbox__sipka--zpet', 'Předchozí fotka');
      lbDalsi = tlacitko('lightbox__sipka lightbox__sipka--dalsi', 'Další fotka');
      var zavrit = tlacitko('lightbox__zavrit', 'Zavřít');
      lightbox.appendChild(ram); lightbox.appendChild(lbZpet); lightbox.appendChild(lbDalsi); lightbox.appendChild(zavrit);
      document.body.appendChild(lightbox);

      lbZpet.addEventListener('click', function () { lbUkaz(lbIndex - 1); });
      lbDalsi.addEventListener('click', function () { lbUkaz(lbIndex + 1); });
      zavrit.addEventListener('click', function () { lightbox.close(); });
      // kliknutí mimo fotku a tlačítka zavře
      var prepnuto = 0;                             // čas posledního přepnutí přejetím (kliknutí hned po něm nezavírá)
      lightbox.addEventListener('click', function (ev) {
        if ((ev.target === lightbox || ev.target === ram) && Date.now() - prepnuto > 400) lightbox.close();
      });
      lightbox.addEventListener('keydown', function (ev) {
        var k = ev.key;
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown') { ev.preventDefault(); lbUkaz(lbIndex + 1); }
        else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') { ev.preventDefault(); lbUkaz(lbIndex - 1); }
        else if (k === 'Home') { ev.preventDefault(); lbUkaz(0); }
        else if (k === 'End') { ev.preventDefault(); lbUkaz(lbSeznam.length - 1); }
        ev.stopPropagation();                       // klávesy tu nemají řídit stránku pod lightboxem (Esc řeší dialog sám)
      });
      // stránka pod lightboxem se nemá posouvat kolečkem ani prstem
      lightbox.addEventListener('wheel', function (ev) { ev.preventDefault(); }, { passive: false });
      lightbox.addEventListener('touchmove', function (ev) { ev.preventDefault(); }, { passive: false });
      // přejetí prstem (nebo tažení myší) do strany přepne fotku
      var dotyk = null;
      lightbox.addEventListener('pointerdown', function (ev) { dotyk = { x: ev.clientX, y: ev.clientY }; });
      lightbox.addEventListener('pointerup', function (ev) {
        if (!dotyk) return;
        var dx = ev.clientX - dotyk.x, dy = ev.clientY - dotyk.y;
        dotyk = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { prepnuto = Date.now(); lbUkaz(lbIndex + (dx < 0 ? 1 : -1)); }
      });
      lightbox.addEventListener('pointercancel', function () { dotyk = null; });
    }
    function lbUkaz(i) {
      if (i < 0 || i >= lbSeznam.length) return;
      lbIndex = i;
      var odkaz = lbSeznam[i], nahled = odkaz.querySelector('img');
      lbFoto.alt = nahled ? nahled.alt : '';
      lbFoto.src = odkaz.getAttribute('href');
      lbPoradi.textContent = (i + 1) + ' / ' + lbSeznam.length;
      lbZpet.disabled = i === 0;
      lbDalsi.disabled = i === lbSeznam.length - 1;
      // sousední fotky dopředu, ať přepnutí nečeká na síť
      [i - 1, i + 1].forEach(function (j) { if (lbSeznam[j]) { var o = new Image(); o.src = lbSeznam[j].getAttribute('href'); } });
    }
    if (window.HTMLDialogElement && HTMLDialogElement.prototype.showModal) {
      document.addEventListener('click', function (ev) {
        var odkaz = ev.target.closest && ev.target.closest('[data-galerie] a[data-foto]');
        if (!odkaz || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
        ev.preventDefault();
        if (!lightbox) lbPostav();
        lbSeznam = Array.prototype.slice.call(odkaz.closest('[data-galerie]').querySelectorAll('a[data-foto]'));
        lbFoto.removeAttribute('src');
        lbUkaz(lbSeznam.indexOf(odkaz));
        lightbox.showModal();
      });
    }

    /* ---------- Záznam aplikace: video se vloží a načte až po kliknutí ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('[data-prehrat]'), function (tlacitko) {
      tlacitko.addEventListener('click', function (ev) {
        ev.preventDefault();
        var ram = tlacitko.parentNode;
        var nahled = ram.querySelector('img');
        var video = document.createElement('video');
        video.controls = true; video.autoplay = true; video.playsInline = true; video.preload = 'metadata';
        if (nahled) { video.poster = nahled.currentSrc || nahled.src; video.setAttribute('aria-label', nahled.alt); }
        video.src = tlacitko.getAttribute('href');
        ram.appendChild(video);
        tlacitko.remove();
        video.focus();
      });
    });
  }

  var sekce = document.querySelector('.pod-letem');
  if (!sekce || !('IntersectionObserver' in window)) { spust(); return; }
  var blizko = new IntersectionObserver(function (zaznamy) {
    if (zaznamy.some(function (z) { return z.isIntersecting; })) { blizko.disconnect(); spust(); }
  }, { rootMargin: '150% 0px 150% 0px' });     // jeden a půl obrazovky předem
  blizko.observe(sekce);
})();
