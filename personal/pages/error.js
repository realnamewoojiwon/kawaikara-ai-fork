const params = new URLSearchParams(location.search);
document.getElementById('host').textContent = params.get('host') || '';
document.getElementById('notice').textContent = '연결 오류 코드: ' + (params.get('code') || '알 수 없음');
for (const [button, action] of [['retry', 'retry'], ['browser', 'browser-current'], ['home', 'home']]) {
  document.getElementById(button).addEventListener('click', () => window.KAWAI_PERSONAL.action(action).catch(() => {
    document.getElementById('notice').textContent = '이 작업을 진행하지 못했습니다. 프로그램을 다시 실행해 주세요.';
  }));
}
