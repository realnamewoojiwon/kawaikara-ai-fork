const api = window.KAWAI_EXTENSIONS;
const list = document.getElementById('list'), notice = document.getElementById('notice');
let busy = false;
function text(tag, value, className) { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; }
async function act(operation, id, value) {
  if (busy) return;
  busy = true; document.querySelectorAll('button,input').forEach(node => node.disabled = true); notice.textContent = '처리 중입니다…';
  try {
    const result = await api.manage(operation, id, value);
    notice.textContent = result?.canceled ? '' : result?.refreshPage ? '변경했습니다. 열려 있는 서비스 화면을 새로고침해 주세요.' : operation === 'install' ? '확장을 추가했습니다. 서비스 화면을 새로고침해 주세요.' : '';
  } catch (error) { notice.textContent = String(error.message).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
  finally { busy = false; await render(); }
}
function button(label, operation, item, enabled = true) { const node = text('button', label); node.disabled = !enabled || busy; node.addEventListener('click', () => act(operation, item.token)); return node; }
async function render() {
  const status = await api.manage('list'); list.replaceChildren();
  if (status.registryError) notice.textContent = status.registryError;
  document.getElementById('add').disabled = busy || !!status.registryError;
  if (!status.items.length) list.append(text('p', '아직 추가한 확장이 없습니다. 위의 ‘확장 폴더 추가’로 시작하세요.', 'empty'));
  for (const item of status.items) {
    const card = document.createElement('section'); card.className = 'extension'; card.dataset.token = item.token;
    card.append(text('h2', item.name), text('p', '버전 ' + item.version + ' · ' + (item.loaded ? '실행 중' : item.enabled ? '불러오기 실패' : '꺼짐'), 'meta'));
    const actions = document.createElement('div'); actions.className = 'actions';
    const toggle = document.createElement('label'); toggle.className = 'toggle';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = item.enabled; input.disabled = busy || !!status.registryError; input.setAttribute('aria-label', item.name + ' 켜기');
    input.addEventListener('change', () => act('enable', item.token, input.checked)); toggle.append(input, text('span', '사용'));
    actions.append(toggle, button('팝업 열기', 'popup', item, item.popup), button('설정 열기', 'options', item, item.options), button('다시 불러오기', 'reload', item, item.enabled), button('삭제', 'remove', item)); card.append(actions);
    if (item.error) card.append(text('p', item.error, 'error'));
    for (const warning of item.warnings) card.append(text('p', warning, 'warning'));
    const permissions = document.createElement('details'); permissions.append(text('summary', '요청 권한'), text('p', item.permissions.join(', ') || '추가 권한 없음')); card.append(permissions); list.append(card);
  }
}
document.getElementById('add').addEventListener('click', () => act('install'));
api.onChanged(() => { if (!busy) render().catch(error => notice.textContent = error.message); });
render().catch(error => notice.textContent = error.message);
