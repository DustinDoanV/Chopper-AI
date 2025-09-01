// State
const state = {
  symptoms: new Set(),
  chronic: new Set(),
  weather: null,
  coords: null,
  settings: { emergencyNumber: "000" }
};

// Step navigation + progress
const STEP_ORDER = [1,2,3,4];
function setProgress(step){
  const idx = STEP_ORDER.indexOf(Number(step));
  const pct = ((idx+1)/STEP_ORDER.length)*100;
  const bar = document.getElementById("progress");
  if (bar) bar.style.width = pct+"%";
  // sidebar stepper
  document.querySelectorAll(".stepper li").forEach(li=>li.classList.remove("active"));
  const li = document.querySelector(`.stepper li[data-step='${step}']`);
  if (li) li.classList.add("active");
  // tabs
  document.querySelectorAll(".steps .step").forEach(btn=>btn.classList.remove("active"));
  const tab = document.querySelector(`.steps .step[data-step='${step}']`);
  if (tab) tab.classList.add("active");
}

function goStep(n){
  document.querySelectorAll(".step-page").forEach(x=>x.classList.remove("show"));
  document.getElementById(`step-${n}`).classList.add("show");
  setProgress(n);
  window.scrollTo({top:0, behavior:"smooth"});
}

// Chip toggles
document.addEventListener("click", (e)=>{
  const next = e.target.dataset.next;
  const prev = e.target.dataset.prev;
  if (next) goStep(next);
  if (prev) goStep(prev);
  // clicks from sidebar steps
  const li = e.target.closest(".stepper li");
  if (li && li.dataset.step) goStep(li.dataset.step);
  // mobile tabs
  const stepBtn = e.target.closest(".steps .step");
  if (stepBtn && stepBtn.dataset.step) goStep(stepBtn.dataset.step);

  if (e.target.classList.contains("chip")){
    const t = e.target.dataset.token;
    if (state.symptoms.has(t)) { state.symptoms.delete(t); e.target.classList.remove("active"); }
    else { state.symptoms.add(t); e.target.classList.add("active"); }
  }
});

// Buttons in tabs
document.addEventListener("DOMContentLoaded", ()=>{
  document.querySelectorAll(".steps .step").forEach(b=>b.addEventListener("click", ()=>goStep(b.dataset.step)));
});

// Geolocation & geocode
async function onUseLocation(){
  const status = document.getElementById("locationStatus");
  if (!navigator.geolocation){ status.textContent = "Geolocation not supported."; return; }
  status.textContent = "Getting GPS location…";
  navigator.geolocation.getCurrentPosition(async pos => {
    state.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    status.textContent = `Using GPS: ${state.coords.lat.toFixed(4)}, ${state.coords.lon.toFixed(4)}`;
    await fetchWeatherForDuration();
  }, err => { status.textContent = "Location error: " + err.message; });
}

async function geocodePlace(q){
  const status = document.getElementById("locationStatus");
  status.textContent = "Searching location…";
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,{
      headers: { "Accept-Language": "en" }
    });
    const j = await r.json();
    if (!j.length){ status.textContent = "Place not found."; return; }
    state.coords = { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
    status.textContent = `Found: ${j[0].display_name}`;
    await fetchWeatherForDuration();
  }catch(e){ status.textContent = "Search error."; console.error(e); }
}

// Weather
function getDurationDays(){
  const d = Number((document.getElementById("duration").value || "").trim());
  return isNaN(d) || d < 1 ? 1 : Math.min(d, 7);
}

