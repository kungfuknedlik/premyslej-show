/* ==========================================================================
   Scéna řízená rolováním – mechanismus.
   Rolování neposouvá stránku, ale pohání film složený z úseků (klipů).
   Tenhle soubor neví nic o obsahu stránky: čte jen značky v HTML
   (data-scena, data-usek, data-okno, data-zastavka, data-pas, data-skok, data-zavoj).

   Polohy na dráze se zapisují buď jako podíl celé dráhy (0–1), nebo podle úseku:
   „4:0.85“ = 85 % úseku, který má data-usek="4". Druhý zápis se nerozbije, když se
   změní váhy nebo přibude úsek.
   ========================================================================== */
(function () {
  'use strict';

  var koren = document.documentElement;
  var scena = document.querySelector('[data-scena]');
  var pas = document.querySelector('[data-pas]');
  if (!scena || !pas) return;

  /* ---------- Nastavení ---------- */
  var SEV = 0.16;            // šířka švu mezi úseky (v násobcích výšky obrazovky)
  var DOSAH = 0.8;           // klip se stahuje, když je poloha blíž než tolik výšek obrazovky před začátkem nebo za koncem úseku
  var PRIBLIZENI = 0.12;     // o jakou část vzdálenosti se čas klipu přiblíží cíli za jeden snímek
  var MRTVE_PASMO = 0.008;   // rozdíl pod 8 ms se během pohybu neřeší
  var NABEH_VH = 0.126;      // výchozí náběh a doběh okna titulku (ve výškách obrazovky)
  var PRESAH_ZAVOJE = 0.45;  // závoj se dotáhne do plna tolik výšek obrazovky za koncem dráhy
  var POSUN_VH = 4;          // největší svislý posun titulku přes celé okno
  var RYCHLOST_SKOKU = 2200; // ms na jednu výšku obrazovky při skoku na zastávku

  var mqPohyb = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqUzky = window.matchMedia('(max-width: 768px)');

  /* ---------- Tempo uvnitř úseku ----------
     data-krivka="0.907:0.78" říká: v 90,7 % rolování úseku má být odehráno 78 % klipu.
     Mezi body se postupuje rovnoměrně. Slouží ke zkrácení míst, kde se obraz skoro
     nemění, aniž by se klip stříhal (všechny snímky zůstávají, šev se nepohne). */
  function nactiKrivku(zapis) {
    var body = [[0, 0]];
    (zapis || '').split(',').forEach(function (b) {
      var c = b.trim().split(':').map(parseFloat);
      if (c.length === 2 && c[0] > 0 && c[0] < 1 && c[1] >= 0 && c[1] <= 1) body.push(c);
    });
    body.push([1, 1]);
    return body;
  }
  function podleKrivky(body, p) {
    for (var i = 1; i < body.length; i++) {
      if (p <= body[i][0]) {
        var a = body[i - 1], b = body[i];
        return a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]);
      }
    }
    return 1;
  }

  /* ---------- Úseky ---------- */
  var useky = Array.prototype.map.call(scena.querySelectorAll('[data-usek]'), function (el, i) {
    return {
      i: i, el: el,
      id: el.getAttribute('data-usek') || String(i + 1),
      nahled: el.querySelector('.usek__nahled'),
      klip: el.querySelector('.usek__klip'),
      vaha: parseFloat(el.getAttribute('data-vaha')) || 1.1,
      delka: parseFloat(el.getAttribute('data-delka')) || 5,
      krivka: nactiKrivku(el.getAttribute('data-krivka')),
      zacatek: 0,            // začátek úseku na dráze (ve výškách obrazovky), dopočítá se
      p: 0,                  // místní postup úsekem 0–1
      pruhlednost: i === 0 ? 1 : 0,
      stav: 'ceka',          // ceka → stahuje → pripraven | chyba
      maKlip: false,         // klip už vykreslil první skutečný snímek
      cas: 0,                // čas, ke kterému se přehrávací hlava plynule blíží
      cil: 0
    };
  });
  var konec = scena.querySelector('[data-konec]');
  var soucetVah = 0;
  useky.forEach(function (u) { u.zacatek = soucetVah; soucetVah += u.vaha; });

  /* ---------- Převod zápisu polohy na podíl dráhy ---------- */
  // „4:0.85“ = 85 % úseku s data-usek="4"; „0.54“ = podíl celé dráhy.
  function naT(zapis) {
    zapis = String(zapis).trim();
    var k = zapis.indexOf(':');
    if (k < 0) return parseFloat(zapis);
    var id = zapis.slice(0, k), p = parseFloat(zapis.slice(k + 1)), u = null;
    useky.forEach(function (x) { if (x.id === id) u = x; });
    if (!u) { console.warn('Scéna: neznámý úsek „' + id + '“ v zápisu „' + zapis + '“.'); return 0; }
    return (u.zacatek + p * u.vaha) / soucetVah;
  }
  // Délka náběhu: „0.2vh“ = ve výškách obrazovky, holé číslo = podíl dráhy.
  function naDelku(zapis) {
    return /vh\s*$/.test(zapis) ? parseFloat(zapis) / soucetVah : parseFloat(zapis);
  }

  /* ---------- Okna titulků a zastávky ---------- */
  var okna = Array.prototype.map.call(document.querySelectorAll('[data-okno]'), function (el, i) {
    var meze = el.getAttribute('data-okno').trim().split(/\s+/).map(naT);
    return {
      i: i, el: el, od: meze[0], doo: meze[1],
      nabeh: el.hasAttribute('data-nabeh') ? naDelku(el.getAttribute('data-nabeh')) : NABEH_VH / soucetVah,
      dobeh: el.hasAttribute('data-dobeh') ? naDelku(el.getAttribute('data-dobeh')) : NABEH_VH / soucetVah,
      zastavka: el.hasAttribute('data-zastavka') ? naT(el.getAttribute('data-zastavka')) : null,
      text: el.querySelector('.okno__text'),
      liny: el.querySelector('img[data-src]'),       // obrázek okna, který se načte až před jeho zobrazením
      pruhlednost: i === 0 ? 1 : 0
    };
  });
  var zastavky = okna.filter(function (o) { return o.zastavka !== null; }).map(function (o) { return o.zastavka; });
  if (zastavky.indexOf(1) === -1) zastavky.push(1);     // konec dráhy je vždy poslední zastávka
  zastavky.sort(function (a, b) { return a - b; });

  var skoky = Array.prototype.map.call(document.querySelectorAll('[data-skok]'), function (b) {
    return { el: b, t: naT(b.getAttribute('data-skok')) };
  });

  /* ---------- Bílý závoj ve finále ----------
     Poslední snímek filmu je skoro bílý, ne úplně. Závoj ho od zadané polohy plynule
     dorovná do čisté bílé a dotáhne se kousek za koncem dráhy, kdy už zdola najíždí
     první světlá sekce – ta tak přijde bílou na bílou, bez tvrdé hrany. */
  var zavoj = scena.querySelector('[data-zavoj]');
  var zavojOd = zavoj ? naT(zavoj.getAttribute('data-zavoj')) * soucetVah : 0;   // ve výškách obrazovky
  var zavojPr = -1;

  /* ---------- Stav ---------- */
  var vyska = 0;             // výška scény v pixelech (stejný metr pro pás i scénu)
  var overeno = false;       // už se zkontrolovalo, že je scéna position: fixed
  var t = 0;                 // globální postup 0–1
  var rezim = 'film';        // 'film' = klipy, 'nahledy' = jen prolínání náhledů
  var smycka = 0;            // id běžící smyčky requestAnimationFrame (0 = stojí)
  var aktualni = -1;         // index úseku naposledy oznámeného událostí
  var odemceno = false;      // iOS: klipy už byly jednou krátce spuštěny dotykem
  var skok = null;           // právě běžící plynulý skok na zastávku

  function zvolRezim() {
    var setri = navigator.connection && navigator.connection.saveData;
    rezim = (mqPohyb.matches || mqUzky.matches || setri) ? 'nahledy' : 'film';
    koren.setAttribute('data-rezim', rezim);
  }

  function omez(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function hladce(a, b, x) { var k = omez((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }

  /* ---------- Výška dráhy ---------- */
  // v = výška scény z rozvržení (hlásí ji ResizeObserver); bez ní si ji funkce zjistí sama.
  // Bere se výška z rozvržení, ne obrys na obrazovce: obrys by při úvodním uvítání zahrnul i dočasné
  // zvětšení scény (scale) a dráha by vyšla o několik procent delší.
  function prepocitej(v) {
    if (typeof v !== 'number') v = parseFloat(window.getComputedStyle(scena).height);
    if (!v) return;                                   // okno ještě nemá výšku; zkusí se to znovu
    if (!overeno) {
      overeno = true;
      if (window.getComputedStyle(scena).position !== 'fixed') {
        console.warn('Scéna: prvek [data-scena] není position: fixed. Bez toho rolování film nepohání.');
      }
    }
    vyska = v;
    // Výšku pásu má správně už CSS (scena.css: součet vah + 1 krát výška obrazovky). Skript ji přepíše,
    // jen když nesedí – každý zápis totiž znamená nové rozvržení celé dlouhé stránky pod filmem.
    var cil = (soucetVah + 1) * vyska;
    if (Math.abs(pas.getBoundingClientRect().height - cil) >= 1) pas.style.height = Math.round(cil) + 'px';
    aktualizuj();
  }

  /* ---------- Načítání náhledů a klipů ---------- */
  // Náhledy dalších úseků mají adresu v data-src a načtou se, až je úsek v dosahu.
  function nactiNahled(img) {
    var adresa = img && img.getAttribute('data-src');
    if (adresa) { img.removeAttribute('data-src'); img.src = adresa; }
  }

  function nactiKlip(u) {
    if (u.stav !== 'ceka' || rezim !== 'film') return;
    u.stav = 'stahuje';
    // Klip se stáhne celý a přehrává se z paměti. Převíjení pak nezávisí na tom,
    // jestli server umí částečné požadavky, a žádný skok nečeká na síť.
    fetch(u.klip.getAttribute('data-src')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (blob) {
      u.klip.addEventListener('loadeddata', function () {
        u.stav = 'pripraven';
        if (isFinite(u.klip.duration) && u.klip.duration > 0) u.delka = u.klip.duration;
        u.cas = u.cil = cilovyCas(u);
        u.klip.currentTime = u.cas;
        var hotovo = function () { u.maKlip = true; u.el.classList.add('ma-klip'); };
        if (u.klip.requestVideoFrameCallback) u.klip.requestVideoFrameCallback(hotovo);
        else u.klip.addEventListener('seeked', hotovo, { once: true });
        if (odemceno) odemkni(u);
        rozjed();
      }, { once: true });
      // Kdyby prostředí přehrávání z paměti nedovolilo (některé vložené rámce), klip se načte přímo z adresy.
      u.klip.addEventListener('error', function () {
        if (u.stav === 'pripraven') return;
        u.klip.src = u.klip.getAttribute('data-src');
        u.klip.load();
      }, { once: true });
      u.klip.src = URL.createObjectURL(blob);
      u.klip.load();
    }).catch(function (e) {
      u.stav = 'chyba';
      console.error('Scéna: klip úseku ' + (u.i + 1) + ' se nenačetl (' + e.message + '). Zůstává náhled.');
    });
  }

  // iOS Safari zobrazí snímek videa až po prvním spuštění z dotyku uživatele.
  function odemkni(u) {
    var slib = u.klip.play();
    if (slib && slib.then) slib.then(function () { u.klip.pause(); }).catch(function () {});
  }
  function prvniDotyk() {
    odemceno = true;
    useky.forEach(function (u) { if (u.stav === 'pripraven') odemkni(u); });
    window.removeEventListener('touchstart', prvniDotyk);
    window.removeEventListener('click', prvniDotyk);
  }

  /* ---------- Přehrávací hlava ---------- */
  function cilovyCas(u) { return omez(podleKrivky(u.krivka, u.p) * u.delka, 0, Math.max(0, u.delka - 0.034)); }

  function krok() {
    var bezi = false;
    if (skok) bezi = krokSkoku() || bezi;
    useky.forEach(function (u) {
      if (u.stav !== 'pripraven' || !u.vDosahu) return;
      u.cil = cilovyCas(u);
      var rozdil = u.cil - u.cas;
      if (Math.abs(rozdil) > 0.001) { u.cas += rozdil * PRIBLIZENI; bezi = true; } else { u.cas = u.cil; }
      var odchylka = Math.abs(u.klip.currentTime - u.cas);
      if (u.klip.seeking) { bezi = true; return; }    // dokud klip dohledává, nový cíl se jen pamatuje
      // Během pohybu se drobné rozdíly neřeší; po dojezdu se čas dorovná přesně.
      if (odchylka > MRTVE_PASMO || (u.cas === u.cil && odchylka > 0.0005)) {
        u.klip.currentTime = u.cas;
        bezi = true;
      }
    });
    smycka = bezi ? window.requestAnimationFrame(krok) : 0;
  }
  function rozjed() { if (!smycka) smycka = window.requestAnimationFrame(krok); }

  /* ---------- Přepočet podle rolování ---------- */
  function aktualizuj() {
    if (!vyska) return;
    var syrova = window.scrollY / vyska;                       // poloha včetně rolování za konec dráhy
    var poloha = omez(syrova, 0, soucetVah);                   // poloha na dráze ve výškách obrazovky
    t = soucetVah ? poloha / soucetVah : 0;
    var bezPohybu = mqPohyb.matches;
    var iAkt = 0;

    useky.forEach(function (u) {
      u.p = omez((poloha - u.zacatek) / u.vaha, 0, 1);
      if (poloha >= u.zacatek) iAkt = u.i;
      // Dosah se měří od okrajů úseku, ne od středu: pak nezávisí na váze úseku
      // a na začátku stránky se stahuje jen první klip (pokud je první úsek delší než dosah).
      u.vDosahu = poloha >= u.zacatek - DOSAH && poloha <= u.zacatek + u.vaha + DOSAH;
      if (u.vDosahu) { nactiNahled(u.nahled); nactiKlip(u); }

      var pr;
      if (u.i === 0) pr = 1;
      else if (rezim === 'film') pr = omez((poloha - (u.zacatek - SEV)) / SEV, 0, 1);  // šev: přicházející úsek sílí, odcházející zůstává pod ním
      else pr = hladce(0.25, 0.75, useky[u.i - 1].p);                                  // náhledy se prolínají uprostřed předchozího úseku
      if (pr !== u.pruhlednost) { u.pruhlednost = pr; u.el.style.opacity = pr; }

      // Jemné přiblížení náhledu, aby scéna nebyla mrtvá, dokud nehraje klip.
      var meritko = (bezPohybu || u.maKlip) ? '' : 'scale(' + (1.03 + u.p * 0.14).toFixed(4) + ')';
      if (u.nahled.style.transform !== meritko) u.nahled.style.transform = meritko;
    });

    if (konec) {
      var posledni = useky[useky.length - 1];
      if (posledni.vDosahu && rezim === 'nahledy') nactiNahled(konec);
      var prK = rezim === 'nahledy' ? hladce(0.25, 0.75, posledni.p) : 0;
      konec.style.opacity = prK;
      konec.style.transform = (bezPohybu || rezim !== 'nahledy') ? '' : 'scale(' + (1.03 + posledni.p * 0.06).toFixed(4) + ')';
    }

    if (zavoj) {
      var prZ = Math.round(omez((syrova - zavojOd) / (soucetVah + PRESAH_ZAVOJE - zavojOd), 0, 1) * 1000) / 1000;
      if (prZ !== zavojPr) { zavojPr = prZ; zavoj.style.opacity = prZ; }
    }

    okna.forEach(function (o) {
      var pr = Math.min(
        (o.od <= 0 || o.nabeh <= 0) ? 1 : omez((t - o.od) / o.nabeh, 0, 1),
        (o.doo >= 1 || o.dobeh <= 0) ? 1 : omez((o.doo - t) / o.dobeh, 0, 1)
      );
      if (t < o.od || t > o.doo) pr = 0;
      if (o.liny && t > o.od - 0.2) { nactiNahled(o.liny); o.liny = null; }
      o.pruhlednost = pr;
      o.el.style.opacity = pr;
      o.el.classList.toggle('je-aktivni', pr > 0.5);   // klikat jde, jen když je blok víc než z poloviny vidět
      if (o.text) {
        var mistni = omez((t - o.od) / (o.doo - o.od), 0, 1);
        // první okno odjíždí nahoru, poslední přijíždí zdola a dosedne, ostatní projedou středem
        var y = bezPohybu ? 0 : (o.od <= 0 ? -mistni : (o.doo >= 1 ? (1 - mistni) * 0.5 : 0.5 - mistni)) * POSUN_VH;
        o.text.style.transform = y ? 'translateY(' + y.toFixed(3) + 'vh)' : '';
      }
    });

    // Scéna zveřejňuje, kde v příběhu jsme.
    var pAkt = useky[iAkt].p;
    // Proměnné se zapisují na prvek scény, ne na kořen dokumentu: zápis na kořen by při každém kroku
    // rolování přepočítal styl celé stránky (dědí je všechno), a nikdo jiný než scéna je nepotřebuje.
    scena.style.setProperty('--usek', iAkt);
    scena.style.setProperty('--usek-p', pAkt.toFixed(4));
    scena.style.setProperty('--postup', t.toFixed(4));
    if (iAkt !== aktualni) {
      aktualni = iAkt;
      document.dispatchEvent(new CustomEvent('usek:zmena', { detail: { usek: iAkt, postup: t } }));
    }
    var iZast = 0;
    zastavky.forEach(function (z, k) { if (t >= z - 0.02) iZast = k; });
    skoky.forEach(function (b) {
      var je = Math.abs(b.t - zastavky[iZast]) < 0.001;
      if (je) b.el.setAttribute('aria-current', 'step'); else b.el.removeAttribute('aria-current');
    });

    rozjed();
  }

  /* ---------- Prezentační režim: skok na zastávku ---------- */
  function skocNa(cilT) {
    cilT = omez(cilT, 0, 1);
    var cilY = Math.round(cilT * soucetVah * vyska);
    if (mqPohyb.matches) { skok = null; window.scrollTo(0, cilY); return; }
    var odY = window.scrollY;
    var trvani = omez(Math.abs(cilY - odY) / vyska * RYCHLOST_SKOKU, 500, 6000);
    skok = { odY: odY, cilY: cilY, od: performance.now(), trvani: trvani };
    rozjed();
  }
  function krokSkoku() {
    var k = omez((performance.now() - skok.od) / skok.trvani, 0, 1);
    var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // plynulý rozjezd a dojezd
    window.scrollTo(0, skok.odY + (skok.cilY - skok.odY) * e);
    if (k >= 1) { skok = null; return false; }
    return true;
  }
  function zrusSkok() { skok = null; }

  function dalsiZastavka(smer) {
    var e = 0.004, i;
    if (smer > 0) { for (i = 0; i < zastavky.length; i++) if (zastavky[i] > t + e) return zastavky[i]; return 1; }
    for (i = zastavky.length - 1; i >= 0; i--) if (zastavky[i] < t - e) return zastavky[i];
    return 0;
  }

  function klavesa(ev) {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    var cil = ev.target, znacka = cil && cil.tagName;
    if (znacka === 'INPUT' || znacka === 'TEXTAREA' || znacka === 'SELECT' || (cil && cil.isContentEditable)) return;
    var k = ev.key;
    if (k === ' ' && (znacka === 'BUTTON' || znacka === 'A')) return;   // mezerník na tlačítku ho má stisknout
    if (znacka === 'VIDEO') return;                                      // přehrávač záznamu má vlastní klávesy
    // Pod filmem (v klasických sekcích) klávesy rolují stránkou jako obvykle.
    if (window.scrollY > soucetVah * vyska + 2) return;
    var dopredu = k === 'PageDown' || k === 'ArrowRight' || (k === ' ' && !ev.shiftKey);
    if (dopredu && t >= 0.999) return;                                   // film je na konci: pokračuje se dolů do obsahu
    if (dopredu) { ev.preventDefault(); skocNa(dalsiZastavka(1)); }
    else if (k === 'PageUp' || k === 'ArrowLeft' || (k === ' ' && ev.shiftKey)) { ev.preventDefault(); skocNa(dalsiZastavka(-1)); }
    else if (k === 'Home') { ev.preventDefault(); skocNa(0); }
    else if (k === 'End') { ev.preventDefault(); skocNa(1); }
  }

  /* ---------- Start ---------- */
  zvolRezim();
  koren.classList.add('scena-bezi');

  var cekaNaSnimek = false;
  window.addEventListener('scroll', function () {
    if (cekaNaSnimek) return;
    cekaNaSnimek = true;
    window.requestAnimationFrame(function () { cekaNaSnimek = false; aktualizuj(); });
  }, { passive: true });
  // Výšku scény hlásí ResizeObserver: poprvé hned po prvním rozvržení stránky, pak při každé změně.
  // Skript si tak rozvržení celé dlouhé stránky nevynucuje uprostřed vlastního běhu (to byla nejdelší
  // úloha při načtení). Starší prohlížeče bez něj měří samy při startu, resize a load.
  var maPozorovatele = 'ResizeObserver' in window;
  if (maPozorovatele) {
    new ResizeObserver(function (zaznamy) {
      var z = zaznamy[zaznamy.length - 1];
      prepocitej(z.contentRect ? z.contentRect.height : undefined);
    }).observe(scena);
  } else {
    window.addEventListener('resize', function () { prepocitej(); });
    window.addEventListener('load', function () { prepocitej(); });
  }
  var priZmene = function () { zvolRezim(); prepocitej(); };
  if (mqPohyb.addEventListener) { mqPohyb.addEventListener('change', priZmene); mqUzky.addEventListener('change', priZmene); }

  window.addEventListener('touchstart', prvniDotyk, { passive: true });
  window.addEventListener('click', prvniDotyk);
  window.addEventListener('wheel', zrusSkok, { passive: true });
  window.addEventListener('touchstart', zrusSkok, { passive: true });
  window.addEventListener('mousedown', zrusSkok);
  document.addEventListener('keydown', klavesa);

  skoky.forEach(function (b) {
    b.el.addEventListener('click', function () { skocNa(b.t); });
  });
  // Když klávesnice dojde na odkaz v okně, které není vidět, scéna na něj dojede.
  okna.forEach(function (o) {
    o.el.addEventListener('focusin', function () {
      if (o.pruhlednost < 1) skocNa(o.zastavka !== null ? o.zastavka : (o.od + o.doo) / 2);
    });
  });

  if (!maPozorovatele) prepocitej();

  /* ---------- Rozhraní pro kontrolu (čte ho jen kontrolní skript) ---------- */
  window.__scena = {
    zastavky: zastavky,
    stav: function () {
      return {
        t: t, rezim: rezim, vyska: vyska, soucetVah: soucetVah, bezi: !!smycka, skok: !!skok,
        useky: useky.map(function (u) {
          return { i: u.i, id: u.id, vaha: u.vaha, p: u.p, pruhlednost: u.pruhlednost, stav: u.stav, maKlip: u.maKlip, vDosahu: !!u.vDosahu,
                   cil: cilovyCas(u), cas: u.klip.currentTime, dohledava: u.klip.seeking, meritko: u.nahled.style.transform };
        }),
        okna: okna.map(function (o) { return { i: o.i, od: o.od, doo: o.doo, nabeh: o.nabeh, dobeh: o.dobeh, pruhlednost: o.pruhlednost }; }),
        konec: konec ? parseFloat(konec.style.opacity || 0) : 0,
        zavoj: zavojPr < 0 ? 0 : zavojPr
      };
    }
  };
})();
