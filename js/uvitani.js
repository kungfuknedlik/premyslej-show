/* ==========================================================================
   Úvodní uvítání – krátká vstupní animace úvodní obrazovky (do 2 sekund).
   Film se vynoří z rozostření, claim naskočí po řádcích zespodu (modrá část
   o chvilku později), značka, partneři a kolejnice přijdou jako poslední.
   Rolování, dotyk nebo klávesa animaci okamžitě dokončí.
   Skrytý výchozí stav zapíná třída .uvitani-ceka z inline skriptu v hlavičce;
   při omezeném pohybu a bez JavaScriptu se nepřidá a stránka je rovnou hotová.
   ========================================================================== */
(function () {
  'use strict';
  var koren = document.documentElement;
  if (!koren.classList.contains('uvitani-ceka')) return;

  var claim = document.querySelector('.okno--uvod .claim');
  var puvodni = claim ? claim.innerHTML : '';
  var hotovo = false, casovac = 0;
  var UDALOSTI = ['scroll', 'wheel', 'touchstart', 'keydown', 'mousedown'];

  function dokonci() {
    if (hotovo) return;
    hotovo = true;
    window.clearTimeout(casovac);
    koren.classList.remove('uvitani-ceka', 'uvitani-bezi');
    if (claim) claim.innerHTML = puvodni;              // vrátí původní značky nadpisu
    UDALOSTI.forEach(function (u) { window.removeEventListener(u, dokonci); });
  }

  // Každé slovo dostane masku a zpoždění podle řádku, na kterém leží.
  function rozdelNaRadky() {
    if (!claim) return;
    var vety = Array.prototype.slice.call(claim.children);
    vety.forEach(function (veta) {
      var slova = veta.textContent.trim().split(/\s+/);
      veta.textContent = '';
      slova.forEach(function (s, i) {
        var maska = document.createElement('span');
        var slovo = document.createElement('span');
        maska.className = 'slovo';
        slovo.textContent = s;
        maska.appendChild(slovo);
        veta.appendChild(maska);
        if (i < slova.length - 1) veta.appendChild(document.createTextNode(' '));
      });
    });
    var radek = -1, posledniVrch = null;
    vety.forEach(function (veta, v) {
      Array.prototype.forEach.call(veta.querySelectorAll('.slovo'), function (maska) {
        var vrch = Math.round(maska.getBoundingClientRect().top);
        if (posledniVrch === null || Math.abs(vrch - posledniVrch) > 4) { radek++; posledniVrch = vrch; }
        // první věta od 250 ms, každý další řádek o 120 ms později, modrá věta navíc o 130 ms
        maska.firstChild.style.animationDelay = (250 + radek * 120 + (v > 0 ? 130 : 0)) + 'ms';
      });
    });
  }

  function spust() {
    if (hotovo) return;
    if (window.scrollY > 2) { dokonci(); return; }      // stránka se otevřela uprostřed letu
    rozdelNaRadky();
    koren.classList.add('uvitani-bezi');
    koren.classList.remove('uvitani-ceka');
    casovac = window.setTimeout(dokonci, 2000);
  }

  UDALOSTI.forEach(function (u) { window.addEventListener(u, dokonci, { passive: true }); });

  // Začne se, jakmile je načtené písmo (kvůli zalomení řádků), nejpozději za čtvrt sekundy.
  var pismo = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  var limit = new Promise(function (r) { window.setTimeout(r, 250); });
  Promise.race([pismo, limit]).then(function () { window.requestAnimationFrame(spust); });
})();