async function fetchWeatherForDuration(){
  const box = document.getElementById("weatherBox");
  if (!state.coords){ box.textContent = "No location yet."; return; }
  const days = getDurationDays();
  try{
    const lat = state.coords.lat, lon = state.coords.lon;
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m&daily=apparent_temperature_max,apparent_temperature_min,precipitation_sum&forecast_days=${days}`);
    const wj = await w.json();
    const aq = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=us_aqi&forecast_hours=${24*days}`);
    const aqj = await aq.json();
    // pollen best-effort
    let pollen_category = "unknown";
    try{
      const pl = await fetch(`https://pollen-api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=grass_pollen,tree_pollen,weed_pollen&forecast_days=${days}`);
      const plj = await pl.json();
      const g = plj?.hourly?.grass_pollen?.slice(0,24*days) || [];
      const t = plj?.hourly?.tree_pollen?.slice(0,24*days) || [];
      const wv = plj?.hourly?.weed_pollen?.slice(0,24*days) || [];
      const avg = (arr)=>arr.reduce((a,b)=>a+b,0)/(arr.length||1);
      const total = (avg(g)+avg(t)+avg(wv))/3;
      pollen_category = total >= 80 ? "high" : total >= 30 ? "moderate" : "low";
    }catch{}

    const aqi_values = aqj?.hourly?.us_aqi?.slice(0,24*days) || [];
    const aqi_avg = aqi_values.reduce((a,b)=>a+b,0)/(aqi_values.length||1);
    const aqi_category = isNaN(aqi_avg) ? "unknown" : (aqi_avg>=151?"high":aqi_avg>=51?"moderate":"low");

    const current = wj?.current || {};
    const daily = wj?.daily || {};
    state.weather = {
      temp: current.temperature_2m,
      apparent_temp: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      days,
      aqi: Math.round(aqi_avg)||null,
      aqi_category,
      pollen_category,
      daily
    };
    renderWeather(box, state.weather);
  }catch(e){
    console.error(e);
    box.textContent = "Weather unavailable.";
  }
}

function renderWeather(box, w){
  if (!w){ box.textContent = "No weather loaded."; return; }
  let out = `<div><strong>Tracking:</strong> ${w.days} day(s)</div>
  <div><strong>Current apparent temp:</strong> ${w.apparent_temp ?? "n/a"} °C</div>
  <div><strong>Humidity:</strong> ${w.humidity ?? "n/a"} %</div>
  <div><strong>Air quality (avg):</strong> ${w.aqi ?? "n/a"} (${w.aqi_category})</div>
  <div><strong>Pollen:</strong> ${w.pollen_category}</div>`;
  if (w.daily?.time){
    out += "<div class='small' style='margin-top:6px'><strong>Daily outlook:</strong></div>";
    out += "<ul>";
    for (let i=0;i<w.daily.time.length;i++){
      const d = w.daily.time[i];
      const hi = w.daily.apparent_temperature_max?.[i];
      const lo = w.daily.apparent_temperature_min?.[i];
      const pr = w.daily.precipitation_sum?.[i];
      out += `<li>${d}: feels ${lo}–${hi} °C, precip ${pr} mm</li>`;
    }
    out += "</ul>";
  }
  box.innerHTML = out;
}

// Red flags
function toCelsius(value, unit){
  if (value==null || isNaN(value)) return null;
  return unit==="F" ? (value-32)*5/9 : value;
}
function redFlagCheck(tokens, vitals){
  const t = (x)=>tokens.has(x);
  const reasons = [];
  if (t("chest_pain") && t("shortness_of_breath")) reasons.push("Chest pain with shortness of breath");
  if (t("seizures") || t("speech_difficulty") || t("memory_issues") || t("confusion") || t("vision_changes")) reasons.push("Neurologic concern");
  if (t("cough_blood") || (t("nose_bleed") && t("shortness_of_breath"))) reasons.push("Bleeding with breathing symptoms");
  if (reasons.length) return { level:"emergency_now", reasons };
  if (vitals.temp && vitals.temp >= 40) return { level:"urgent_today", reasons:["Very high fever (≥ 40°C)"] };
  if (t("shortness_of_breath")) return { level:"urgent_today", reasons:["Breathing difficulty"] };
  if (t("vomiting") && vitals.duration>=2) return { level:"urgent_today", reasons:["Persistent vomiting"] };
  return { level:"non_urgent", reasons:[] };
}

