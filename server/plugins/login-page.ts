/**
 * Branded sign-in/sign-up document for the framework auth guard
 * (`loginHtml` on createAuthPlugin — full-document replacement; the
 * `macros` template is the first-party precedent for this seam).
 *
 * Design mirrors the marketing pages: the "cobalt stage" tokens from
 * `app/global.css` (.landing), Poppins/Inter self-hosted from /fonts, the
 * gold→coral ramp, and the pixel-art manatee. The page must stay
 * CDN-cacheable: no per-user server state — the signed-in check and the
 * return-path continuation both run client-side via the framework's
 * sign-in-journey inline script.
 *
 * Endpoints used (same ones the built-in page calls):
 *   POST /_agent-native/auth/login              { email, password }
 *   POST /_agent-native/auth/register           { email, password, callbackURL }
 *   GET  /_agent-native/auth/session
 *   POST /_agent-native/auth/ba/request-password-reset  { email, redirectTo }
 *   POST /_agent-native/auth/ba/sign-in/social  { provider, callbackURL } → { url }
 *
 * Social buttons render only for providers whose credentials exist at
 * server startup (same env vars Better Auth reads).
 *
 * Trade-off, accepted deliberately: replacing the document drops the
 * built-in page's i18n catalogue and the popup/desktop OAuth matrix
 * (social flows here always use redirects).
 */
import { signInJourneyInlineScript } from "@agent-native/core/shared";

const FEATURES = [
  "make a 12-slide deck from this memo, on our brand",
  "make a campaign set for the spring launch",
  "export this deck to Google Slides",
];

/** Pixel maps matching app/pages/landing/pixel-art.tsx. */
const MANATEE_A = [
  "....GGGGGG....",
  "..GGGGGGGGGG..",
  ".GGGGGGGGGGGG.",
  "GG.GGGGGGGGDG.",
  "GGGGGGGGGGGGGG",
  ".G.GGGGGGGGGG.",
  "....GGGGGGGG..",
  "......gg......",
];
const MANATEE_B = [
  "....GGGGGG....",
  "..GGGGGGGGGG..",
  ".G.GGGGGGGGGG.",
  "GG.GGGGGGGGDG.",
  "GGGGGGGGGGGGGG",
  "....GGGGGGGGG.",
  "......GGGGG...",
  ".......gg.....",
];
const PIXEL_COLORS: Record<string, string> = {
  G: "#FFC145",
  g: "#E89A2B",
  D: "#101433",
};

