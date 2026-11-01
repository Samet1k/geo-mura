'use strict';
const $ = id => document.getElementById(id);
const categories = {canyon:'Шатқал',mountain:'Тау / жартас',cave:'Үңгір',outcrop:'Геоқима',lake:'Көл',waterfall:'Сарқырама',other:'Басқа'};
const icons = ['◈','▲','◎','◇','◆'];
let locations = [], selected = null, category = 'all', map, layer;
let toastTimer;
function notify(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function element(tag, text, className) { const e = document.createElement(tag); if(text !== undefined) e.textContent = text; if(className) e.className = className; return e; }
function validate(data) {
  if (!Array.isArray(data) || data.length > 10000) throw new Error('JSON: 10 000 нысаннан аспайтын массив қажет.');
  const ids = new Set();
  return data.map((item, index) => {
    if(!item || typeof item !== 'object') throw new Error(`${index + 1}: карточка пішімі қате.`);
    for(const field of ['id','name','region','description']) {
      if(typeof item[field] !== 'string' || !item[field].trim() || item[field].length > (field === 'description' ? 5000 : 120)) throw new Error(`${index + 1}: ${field} өрісін тексеріңіз.`);
    }
    if(ids.has(item.id)) throw new Error(`Қайталанған id: ${item.id}`); ids.add(item.id);
    if(!Object.hasOwn(categories,item.category) || !icons.includes(item.icon)) throw new Error(`${index + 1}: санат немесе белгіше қате.`);
    if(!Number.isFinite(item.lat) || item.lat < -90 || item.lat > 90 || !Number.isFinite(item.lng) || item.lng < -180 || item.lng > 180) throw new Error(`${index + 1}: координаттарды тексеріңіз.`);
    if(item.coordinateNote !== undefined && (typeof item.coordinateNote !== 'string' || item.coordinateNote.length > 2000)) throw new Error(`${index + 1}: координат ескертпесі қате.`);
    const sources = item.sources ?? [];
    if(!Array.isArray(sources) || sources.some(s => !s || typeof s.title !== 'string' || !s.title.trim() || typeof s.url !== 'string' || !/^https:\/\//i.test(s.url))) throw new Error(`${index + 1}: дереккөз пішімі қате.`);
    const images = item.images ?? [];
    if(!Array.isArray(images) || images.some(img => !img || typeof img.src !== 'string' || !/^images\/[a-z0-9-]+\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(img.src) || typeof img.alt !== 'string')) throw new Error(`${index + 1}: суреттер пішімі қате.`);
    return {id:item.id,name:item.name.trim(),category:item.category,icon:item.icon,region:item.region.trim(),description:item.description.trim(),lat:item.lat,lng:item.lng,demo:item.demo === true,coordinateNote:item.coordinateNote || '',sources,images};
  });
}
function visibleLocations() {
  const q = $('search').value.trim().toLocaleLowerCase('kk');
  return locations.filter(p => (category === 'all' || p.category === category) && `${p.name} ${p.region} ${p.description}`.toLocaleLowerCase('kk').includes(q));
}
function render() {
  const visible = visibleLocations();
  $('list').replaceChildren(); if(layer) layer.clearLayers();
  $('count').textContent = `${visible.length} / ${locations.length}`;
  for(const p of visible) {
    const card = element('button',undefined,`card${selected === p.id ? ' selected' : ''}`);
    card.append(element('span',p.icon,`symbol ${p.category}`));
    const info = element('span'); info.append(element('b',p.name),element('small',p.region));
    if(p.demo) info.append(element('span','ДЕМО · үлгі деректер','demo-badge'));
    card.append(info,element('span','↗','arrow')); card.onclick = () => select(p.id,true); $('list').append(card);
    if(layer) {
      const marker = L.marker([p.lat,p.lng],{title:p.name,alt:p.name,icon:L.divIcon({className:'marker',html:`<div class="pin"><span>${p.icon}</span></div>`,iconSize:[38,46],iconAnchor:[19,42]})});
      marker.bindTooltip(element('span',p.name)); marker.on('click', () => select(p.id,false)); marker.addTo(layer);
    }
  }
  if(!visible.length) $('list').append(element('p',locations.length ? 'Ештеңе табылмады. Іздеуді немесе санатты өзгертіңіз.' : 'Әзірге нысандар жоқ.','empty'));
  if(selected && !visible.some(p => p.id === selected)) { selected = null; $('detail').hidden = true; }
}
function photoCarousel(p) {
  const gallery = element('section',undefined,'gallery');
  gallery.setAttribute('aria-label',`${p.name}: фотогалерея`);
  gallery.setAttribute('aria-roledescription','карусель');
  gallery.tabIndex=0;
  const frame=element('div',undefined,'gallery-frame');
  const photo=element('img');photo.decoding='async';photo.draggable=false;
  const svgNS='http://www.w3.org/2000/svg';
  const cropped=document.createElementNS(svgNS,'svg');cropped.classList.add('cropped-photo');cropped.setAttribute('role','img');
  const croppedImage=document.createElementNS(svgNS,'image');cropped.append(croppedImage);cropped.hidden=true;
  const clip=document.createElementNS(svgNS,'clipPath');clip.id=`photo-clip-${p.id}`;
  const clipRect=document.createElementNS(svgNS,'rect');clip.append(clipRect);cropped.append(clip);
  croppedImage.setAttribute('clip-path',`url(#${clip.id})`);
  const error=element('span','Сурет жүктелмеді','gallery-error');error.hidden=true;
  photo.onerror=()=>{error.hidden=false;photo.hidden=true;};
  const controls=element('div',undefined,'gallery-controls');
  const prev=element('button','←');prev.type='button';prev.setAttribute('aria-label','Алдыңғы сурет');
  const next=element('button','→');next.type='button';next.setAttribute('aria-label','Келесі сурет');
  const count=element('span');count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
  let index=0;
  function show(step) {
    index=(index+step+p.images.length)%p.images.length;
    error.hidden=true;photo.hidden=false;
    photo.alt=p.images[index].alt;photo.src=p.images[index].src;
    const crop=p.images[index].crop;
    const validCrop=crop && ['x','y','width','height','originalWidth','originalHeight'].every(k=>Number.isFinite(crop[k])) && crop.width>0 && crop.height>0;
    cropped.style.display=validCrop?'block':'none';
    if(validCrop){
      photo.hidden=true;
      cropped.removeAttribute('hidden');
      cropped.setAttribute('viewBox',`${crop.x} ${crop.y} ${crop.width} ${crop.height}`);
      for(const key of ['x','y','width','height'])clipRect.setAttribute(key,crop[key]);
      cropped.setAttribute('aria-label',p.images[index].alt);
      croppedImage.setAttribute('width',crop.originalWidth);croppedImage.setAttribute('height',crop.originalHeight);
      croppedImage.setAttribute('href',p.images[index].src);
    }
    count.textContent=`${index+1} / ${p.images.length}`;
  }
  prev.onclick=()=>show(-1);next.onclick=()=>show(1);
  prev.disabled=next.disabled=p.images.length<2;
  gallery.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();show(e.key==='ArrowRight'?1:-1);}};
  let touch=null;
  frame.addEventListener('touchstart',e=>{touch=e.touches.length===1 ? {x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  frame.addEventListener('touchend',e=>{if(!touch)return;const dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy))show(dx<0?1:-1);touch=null;},{passive:true});
  frame.addEventListener('touchcancel',()=>{touch=null;});
  frame.append(photo,cropped,error);controls.append(prev,count,next);gallery.append(frame,controls);show(0);
  return gallery;
}
function select(id, fly) {
  const p = locations.find(p => p.id === id); if(!p) return;
  selected = id; render(); const panel = $('detail'); panel.replaceChildren(); panel.hidden = false; panel.scrollTop=0;
  const close = element('button','×','icon-button'); close.setAttribute('aria-label','Жабу'); close.onclick = () => { selected=null;panel.hidden=true;render(); };
  panel.append(close,element('span',p.icon,`symbol ${p.category}`),element('h2',p.name),element('div',`${categories[p.category]} / ${p.region}`,'meta'));
  if(p.images.length) panel.append(photoCarousel(p));
  if(p.demo) panel.append(element('p','ДЕМОНСТРАЦИЯ · нақты нысан деректері емес','demo-badge'));
  panel.append(element('p',p.description),element('div',`${p.lat.toFixed(5)}° N  /  ${p.lng.toFixed(5)}° E`,'coordinates'));
  if(p.coordinateNote) panel.append(element('p',p.coordinateNote,'coordinate-note'));
  if(p.sources.length) {
    const sources = element('div',undefined,'sources');
    sources.append(element('b','Дереккөздер'));
    for(const source of p.sources) {
      const link = element('a',source.title); link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';sources.append(link);
    }
    panel.append(sources);
  }
  if(fly && map) map.flyTo([p.lat,p.lng],7,{duration:.7});
}
for(const [value,label] of [['all','Барлығы'],...Object.entries(categories)]) {
  const b=element('button',label,value === 'all' ? 'active' : ''); b.setAttribute('aria-pressed',String(value === 'all'));
  b.onclick=()=>{category=value;for(const c of $('filters').children){c.classList.toggle('active',c===b);c.setAttribute('aria-pressed',String(c===b));}render();};$('filters').append(b);
}
$('search').oninput=render;
$('home').onclick=()=>map?.fitBounds([[40.5,46],[55.5,87.5]],{padding:[25,25]});
async function showCountryBorder() {
  try {
    const response=await fetch('./data/kazakhstan.geojson');
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const boundary=await response.json();
    const pane=map.createPane('countryBorder');pane.style.zIndex=350;pane.style.pointerEvents='none';
    const options={pane:'countryBorder',interactive:false,smoothFactor:.5};
    L.geoJSON(boundary,{...options,style:{color:'#ffffff',weight:7,opacity:.95,fill:false}}).addTo(map);
    L.geoJSON(boundary,{...options,style:{color:'#285b49',weight:4,opacity:1,fill:false},attribution:'Шекара: <a href="https://www.naturalearthdata.com/">Natural Earth</a>'}).addTo(map);
  } catch(error) {
    notify('Қазақстан шекарасы жүктелмеді. Бетті жаңартып көріңіз.');
  }
}
async function init(){
  if(location.protocol === 'file:') {
    const message = 'Сайтты start-site.cmd арқылы іске қосыңыз немесе Render / GitHub Pages мекенжайынан ашыңыз. Файлды тікелей ашқанда карта мен JSON жүктелмеуі мүмкін.';
    $('map-note').textContent = message;
    $('list').append(element('p',message,'empty'));
    $('count').textContent = '—';
    return;
  }
  if(typeof L!=='undefined'){
    map=L.map('map',{zoomControl:false,minZoom:3}).fitBounds([[40.5,46],[55.5,87.5]]);
    L.control.zoom({position:'topright'}).addTo(map);
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    let tileWarning=false;tiles.on('tileerror',()=>{if(!tileWarning){tileWarning=true;$('map-note').textContent='Карта суреттері жүктелмеді. Байланыс қатесі немесе карта серверінің шектеуі болуы мүмкін.';notify('Карта қабаты қолжетімсіз. Нысандар тізімі жұмыс істей береді.');}});
    layer=L.layerGroup().addTo(map);
    void showCountryBorder();
  }else{ $('map-note').textContent='Карта жүктелмеді. Интернет байланысын тексеріңіз.'; }
  try{
    const response=await fetch('./locations.json',{cache:'no-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    locations=validate(await response.json());
    render();
  }catch(error){$('list').append(element('p','locations.json ашылмады. Сайтты HTTP сервері арқылы іске қосып, деректер файлын тексеріңіз.','empty'));notify(`Деректерді оқу қатесі: ${error.message}`);}
}
init();
