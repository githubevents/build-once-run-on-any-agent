const stage = document.getElementById('stage');
const desk = stage && stage.querySelector('.desk');
const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const tilt = (nx = 0, ny = 0) => {
  if (!desk) return;
  desk.style.setProperty('--ry', nx * 5 + 'deg');
  desk.style.setProperty('--rx', -ny * 4 + 'deg');
  desk.style.setProperty('--tx', -nx * 10 + 'px');
  desk.style.setProperty('--ty', -ny * 8 + 'px');
};
if (desk) {
  stage.addEventListener('pointermove', (event) => {
    const dialogOpen = [...document.querySelectorAll('dialog')].some((dialog) => dialog.open);
    if (dialogOpen || (calm && calm.matches)) return tilt();
    const box = stage.getBoundingClientRect();
    tilt((event.clientX - box.left) / box.width - 0.5, (event.clientY - box.top) / box.height - 0.5);
  });
  stage.addEventListener('pointerleave', () => tilt());
}
document.querySelectorAll('[data-dialog]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    tilt();
    document.getElementById('dialog-' + link.dataset.dialog).showModal();
  });
});
document.querySelectorAll('[data-close]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    link.closest('dialog').close();
  });
});
for (const dialog of document.querySelectorAll('dialog')) {
  let backdropPress = false;
  dialog.addEventListener('pointerdown', (event) => { backdropPress = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && backdropPress) dialog.close();
    backdropPress = false;
  });
}