// Conditions + scoring
const CONDITIONS = [
  { id:"viral_uri", name:"Common cold", key:["runny_nose","sore_throat","cough_dry","blocked_nose"], support:["headache","fatigue"], advice:[
      "Rest and hydrate.","Use saline spray; warm showers or humidified air."
    ], monitor:["Fever > 48h","Breathing difficulty"], escalate:"See a GP if not improving after 3–5 days." },
  { id:"allergy", name:"Allergic rhinitis", key:["runny_nose","itchy","sneezing","light_sound_sensitivity"], support:["blocked_nose"], exclude:["fever"],
    advice:["Limit outdoor exposure when pollen is high.","Non-sedating antihistamines or saline rinses may help."],
    monitor:["Worsening wheeze or breathlessness"], escalate:"See a GP if persistent." },
  { id:"asthma", name:"Asthma flare", key:["shortness_of_breath","cough_dry","wheezing"], support:["chest_pain"], weather_links:["aqi_high","pollen_high","cold_air","heat_high"],
    advice:["Follow your asthma action plan.","Avoid triggers; consider staying indoors if air quality/pollen is poor."],
    monitor:["Need for reliever frequently"], escalate:"Seek urgent care if breathing worsens." },
  { id:"gastro", name:"Gastroenteritis", key:["diarrhea","vomiting","stomachache"], support:["nausea"], advice:["Small sips of oral rehydration solution.","Avoid alcohol and dairy until improved."], monitor:["Dehydration signs"], escalate:"See a clinician if unable to keep fluids down or >48h." },
  { id:"migraine", name:"Migraine", key:["headache","light_sound_sensitivity","nausea"], exclude:["speech_difficulty","seizures","confusion"], advice:["Rest in a dark, quiet room; hydrate."], monitor:["New or changing pattern"], escalate:"Seek care if severe or different from usual." }
];
function scoreConditions(tokens, context){
  const out = [];
  for (const c of CONDITIONS){
    let score=0; const why=[];
    (c.key||[]).forEach(k=>{ if (tokens.has(k)) { score+=2; why.push(k);} });
    (c.support||[]).forEach(s=>{ if (tokens.has(s)) { score+=1; why.push(s);} });
    (c.exclude||[]).forEach(ex=>{ if (tokens.has(ex)) score-=2; });
    if (c.weather_links && context.weather){
      if (c.weather_links.includes("aqi_high") && context.weather.aqi_category==="high") score+=1;
      if (c.weather_links.includes("pollen_high") && context.weather.pollen_category==="high") score+=1;
      if (c.weather_links.includes("heat_high") && (context.weather.daily?.apparent_temperature_max?.some(v=>v>=32))) score+=1;
      if (c.weather_links.includes("cold_air") && (context.weather.daily?.apparent_temperature_min?.some(v=>v<=8))) score+=1;
    }
    if (score>0){ out.push({ id:c.id, name:c.name, score, why, advice:c.advice, monitor:c.monitor||[], escalate:c.escalate||"If symptoms worsen, seek medical care."}); }
  }
  out.sort((a,b)=>b.score-a.score);
  const max = out.length?out[0].score:0;
  out.forEach(r=>{ const p = max? r.score/max : 0; r.band = p>=0.8?"higher": p>=0.5?"medium":"lower"; });
  return out.slice(0,5);
}

// Collect + vitals
function collectTokens(){
  const tokens = new Set([...state.symptoms]);
  const txt = (document.getElementById("freeText").value || "").toLowerCase();
  if (txt.includes("fever")) tokens.add("fever");
  if (txt.includes("wheeze")) tokens.add("wheezing");
  if (txt.includes("bleed")) tokens.add("cough_blood");
  const chronic = (document.getElementById("chronicText").value || "").toLowerCase();
  chronic.split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(x=>state.chronic.add(x));
  return tokens;
}
function getVitals(){
  const age = Number((document.getElementById("age").value||"").trim()) || null;
  const tempVal = Number((document.getElementById("temp").value||"").trim());
  const unit = document.getElementById("tempUnit").value;
  const tempC = isNaN(tempVal)? null : (unit==="F" ? (tempVal-32)*5/9 : tempVal);
  const duration = Number((document.getElementById("duration").value||"").trim()) || 0;
  return { age, temp: tempC, duration };
}

