/* Thème blanc-marque partagé entre les 3 maquettes (Passager, Chauffeur, Dashboard).
   Le choix fait dans le dashboard Opérateur ("Marque") est lu ici pour prouver,
   en direct, que rethémer l'app ne demande aucun redéveloppement. */
(function () {
  var KEY = "mobilityos_demo_brand";

  function applyBrand(brand) {
    document.documentElement.setAttribute("data-brand", brand);
  }

  function currentBrand() {
    return localStorage.getItem(KEY) || "platform";
  }

  applyBrand(currentBrand());

  window.MobilityOSDemo = {
    setBrand: function (brand) {
      localStorage.setItem(KEY, brand);
      applyBrand(brand);
    },
    currentBrand: currentBrand
  };
})();
