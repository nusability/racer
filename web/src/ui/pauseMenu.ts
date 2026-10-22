// Pause overlay for a running race. Returns a function that closes it.
import './pauseMenu.css';

export interface PauseActions {
  resume(): void;
  restart(): void;
  quit(): void;
}

export function showPauseMenu(root: HTMLElement, actions: PauseActions): () => void {
  const el = document.createElement('div');
  el.className = 'pause-overlay';
  el.innerHTML = `
    <div class="pause-panel">
      <h2>PAUSED</h2>
      <button id="pause_resume_button" class="pause-btn primary" aria-label="Resume">RESUME</button>
      <button id="pause_restart_button" class="pause-btn" aria-label="Restart race">RESTART</button>
      <button id="pause_quit_button" class="pause-btn" aria-label="Quit to menu">QUIT</button>
    </div>`;
  const bind = (id: string, fn: () => void) => {
    const b = el.querySelector<HTMLButtonElement>(`#${id}`);
    if (!b) throw new Error(`pause menu: missing #${id}`);
    b.addEventListener('pointerup', (e) => {
      e.preventDefault();
      fn();
    });
  };
  bind('pause_resume_button', actions.resume);
  bind('pause_restart_button', actions.restart);
  bind('pause_quit_button', actions.quit);
  root.appendChild(el);
  return () => el.remove();
}
