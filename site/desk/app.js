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
