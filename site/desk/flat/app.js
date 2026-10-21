(() => {
  // Laptop and ideas note open panels; everything else is a plain link.
  document.querySelectorAll('[data-dialog]').forEach((btn) => {
    const dialog = document.getElementById('dialog-' + btn.dataset.dialog);
    if (!dialog) return;
    btn.addEventListener('click', (event) => { event.preventDefault(); dialog.showModal(); });
    // Click outside the panel closes it.
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  });
  document.querySelectorAll('[data-close]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      link.closest('dialog').close();
    });
  });

  // On portrait screens the desk pans sideways. Start centred on the laptop.
  const stage = document.getElementById('stage');
  const centre = () => {
    if (stage.scrollWidth > stage.clientWidth) {
      stage.scrollLeft = stage.scrollWidth * 0.495 - stage.clientWidth / 2;
    }
  };
  window.addEventListener('load', centre);
  window.addEventListener('resize', centre);
})();
