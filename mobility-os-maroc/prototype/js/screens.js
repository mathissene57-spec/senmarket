/* Navigation entre "écrans" d'une app mobile simulée dans un cadre téléphone unique. */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function (el) {
    el.classList.toggle("active", el.id === id);
  });
}

function setStars(container, count) {
  container.querySelectorAll(".star").forEach(function (el, i) {
    el.classList.toggle("filled", i < count);
  });
  container.dataset.value = count;
}
