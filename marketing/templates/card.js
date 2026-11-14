const data = window.__CARD__ ?? JSON.parse(new URLSearchParams(location.search).get('data') || 'null');
if (!data || typeof data.headline !== 'string' || !Array.isArray(data.bullets)) {
  throw new Error('Provide window.__CARD__ or ?data=encoded JSON with headline and bullets');
}
document.querySelector('h1').textContent = data.headline;
if (data.photo) {
  const img = new Image();
  img.src = data.photo;
  window.__photoReady = img.decode(); // renderer awaits this so the screenshot never misses the photo
  document.querySelector('#card').style.backgroundImage = `url("${data.photo}")`;
}
for (const bullet of data.bullets) {
  const item = document.createElement('li');
  const text = document.createElement('span');
  text.textContent = bullet;
  item.append(text);
  document.querySelector('ol').append(item);
}
