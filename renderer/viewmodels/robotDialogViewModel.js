// The welcome robot's speech bubble, for people who do not program. It starts on a new, empty project
// (MapViewModel.welcome) and has two phases:
//   interview: questions about the idea, never about technology (strings.map.welcome.steps); the last step
//              recommends a stack in plain words (with an analogy on demand) and hands it to the agent.
//              Answers can be undone with "back"
//   coach:     tips that react to the project while it grows (first file, risky files, .gitignore, README),
//              until everything basic is in place and the person says goodbye
// The view only renders `bubble` and calls press(id) with the id of the clicked button.
import { Observable } from '../core/observable.js';
import { allFiles, baseName } from '../models/fileTree.js';
import { LEVEL_RANK } from '../models/securityModel.js';
import { strings } from '../i18n/es.js';

const W = strings.map.welcome;
const TIPS = W.tips;
const byId = Object.fromEntries(W.steps.map((s) => [s.id, s]));

// Questions on any path from the first step to the last one (every branch has the same depth)
const INTERVIEW_LENGTH = (() => {
  let n = 0;
  for (let step = W.steps[0]; step; step = byId[step.options[0].next]) n++;
  return n;
})();

const isRisk = (level) => level === 'red' || level === 'yellow';
// The stack the answers lead to (the last answer that names one)
const stackOf = (history) => W.stacks[history.findLast((a) => a.stack)?.stack] ?? W.stacks.site;
const OFF = { phase: 'off', stepId: 'start', history: [], explained: false, seen: [], collapsed: false, unread: false, bubble: null };

export class RobotDialogViewModel {
  #project;
  #security;
  #actions;
  #session = null;

  // `seq` changes every time the bubble shows something new (the view replays its entrance);
  // `seen`: coach tips already dismissed; `unread`: a new tip arrived while the bubble was collapsed
  store = new Observable({ ...OFF, seq: 0 });

  constructor({ mapViewModel, projectModel, securityModel, actions = {} }) {
    this.#project = projectModel;
    this.#security = securityModel;
    this.#actions = actions;

    mapViewModel.store.subscribe(({ status, session, welcome }) => {
      if (status !== 'ready') return this.#turnOff();
      if (welcome && (this.store.state.phase === 'off' || session !== this.#session)) {
        this.#session = session;
        return this.#show({ ...OFF, phase: 'interview' });
      }
      if (session !== this.#session) this.#turnOff();
    }, { immediate: true });
    projectModel.store.subscribe(() => this.#refreshCoach());
    securityModel.store.subscribe(() => this.#refreshCoach());
  }

  press(id) {
    const state = this.store.state;
    if (state.phase === 'off') return;
    if (id === 'close') return this.#turnOff();
    if (id === 'collapse') return this.store.set({ collapsed: true });
    if (id === 'expand') return this.store.set({ collapsed: false, unread: false });
    if (state.phase === 'interview') return this.#pressInterview(id);
    this.#pressCoach(id);
  }

  #pressInterview(id) {
    const { history, stepId } = this.store.state;
    if (id === 'skip') return this.#show({ phase: 'coach' });
    // Undo: "back" drops the last answer; tapping an answer chip ("rewind:i") goes back to that question
    const rewindTo = id === 'back' ? history.length - 1 : id.startsWith('rewind:') ? Number(id.slice(7)) : -1;
    if (rewindTo >= 0 && rewindTo < history.length) {
      return this.#show({ stepId: history[rewindTo].stepId, history: history.slice(0, rewindTo), explained: false });
    }
    if (id === 'back' || id.startsWith('rewind:')) return;
    const step = byId[stepId];
    const option = step.options[Number(id.replace('opt:', ''))];
    if (!option) return;
    if (option.next) {
      const answer = { stepId, question: step.question, chosen: option.label, stack: option.stack };
      return this.#show({ stepId: option.next, history: [...history, answer], explained: false });
    }

    // The recommendation step
    const stack = stackOf(history);
    if (option.action === 'explain') return this.#show({ explained: true });
    if (option.action === 'createFiles') this.#actions.askAgent?.(W.scaffoldPrompt(history, stack));
    if (option.action === 'talk') this.#actions.askAgent?.(W.talkPrompt(history, stack));
    this.#show({ phase: 'coach', collapsed: option.action === 'dismiss' });
  }

  #pressCoach(id) {
    const tip = this.store.state.bubble;
    if (id === 'next') return this.#show({ seen: [...this.store.state.seen, tip.id] });
    if (id === 'ask') return this.#actions.askAgent?.(tip.prompt);
    if (id === 'openChat') return this.#actions.openChat?.();
    if (id === 'repair') return this.#actions.repair?.(tip.path);
    if (id === 'locate') return this.#actions.locate?.(tip.path);
    // Back to the recommendation with the same answers, to change them
    if (id === 'reopen') return this.#show({ phase: 'interview', stepId: 'recommend', explained: false, collapsed: false });
    if (id === 'save') {
      this.#actions.saveProgress?.();
      return this.#show({ seen: [...this.store.state.seen, tip.id] });
    }
  }

  #refreshCoach() {
    if (this.store.state.phase === 'coach') this.#show({});
  }

  #turnOff() {
    if (this.store.state.phase !== 'off') this.store.set({ ...OFF, seq: this.store.state.seq + 1 });
  }

