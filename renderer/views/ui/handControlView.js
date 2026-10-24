// The hand button in the map controls and, while it is on, a small mirrored camera preview with what the
// hand is doing (or why the camera could not start).
import { strings } from '../../i18n/es.js';

export function createHandControlView({ handControlViewModel: vm, video }) {
  const button = document.getElementById('hand-control');
  const preview = document.getElementById('hand-preview');
  const status = preview.querySelector('.hand-status');
  preview.querySelector('.hand-video').append(video);
  const H = strings.hands;

  button.addEventListener('click', () => vm.toggle());

  vm.store.subscribe(({ status: s, error, hand, pinching, gesture }) => {
    button.setAttribute('aria-pressed', String(s === 'on' || s === 'starting'));
    preview.hidden = s === 'off';
    preview.classList.toggle('error', s === 'error');
    preview.classList.toggle('hand', hand);
    preview.classList.toggle('pinching', pinching);
    status.textContent = s === 'error' ? H.errors[error]
      : s === 'starting' ? H.starting
        : pinching ? H.pinching[gesture ?? 'grab']
          : hand ? H.open
            : H.noHand;
  }, { immediate: true });
}
