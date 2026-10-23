// Without WebGL (or JavaScript), the desk falls back to the source photo with aligned SVG hotspots.
window.deskFallback = () => {
  const desk = document.querySelector('.desk');
  if (!desk || desk.querySelector('img.desk-photo')) return;
  const photo = document.createElement('img');
  photo.className = 'desk-photo';
  photo.src = 'assets/decal.jpg';
  photo.width = 1280;
  photo.height = 720;
  photo.draggable = false;
  photo.alt = desk.dataset.alt;
  desk.prepend(photo);
};
document.querySelectorAll('[data-dialog]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
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
