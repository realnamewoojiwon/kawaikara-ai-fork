(async () => {
  const notice = document.getElementById('notice');
  const showError = error => { notice.textContent = '열 수 없습니다. 전체 메뉴를 이용하거나 프로그램을 다시 실행해 주세요.'; console.error(error); };
  const services = await fetch('services.json').then(response => response.json());
  const container = document.getElementById('services');
  for (const group of [...new Set(services.map(s => s.group))]) {
    const section = document.createElement('section'); section.className = 'group';
    const heading = document.createElement('h3'); heading.textContent = group; section.append(heading);
    const grid = document.createElement('div'); grid.className = 'grid'; section.append(grid);
    for (const site of services.filter(s => s.group === group)) {
      const card = document.createElement('div'); card.className = 'card';
      const actions = document.createElement('div'); actions.className = 'actions';
      const open = document.createElement('button'); open.className = 'name';
      const logo = document.createElement('img'); logo.className = 'service-logo'; logo.src = site.logo; logo.alt = ''; logo.width = 36; logo.height = 36;
      const label = document.createElement('span'); label.textContent = site.name;
      open.append(logo, label);
      open.dataset.service = site.id;
      open.addEventListener('click', () => window.KAWAI_API.menu.select_menu_item('menu_' + (site.id === 'disneyplus' ? 'disney' : site.id)).catch(showError));
      const browser = document.createElement('button'); browser.className = 'open-browser'; browser.textContent = '브라우저로 열기 ↗';
      browser.setAttribute('aria-label', site.name + ' 기본 브라우저로 열기');
      browser.addEventListener('click', () => window.KAWAI_PERSONAL.action('browser', site.id).catch(showError));
      actions.append(open, browser); card.append(actions); grid.append(card);
    }
    container.append(section);
  }
  document.getElementById('menu').addEventListener('click', () => window.KAWAI_PERSONAL.action('menu').catch(showError));
  document.getElementById('extensions').addEventListener('click', () => window.KAWAI_PERSONAL.action('extensions').catch(showError));
  const checkStatus = async () => {
    const status = await window.KAWAI_PERSONAL.status();
    const installed = Object.values(status.components).some(c => c.title.includes('Widevine') && c.version);
    document.getElementById('ready').textContent = installed ? '영상 재생 구성 요소 준비됨' : '영상 구성 요소 다운로드 중';
  };
  await checkStatus();
  setInterval(() => checkStatus().catch(console.error), 5000);
})().catch(console.error);