function pixelSvg(frame: string[], scale: number): string {
  const rects = frame
    .flatMap((row, y) =>
      [...row].map((char, x) => {
        const fill = PIXEL_COLORS[char];
        if (!fill) return "";
        return `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
      }),
    )
    .join("");
  const width = frame[0].length;
  const height = frame.length;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width * scale}" height="${height * scale}" shape-rendering="crispEdges">${rects}</svg>`;
}

export function buildLoginHtml(): string {
  const hasGitHub = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );
  const hasGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  const socialButtons = [
    hasGitHub &&
      `<button type="button" class="social" data-provider="github">Continue with GitHub</button>`,
    hasGoogle &&
      `<button type="button" class="social" data-provider="google">Continue with Google</button>`,
  ]
    .filter(Boolean)
    .join("\n");

  const features = FEATURES.map(
    (feature) => `<li><span aria-hidden="true">&gt;</span>${feature}</li>`,
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Manatki — Sign in</title>
<meta name="description" content="Sign in to Manatki, the free, open-source AI studio for decks and campaigns."/>
<meta property="og:title" content="Manatki — Sign in"/>
<meta property="og:description" content="Your next deck is one prompt away."/>
<style>
@font-face{font-family:'Poppins';font-weight:400;font-display:swap;src:url('/fonts/poppins-latin-400-normal.woff2') format('woff2')}
@font-face{font-family:'Poppins';font-weight:800;font-display:swap;src:url('/fonts/poppins-latin-800-normal.woff2') format('woff2')}
@font-face{font-family:'InterVariable';font-weight:100 900;font-display:swap;src:url('/fonts/inter-latin-wght-normal.woff2') format('woff2')}
:root{
  --ink:#0d2ba4;--raised:#0a2187;--bone:#f5f2e8;--accent:#ff5a2b;
  --accent-strong:#e84a1d;--gold:#ffc145;--on-accent:#101433;
  --muted:#aeb9e6;--line:#3a52c8;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'InterVariable',system-ui,sans-serif;background:var(--ink);color:var(--bone);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.wrap{display:grid;gap:56px;align-items:center;max-width:960px;width:100%}
@media(min-width:880px){.wrap{grid-template-columns:1fr 400px}}
.brand .mark{display:flex;align-items:center;gap:12px;font-family:'Poppins',sans-serif;font-weight:800;letter-spacing:.2em;text-transform:uppercase;font-size:15px}
.brand .mark img{height:22px;display:block}
.brand h1{font-family:'Poppins',sans-serif;font-weight:800;font-size:clamp(30px,4.5vw,44px);line-height:1.08;letter-spacing:-.02em;margin:26px 0 0}
.brand h1 .ramp{background:linear-gradient(90deg,var(--gold),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent}
.brand .tag{color:var(--muted);font-size:15px;line-height:1.6;margin-top:16px;max-width:38ch}
.brand ul{list-style:none;margin-top:26px;display:flex;flex-direction:column;gap:10px}
.brand li{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;letter-spacing:.04em;color:var(--bone)}
.brand li span{color:var(--gold);margin-right:10px}
.manatee{position:relative;display:inline-block;margin-top:34px;animation:bob 4.5s ease-in-out infinite}
.manatee .f2{position:absolute;inset:0;opacity:0;animation:fb .9s linear infinite}
.manatee .f1{animation:fa .9s linear infinite}
@keyframes fa{0%,49.9%{opacity:1}50%,100%{opacity:0}}
@keyframes fb{0%,49.9%{opacity:0}50%,100%{opacity:1}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
.card{background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:32px}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;background:var(--ink);border:1px solid var(--line);border-radius:9px;padding:4px;margin-bottom:22px}
.tabs button{border:0;background:transparent;color:var(--muted);font:600 13px 'InterVariable',sans-serif;padding:8px;border-radius:6px;cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--raised);color:var(--bone)}
label{display:block;font-size:13px;color:var(--muted);margin-bottom:6px}
input{width:100%;padding:11px 12px;background:var(--ink);border:1px solid var(--line);border-radius:8px;color:var(--bone);font-size:14px;margin-bottom:16px;outline:none}
input:focus{border-color:var(--gold)}
.cta{width:100%;padding:12px;background:var(--accent);color:var(--on-accent);border:none;border-radius:8px;font:600 14px 'InterVariable',sans-serif;cursor:pointer}
.cta:hover{background:var(--accent-strong)}
.cta:disabled{opacity:.55;cursor:not-allowed}
.social{width:100%;padding:11px;background:transparent;border:1px solid var(--line);border-radius:8px;color:var(--bone);font:500 14px 'InterVariable',sans-serif;cursor:pointer;margin-bottom:10px}
.social:hover{border-color:var(--muted)}
.divider{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin:16px 0}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--line)}
.aux{margin-top:14px;text-align:center;font-size:13px}
.aux a{color:var(--gold);text-decoration:none;cursor:pointer}
.aux a:hover{text-decoration:underline}
.msg{font-size:13px;margin-top:14px;display:none;line-height:1.5}
.msg.err{color:#ffb4a1}
.msg.ok{color:var(--gold)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
@media(prefers-reduced-motion:reduce){.manatee,.manatee .f1,.manatee .f2{animation:none}}
</style></head><body>
<div class="wrap">
  <div class="brand">
    <p class="mark"><img src="/manatki-icon.svg" alt=""/>Manatki</p>
    <h1>Your next deck is <span class="ramp">one prompt</span> away.</h1>
    <p class="tag">Free and open source. Bring your own OpenAI key — no plans, no seats, no bill.</p>
    <ul>
${features}
    </ul>
    <span class="manatee" aria-hidden="true"><span class="f1">${pixelSvg(MANATEE_A, 3)}</span><span class="f2">${pixelSvg(MANATEE_B, 3)}</span></span>
  </div>
  <div class="card">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-in" aria-selected="true">Sign in</button>
      <button type="button" role="tab" id="tab-up" aria-selected="false">Create account</button>
    </div>
${socialButtons}
${socialButtons ? '<div class="divider">or with email</div>' : ""}
    <form id="form">
      <label for="email">Email</label>
      <input type="email" id="email" required autocomplete="email" placeholder="you@example.com"/>
      <label for="password">Password</label>
      <input type="password" id="password" required autocomplete="current-password" minlength="8"/>
      <button type="submit" class="cta" id="submit">Sign in</button>
    </form>
    <p class="aux"><a id="forgot">Forgot your password?</a></p>
    <p class="msg" id="msg" role="status"></p>
  </div>
</div>
<script>${signInJourneyInlineScript()}</script>
<script>
(function(){
  function appBasePath(){var m='/_agent-native/';var p=window.location.pathname||'';var i=p.indexOf(m);if(i<=0)return '';return p.slice(0,i).replace(/\\/+$/,'')}
  function appPath(p){return appBasePath()+p}
  var journey=__anCreateSignInJourney(appBasePath()).journeyForLocation(window.location);
  var resume=journey.resumeHref||appPath('/decks');

  var mode='in';
  var tabIn=document.getElementById('tab-in');
  var tabUp=document.getElementById('tab-up');
  var submit=document.getElementById('submit');
  var msg=document.getElementById('msg');
  var password=document.getElementById('password');

  function setMode(next){
    mode=next;
    tabIn.setAttribute('aria-selected',String(next==='in'));
    tabUp.setAttribute('aria-selected',String(next==='up'));
    submit.textContent=next==='in'?'Sign in':'Create account';
    password.setAttribute('autocomplete',next==='in'?'current-password':'new-password');
    show('','');
  }
  tabIn.onclick=function(){setMode('in')};
  tabUp.onclick=function(){setMode('up')};

  function show(kind,text){
    msg.className='msg'+(kind?' '+kind:'');
    msg.textContent=text;
    msg.style.display=text?'block':'none';
  }

  // Already signed in? Head straight back to where the visitor came from.
  fetch(appPath('/_agent-native/auth/session'),{credentials:'same-origin'})
    .then(function(r){return r.ok?r.json():null})
    .then(function(d){if(d&&(d.user||d.email))window.location.href=resume})
    .catch(function(){});

  function post(path,body){
    return fetch(appPath(path),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'same-origin',
      body:JSON.stringify(body)
    });
  }

  document.getElementById('form').onsubmit=function(e){
    e.preventDefault();
    var email=document.getElementById('email').value;
    var pass=password.value;
    submit.disabled=true;show('','');
    var flow=mode==='in'
      ?post('/_agent-native/auth/login',{email:email,password:pass})
      :post('/_agent-native/auth/register',{email:email,password:pass,callbackURL:resume})
        .then(function(r){
          if(!r.ok)return r;
          return post('/_agent-native/auth/login',{email:email,password:pass});
        });
    flow.then(function(r){
      if(r.ok){window.location.href=resume;return null}
      return r.json().catch(function(){return {}}).then(function(d){
        if(mode==='up'&&r.status===403){
          show('ok','Account created — check your email to verify, then sign in.');
        }else{
          show('err',(d&&(d.error||d.message))||'That didn\\u2019t work — check your email and password.');
        }
      });
    }).catch(function(){show('err','Network error — try again.')})
      .finally(function(){submit.disabled=false});
  };

  document.getElementById('forgot').onclick=function(){
    var email=document.getElementById('email').value;
    if(!email){show('err','Enter your email above first, then tap "Forgot your password?" again.');return}
    post('/_agent-native/auth/ba/request-password-reset',{email:email,redirectTo:resume})
      .then(function(r){
        if(r.ok)show('ok','If that account exists, a reset link is on its way.');
        else show('err','Could not send a reset email — try again in a minute.');
      })
      .catch(function(){show('err','Network error — try again.')});
  };

  Array.prototype.forEach.call(document.querySelectorAll('.social'),function(button){
    button.onclick=function(){
      button.disabled=true;
      post('/_agent-native/auth/ba/sign-in/social',{provider:button.dataset.provider,callbackURL:resume})
        .then(function(r){return r.json()})
        .then(function(d){
          if(d&&d.url)window.location.href=d.url;
          else{button.disabled=false;show('err','Could not start the sign-in — try again.')}
        })
        .catch(function(){button.disabled=false;show('err','Network error — try again.')});
    };
  });
})();
</script>
</body></html>`;
}
