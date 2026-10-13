import { AI_PROVIDER_DEFINITIONS } from "../shared/constants.mjs";
import { HTML_LANG, LANGUAGES, translate } from "./i18n.mjs";

const providers = AI_PROVIDER_DEFINITIONS.map((provider) => [provider.id, provider.name]);

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );
}

export function setupPage(session, returnOrigin, language = "en") {
  const say = (key, ...values) => translate(language, `setup.${key}`, ...values);
  const cards = providers
    .map(
      ([id, label]) =>
        `<article class="provider" data-provider="${id}"><header><span>${escapeHtml(label)}</span><b id="${id}-status">${say("client.checking")}</b></header><label>${say("apiKey")}<input id="${id}-key" type="password" autocomplete="off" placeholder="${say("keyPlaceholder")}" /></label><label>${say("model")}<input id="${id}-model" autocomplete="off" /></label><footer><button data-action="remove" class="secondary">${say("removeKey")}</button><button data-action="test" class="secondary">${say("testModel")}</button><button data-action="save">${say("save")}</button></footer></article>`,
    )
    .join("");
  // Inline JSON has to be unable to close the script element it sits in.
  const inline = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  const bootstrap = inline({
    session,
    returnOrigin,
    language,
    locale: HTML_LANG[language],
  });
  const client = inline(translate(language, "setup.client"));
  const languages = LANGUAGES.map(
    (item) =>
      `<a href="/setup?lang=${item}&amp;return=${encodeURIComponent(returnOrigin)}" lang="${HTML_LANG[item]}"${item === language ? ' aria-current="true"' : ""}>${item === "en" ? "EN" : "中文"}</a>`,
  ).join("");
  return `<!doctype html>
<html lang="${HTML_LANG[language]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${say("title")}</title>
<style>
:root{color-scheme:light;--ink:#18211d;--muted:#68756d;--line:#d9e2d6;--paper:#f7f9f3;--card:#fff;--accent:#adf064;--deep:#25342c;--warn:#9b4c2f}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(1060px,calc(100% - 32px));margin:48px auto 80px}.eyebrow{color:#667d58;font:13px ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;text-transform:uppercase}h1{max-width:760px;margin:12px 0 8px;font-size:clamp(36px,6vw,68px);line-height:1.02;letter-spacing:-.05em}h1 em{font-style:normal;color:#72964d}.lede{max-width:720px;color:var(--muted);font-size:18px}.notice{margin:24px 0;padding:14px 16px;border:1px solid #cddbc4;border-radius:12px;background:#f0f6e9;color:#4c6041}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:26px}.panel{padding:24px;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 12px 35px rgba(31,48,38,.05)}.wide{grid-column:1/-1}h2{margin:0 0 6px;font-size:22px}p{color:var(--muted)}label{display:grid;gap:6px;color:#536159;font-size:13px}input{width:100%;min-height:44px;padding:10px 12px;border:1px solid #cbd6c8;border-radius:9px;background:#fff;color:var(--ink);font:inherit}button{min-height:42px;padding:9px 15px;border:0;border-radius:9px;background:var(--accent);color:#172014;font:700 14px inherit;cursor:pointer}button.secondary{border:1px solid #ced7cc;background:#fff;color:#5c6961}button:disabled{opacity:.55;cursor:wait}.row{display:flex;gap:10px;align-items:end}.row label{flex:1}.provider-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.provider{padding:15px;border:1px solid #e0e6de;border-radius:12px;background:#fbfcf9}.provider header,.provider footer,.check{display:flex;justify-content:space-between;align-items:center;gap:10px}.provider header{margin-bottom:12px}.provider header span{font-weight:750}.provider header b,.check b{font-size:12px;color:var(--muted)}.provider header b.ok,.check b.ok{color:#4e7d35}.provider label+label{margin-top:9px}.provider footer{margin-top:12px;justify-content:flex-end}.checks{display:grid;gap:9px;margin-top:16px}.check{padding:12px;border:1px solid #e0e6de;border-radius:10px}.check span{display:grid}.check small{color:var(--muted)}.finish{display:flex;justify-content:space-between;align-items:center;gap:20px}.finish button{min-width:210px;min-height:50px;font-size:16px}.check select{min-height:42px;padding:8px 10px;border:1px solid #cbd6c8;border-radius:9px;background:#fff;color:var(--ink);font:inherit}.check .who{flex:1;min-width:0;overflow-wrap:anywhere}.message{min-height:24px;margin:16px 0 0;color:#4e7d35}.message.error{color:var(--warn)}@media(max-width:760px){main{margin-top:28px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.provider-grid{grid-template-columns:1fr}.row,.finish{align-items:stretch;flex-direction:column}.finish button{width:100%}}
.languages{float:right;display:flex;gap:4px;margin-top:-4px}.languages a{padding:4px 9px;border:1px solid var(--line);border-radius:7px;color:var(--muted);font-size:13px;text-decoration:none}.languages a[aria-current]{background:var(--deep);border-color:var(--deep);color:#fff}</style>
</head><body><main><nav class="languages" aria-label="${say("language")}">${languages}</nav><span class="eyebrow">${say("eyebrow")}</span><h1>${say("headingLead")}<em>${say("headingEm")}</em></h1><p class="lede">${say("lede")}</p><div class="notice">${say("notice")}</div>
<div class="grid"><section class="panel wide"><h2>${say("providersTitle")}</h2><p>${say("providersText")}</p><div class="provider-grid">${cards}</div></section>
<section class="panel"><h2>${say("vaultTitle")}</h2><p>${say("vaultText", "<strong>ScholarBuddy</strong>")}</p><div class="row"><label>${say("vaultPath")}<input id="vault" placeholder="${say("vaultPlaceholder")}" /></label><button id="choose-vault" class="secondary">${say("chooseFolder")}</button></div><button id="save-vault" style="margin-top:12px">${say("saveVault")}</button></section>
<section class="panel"><h2>${say("connectionsTitle")}</h2><p>${say("connectionsText")}</p><div class="checks"><div class="check"><span><strong>${say("zotero")}</strong><small>${say("zoteroDetail")}</small></span><b id="zotero-status">${say("client.checking")}</b></div><div class="check"><span><strong>${say("obsidian")}</strong><small>${say("obsidianDetail")}</small></span><b id="obsidian-status">${say("client.checking")}</b></div><div class="check"><span><strong>${say("calendar")}</strong><small>${say("calendarDetail")}</small></span><button id="test-calendar" class="secondary">${say("testPermission")}</button></div></div></section>
<section class="panel wide"><h2>${say("grantsTitle")}</h2><p>${say("grantsText")}</p><div id="grants" class="checks"></div><button id="revoke-all" class="secondary" style="margin-top:12px" hidden>${say("revokeAll")}</button></section>
<section class="panel wide finish"><div><h2>${say("finishTitle")}</h2><p>${say("finishText", escapeHtml(returnOrigin))}</p></div><button id="finish">${say("finish")}</button></section></div><p id="message" class="message" role="status"></p></main>
<script>
const bootstrap=${bootstrap};
const text=${client};
const fill=(template,values)=>template.replace(/\{(\w+)\}/g,(_,key)=>values[key]??"");
const providerIds=${JSON.stringify(providers.map(([id]) => id))};
const message=document.getElementById("message");
function say(text,error=false){message.textContent=text;message.classList.toggle("error",error)}
async function api(path,options={}){const headers=new Headers(options.headers||{});headers.set("X-ScholarBuddy-Setup",bootstrap.session);headers.set("Accept-Language",bootstrap.language);if(options.body)headers.set("Content-Type","application/json");const response=await fetch(path,{...options,headers});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||text.requestFailed);return body}
function status(id,connected,label){const node=document.getElementById(id);node.textContent=label||(connected?text.connected:text.setupNeeded);node.classList.toggle("ok",Boolean(connected))}
async function refresh(){try{const state=await api("/setup/state");document.getElementById("vault").value=state.obsidian.path||"";status("zotero-status",state.zotero.connected,state.zotero.connected?(state.zotero.version||text.connected):text.notDetected);status("obsidian-status",state.obsidian.connected);for(const id of providerIds){const item=state.providers[id];status(id+"-status",item.configured,item.configured?text.configured:text.notConfigured);document.getElementById(id+"-model").value=item.model||""}}catch(error){say(error.message,true)}}
for(const card of document.querySelectorAll(".provider")){const provider=card.dataset.provider;const apiKeyInput=document.getElementById(provider+"-key");const modelInput=document.getElementById(provider+"-model");const testButton=card.querySelector('[data-action="test"]');for(const input of [apiKeyInput,modelInput])input.addEventListener("input",()=>{testButton.textContent=text.testModel});testButton.addEventListener("click",async()=>{testButton.disabled=true;testButton.textContent=text.testing;try{const result=await api("/setup/test/provider",{method:"POST",body:JSON.stringify({provider,apiKey:apiKeyInput.value,model:modelInput.value})});testButton.textContent=text.available;say(fill(text.modelAvailable,{model:result.model}))}catch(error){testButton.textContent=text.tryAgain;say(error.message,true)}finally{testButton.disabled=false}});card.querySelector('[data-action="save"]').addEventListener("click",async()=>{try{await api("/setup/provider",{method:"POST",body:JSON.stringify({provider,apiKey:apiKeyInput.value,model:modelInput.value})});apiKeyInput.value="";say(text.providerSaved);await refresh()}catch(error){say(error.message,true)}});card.querySelector('[data-action="remove"]').addEventListener("click",async()=>{try{await api("/setup/provider",{method:"DELETE",body:JSON.stringify({provider})});say(text.keyRemoved);await refresh()}catch(error){say(error.message,true)}})}
document.getElementById("choose-vault").addEventListener("click",async()=>{try{const result=await api("/setup/vault-picker",{method:"POST",body:"{}"});document.getElementById("vault").value=result.path;say(text.folderSelected)}catch(error){say(error.message,true)}});
document.getElementById("save-vault").addEventListener("click",async()=>{try{await api("/setup/config",{method:"POST",body:JSON.stringify({vaultPath:document.getElementById("vault").value})});say(text.vaultSaved);await refresh()}catch(error){say(error.message,true)}});
document.getElementById("test-calendar").addEventListener("click",async(event)=>{const button=event.currentTarget;button.disabled=true;button.textContent=text.testing;try{await api("/setup/test/calendar",{method:"POST",body:"{}"});button.textContent=text.connected;say(text.calendarReady)}catch(error){button.textContent=text.tryAgain;say(error.message,true)}finally{button.disabled=false}});
const grantList=document.getElementById("grants");
const revokeAll=document.getElementById("revoke-all");
function day(value){return new Date(value).toLocaleDateString(bootstrap.locale,{year:"numeric",month:"short",day:"numeric"})}
function note(text){const node=document.createElement("small");node.textContent=text;return node}
function renderGrants(state){grantList.replaceChildren();revokeAll.hidden=!state.perSite||!state.grants.length;if(!state.perSite){grantList.append(note(text.fixedToken));return}if(!state.grants.length){grantList.append(note(text.noGrants));return}for(const grant of state.grants){const row=document.createElement("div");row.className="check";const who=document.createElement("span");who.className="who";const name=document.createElement("strong");name.textContent=grant.origin;who.append(name,note(fill(text.grantDates,{created:day(grant.createdAt),used:day(grant.lastUsedAt),ends:day(grant.expiresAt)})));const access=document.createElement("select");access.setAttribute("aria-label",fill(text.accessFor,{origin:name.textContent}));for(const [value,label] of [["full",text.readWrite],["read",text.readOnly]]){const option=document.createElement("option");option.value=value;option.textContent=label;access.append(option)}access.value=grant.access;access.addEventListener("change",()=>changeGrants("POST",{id:grant.id,access:access.value},text.accessUpdated));const revoke=document.createElement("button");revoke.className="secondary";revoke.textContent=text.revoke;revoke.addEventListener("click",()=>changeGrants("DELETE",{id:grant.id},text.pairAgain));row.append(who,access,revoke);grantList.append(row)}}
async function refreshGrants(){try{renderGrants(await api("/setup/grants"))}catch(error){say(error.message,true)}}
async function changeGrants(method,body,done){try{renderGrants(await api("/setup/grants",{method,body:JSON.stringify(body)}));say(done)}catch(error){say(error.message,true);await refreshGrants()}}
revokeAll.addEventListener("click",()=>changeGrants("DELETE",{all:true},text.allPairAgain));
document.getElementById("finish").addEventListener("click",async()=>{try{const result=await api("/setup/pair",{method:"POST",body:JSON.stringify({returnOrigin:bootstrap.returnOrigin})});location.href=result.url}catch(error){say(error.message,true)}});
refresh();
refreshGrants();
</script></body></html>`;
}