// Render outputs
function setTriageUI(level, reasons){
  const box = document.getElementById("triageLevel");
  box.className = "triage";
  let label = "";
  if (level==="emergency_now"){ label="EMERGENCY NOW"; box.classList.add("emergency"); }
  else if (level==="urgent_today"){ label="URGENT CARE TODAY"; box.classList.add("urgent"); }
  else if (level==="gp_24_48h"){ label="GP WITHIN 24–48 HOURS"; box.classList.add("gp"); }
  else { label="SELF-CARE / ROUTINE GP"; box.classList.add("selfcare"); }
  box.innerHTML = `<svg class="ico"><use href="#i-alert"/></svg><div>${label}</div>${reasons?.length?`<div class='small muted'>Reason: ${reasons.join(", ")}</div>`:""}`;
}
function renderConditions(list){
  const box = document.getElementById("topConditions");
  if (!list.length){ box.innerHTML = "<p>No clear match. Consider contacting a clinician.</p>"; return; }
  box.innerHTML = "<div class='section-title'><strong>Possible causes</strong></div>";
  list.forEach(c=>{
    const whyText = c.why.map(x=>x.replaceAll("_"," ")).join(", ");
    box.innerHTML += `<div class="condition"><div><strong>${c.name}</strong> — <em>${c.band}</em> likelihood</div>${c.why.length?`<div class="small muted">Because: ${whyText}</div>`:""}</div>`;
  });
}
function renderAdvice(list){
  const box = document.getElementById("actionsNow");
  box.innerHTML = list?.length ? "<div class='section-title'><strong>What to do now</strong></div><ul>"+list.map(a=>`<li>${a}</li>`).join("")+"</ul>" : "";
}
function renderMonitor(list){
  const box = document.getElementById("monitor");
  box.innerHTML = list?.length ? "<div class='section-title'><strong>Monitor for</strong></div><ul>"+list.map(a=>`<li>${a}</li>`).join("")+"</ul>" : "";
}
function renderEscalation(text){
  document.getElementById("escalation").innerHTML = "<div class='section-title'><strong>When to seek care</strong></div><p>"+(text||"")+"</p>";
}
function buildLocalLinks(){
  const box = document.getElementById("localLinks");
  if (!state.coords){ box.innerHTML = ""; return; }
  const { lat, lon } = state.coords;
  const maps = `https://www.google.com/maps/search/?api=1&query=clinic%20near%20me&center=${lat},${lon}`;
  box.innerHTML = `<div class='section-title'><strong>Next steps nearby</strong></div>
  <p><a target="_blank" href="${maps}">Find clinics/pharmacies near you</a></p>
  <p><a href="tel:${state.settings.emergencyNumber}">Call emergency (${state.settings.emergencyNumber})</a></p>`;
}

// Analyse
function analyze(){
  const vitals = getVitals();
  const tokens = collectTokens();
  const rf = redFlagCheck(tokens, vitals);
  goStep(4);
  if (rf.level === "emergency_now"){
    setTriageUI(rf.level, rf.reasons);
    renderConditions([]); renderAdvice(["Call your local emergency number now."]); renderMonitor([]); renderEscalation("Immediate medical attention recommended.");
    buildLocalLinks();
    return;
  }
  const results = scoreConditions(tokens, { weather: state.weather });
  let level = "selfcare";
  if (rf.level === "urgent_today") level = "urgent_today";
  else if (results.some(r=>r.id==="gastro")) level = "gp_24_48h";
  setTriageUI(level, rf.reasons);
  const top = results[0];
  renderConditions(results);
  renderAdvice(top?.advice || []);
  renderMonitor(top?.monitor || []);
  renderEscalation(top?.escalate || "If symptoms worsen, seek medical care.");
  buildLocalLinks();
}

// Wire up
document.addEventListener("DOMContentLoaded", ()=>{
  document.getElementById("useLocation")?.addEventListener("click", onUseLocation);
  document.getElementById("searchPlace")?.addEventListener("click", ()=>{
    const q = document.getElementById("place").value.trim();
    if (!q) return alert("Enter a location.");
    geocodePlace(q);
  });
  document.getElementById("analyze")?.addEventListener("click", analyze);
  setProgress(1);
});
