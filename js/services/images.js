/* Réduction des photos avant envoi : 2000 px au plus, JPEG qualité 0,82.
   Un fichier qui n'est pas une image (ou que le navigateur ne sait pas lire, ex. HEIC) est envoyé tel quel. */
window.GA = window.GA || {};

GA.images = (function () {
  const MAX = 2000, QUALITE = 0.82;

  function load(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('illisible')); };
      img.src = url;
    });
  }

  async function reduce(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const img = await load(file);
      const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      if (k === 1 && file.size < 800 * 1024) return file;
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', QUALITE));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }
  }

  return { reduce };
})();