  // Applies the patch and recomputes the bubble; only a different bubble bumps seq
  #show(patch) {
    const next = { ...this.store.state, ...patch };
    const bubble = next.phase === 'interview' ? this.#question(next) : this.#tip(next);
    const previous = this.store.state.bubble;
    const changed = previous?.id !== bubble.id;
    // A new problem always opens the bubble; calmer news just lights the pill
    const alarm = changed && (bubble.tone === 'danger' || bubble.tone === 'warn');
    const collapsed = alarm ? false : next.collapsed;
    this.store.set({
      ...next,
      bubble,
      collapsed,
      unread: collapsed && (next.unread || (changed && patch.collapsed === undefined)),
      seq: changed ? this.store.state.seq + 1 : this.store.state.seq,
    });
  }

  #question({ stepId, history, explained }) {
    const step = byId[stepId];
    const base = {
      kind: 'question',
      tone: 'info',
      progress: { step: history.length + 1, of: INTERVIEW_LENGTH },
      answers: history.map((a) => a.chosen),
      canBack: history.length > 0,
    };
    const KIND = { createFiles: 'primary', dismiss: 'ghost' };
    const buttons = step.options
      .map((o, i) => ({ id: `opt:${i}`, label: o.label, kind: KIND[o.action] ?? 'option', action: o.action }))
      .filter((b) => !(explained && b.action === 'explain'))
      .map(({ action, ...b }) => b);

    if (stepId === 'recommend') {
      const stack = stackOf(history);
      return {
        ...base,
        id: `q:recommend:${stack.tech}${explained ? ':explained' : ''}`,
        kind: 'recommend',
        title: explained ? W.recommend.explainedTitle : W.recommend.title,
        text: explained ? stack.analogy : W.recommend.text(stack),
        stack: { inside: W.recommend.inside, tech: stack.tech, perks: stack.perks },
        buttons,
      };
    }
    return {
      ...base,
      id: `q:${stepId}`,
      title: step.title,
      text: step.question,
      hint: step.hint,
      buttons: [...buttons, ...(history.length ? [] : [{ id: 'skip', label: W.ui.skip, kind: 'ghost' }])],
    };
  }

  // The most useful tip for the project as it is now: risks first, then the basics
  #tip({ seen, history }) {
    const files = allFiles(this.#project.store.state.tree ?? []);
    const has = (re) => files.some((f) => !f.path.includes('/') && re.test(f.path));
    const tip = (id, tone, title, text, buttons, extra = {}) => ({ id, kind: 'tip', tone, title, text, buttons, ...extra });
    const next = { id: 'next', label: TIPS.next, kind: 'ghost' };

    const risk = files
      .map((f) => ({ path: f.path, ...this.#security.scoreOf(f.path) }))
      .filter((f) => isRisk(f.level) && !seen.includes(`risk:${f.path}:${f.level}`))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.path.localeCompare(b.path))[0];
    if (risk) {
      const reason = risk.reason || strings.security.reasons[risk.reasonKey] || '';
      return tip(`risk:${risk.path}:${risk.level}`, risk.level === 'red' ? 'danger' : 'warn',
        TIPS.risk.title[risk.level], TIPS.risk.text(risk.path, reason), [
          { id: 'repair', label: TIPS.risk.repair, kind: 'primary' },
          { id: 'locate', label: TIPS.risk.locate, kind: 'option' },
          next,
        ], { path: risk.path });
    }

    if (!files.length) {
      return tip('waiting', 'info', TIPS.waiting.title, TIPS.waiting.text, [
        { id: 'openChat', label: TIPS.waiting.ask, kind: 'option' },
        // Nothing was created yet, so the answers can still change (not after skipping the questions)
        ...(history.length ? [{ id: 'reopen', label: TIPS.waiting.change, kind: 'option' }] : []),
      ]);
    }
    if (!seen.includes('firstFile')) {
      return tip('firstFile', 'success', TIPS.firstFile.title, TIPS.firstFile.text(baseName(files[0].path)), [{ ...next, kind: 'primary' }]);
    }
    if (!seen.includes('gitignore') && !has(/^\.gitignore$/)) {
      return tip('gitignore', 'info', TIPS.gitignore.title, TIPS.gitignore.text,
        [{ id: 'ask', label: TIPS.gitignore.ask, kind: 'primary' }, next], { prompt: TIPS.gitignore.prompt });
    }
    if (!seen.includes('readme') && !has(/^readme(\.\w+)?$/i)) {
      return tip('readme', 'info', TIPS.readme.title, TIPS.readme.text,
        [{ id: 'ask', label: TIPS.readme.ask, kind: 'primary' }, next], { prompt: TIPS.readme.prompt });
    }
    if (!seen.includes('saveProgress')) {
      return tip('saveProgress', 'info', TIPS.saveProgress.title, TIPS.saveProgress.text,
        [{ id: 'save', label: TIPS.saveProgress.save, kind: 'primary' }, next]);
    }
    return tip('allSet', 'success', TIPS.allSet.title, TIPS.allSet.text, [{ id: 'close', label: TIPS.allSet.bye, kind: 'primary' }]);
  }
}
